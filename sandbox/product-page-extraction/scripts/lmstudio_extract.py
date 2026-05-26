#!/usr/bin/env python3
"""LM Studio structured extraction helper for the local sandbox."""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from common import ROOT, load_dotenv, validate_llm_base_url, write_json


def lmstudio_settings() -> dict[str, Any]:
    load_dotenv()
    base_url = (os.environ.get("LMSTUDIO_BASE_URL") or os.environ.get("LM_STUDIO_BASE_URL") or "http://localhost:1234/v1").rstrip("/")
    base_url = validate_llm_base_url(base_url)
    return {
        "base_url": base_url,
        "model": os.environ.get("LMSTUDIO_MODEL") or os.environ.get("LM_STUDIO_MODEL") or "",
        "api_key": os.environ.get("LMSTUDIO_API_KEY") or os.environ.get("LM_STUDIO_API_KEY") or "lm-studio",
        "timeout": int(os.environ.get("LMSTUDIO_TIMEOUT_SECONDS", "60")),
    }


def ping_lmstudio() -> dict[str, Any]:
    settings = lmstudio_settings()
    req = urllib.request.Request(f"{settings['base_url']}/models", headers={"Authorization": f"Bearer {settings['api_key']}"})
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return {"available": True, "models": json.loads(response.read().decode("utf-8"))}
    except Exception as exc:
        return {"available": False, "error": repr(exc), "base_url": settings["base_url"]}


def chat_json_with_metrics(system: str, user: str, *, temperature: float = 0, max_tokens: int = 1200) -> tuple[dict[str, Any], dict[str, Any]]:
    settings = lmstudio_settings()
    attempts = 0
    timeout_count = 0
    schema_validation_passed = False
    error: str | None = None
    finish_reason: str | None = None
    latency_ms = 0
    model_used = settings["model"]

    if not model_used:
        models = ping_lmstudio()
        if models.get("available"):
            data = models.get("models", {}).get("data", [])
            if data:
                model_used = data[0].get("id", "")
    if not model_used:
        metrics = {
            "model": model_used,
            "base_url": settings["base_url"],
            "latency_ms": 0,
            "attempts": 0,
            "timeout_count": 0,
            "schema_validation_passed": False,
            "error": "LMSTUDIO_MODEL is empty and no model could be inferred from /v1/models",
            "finish_reason": None,
        }
        raise RuntimeError(metrics["error"])

    schema = json.loads((ROOT / "schemas" / "product_llm.schema.json").read_text())
    payload = {
        "model": model_used,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system + "\nReturn exactly one valid JSON object. Use null for absent facts."},
            {"role": "user", "content": user},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "product_llm_extraction",
                "strict": True,
                "schema": schema,
            },
        },
    }

    start = time.monotonic()
    try:
        req = urllib.request.Request(
            f"{settings['base_url']}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {settings['api_key']}"},
            method="POST",
        )
        attempts = 1
        with urllib.request.urlopen(req, timeout=settings["timeout"]) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        latency_ms = int((time.monotonic() - start) * 1000)
        timeout_count = 1 if isinstance(exc, TimeoutError) else 0
        metrics = {
            "model": model_used,
            "base_url": settings["base_url"],
            "latency_ms": latency_ms,
            "attempts": attempts,
            "timeout_count": timeout_count,
            "schema_validation_passed": False,
            "error": repr(exc),
            "finish_reason": None,
        }
        raise RuntimeError(f"Could not reach LM Studio at {settings['base_url']}: {exc}") from exc

    latency_ms = int((time.monotonic() - start) * 1000)
    content = data["choices"][0]["message"]["content"].strip()
    finish_reason = data["choices"][0].get("finish_reason")

    # Strip markdown code fences (common for Gemma)
    if content.startswith("```"):
        lines = content.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        content = "\n".join(lines).strip()

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        start_i = content.find("{")
        end_i = content.rfind("}")
        if start_i >= 0 and end_i > start_i:
            parsed = json.loads(content[start_i : end_i + 1])
        else:
            metrics = {
                "model": model_used,
                "base_url": settings["base_url"],
                "latency_ms": latency_ms,
                "attempts": attempts,
                "timeout_count": timeout_count,
                "schema_validation_passed": False,
                "error": "Failed to parse JSON from LM Studio response",
                "finish_reason": finish_reason,
            }
            raise ValueError("Failed to parse JSON from LM Studio response")

    errors = sorted(Draft202012Validator(schema).iter_errors(parsed), key=lambda e: list(e.path))
    schema_validation_passed = len(errors) == 0
    if errors:
        first = errors[0]
        path = "/" + "/".join(str(p) for p in first.path)
        metrics = {
            "model": model_used,
            "base_url": settings["base_url"],
            "latency_ms": latency_ms,
            "attempts": attempts,
            "timeout_count": timeout_count,
            "schema_validation_passed": False,
            "error": f"Schema validation failed at {path}: {first.message}",
            "finish_reason": finish_reason,
        }
        raise ValueError(f"LM Studio output failed schema validation at {path}: {first.message}")

    metrics = {
        "model": model_used,
        "base_url": settings["base_url"],
        "latency_ms": latency_ms,
        "attempts": attempts,
        "timeout_count": timeout_count,
        "schema_validation_passed": True,
        "error": None,
        "finish_reason": finish_reason,
    }
    return parsed, metrics


def extract_product_fields(evidence: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    system = """You extract ecommerce product fields from official brand-page evidence.
Never invent values. Do not invent UPCs, SKUs, price, ingredients, images, or guaranteed analysis.
Every non-null field must be supported by title, H1, JSON-LD, meta, visible text, or image evidence."""
    schema = json.loads((ROOT / "schemas" / "product_llm.schema.json").read_text())
    user = json.dumps({"schema": schema, "evidence": evidence}, ensure_ascii=False)
    return chat_json_with_metrics(system, user)


def extract_product_fields_with_lm_studio(evidence: dict[str, Any]) -> dict[str, Any]:
    result, _ = extract_product_fields(evidence)
    return result


def chat_json(system: str, user: str, *, temperature: float = 0, max_tokens: int = 1200) -> dict[str, Any]:
    result, _ = chat_json_with_metrics(system, user, temperature=temperature, max_tokens=max_tokens)
    return result


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Extract product fields from an evidence JSON file using local LM Studio.")
    parser.add_argument("evidence", type=Path)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    result, metrics = extract_product_fields(json.loads(args.evidence.read_text()))
    output = {"result": result, "metrics": metrics}
    if args.out:
        write_json(args.out, output)
    print(json.dumps(output, indent=2, ensure_ascii=False))
