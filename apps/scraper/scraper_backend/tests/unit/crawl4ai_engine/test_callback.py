from __future__ import annotations

import hashlib
import hmac
import json
import socket
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import sys
from typing import cast, override


project_root = Path(__file__).parent.parent.parent.parent.parent
sys.path.insert(0, str(project_root / "scraper_backend"))
sys.path.insert(0, str(project_root / "scraper_backend" / "src"))

from src.crawl4ai_engine.callback import (  # noqa: E402
    CallbackClient,
    build_callback_headers,
    build_scraper_callback_payload,
    make_idempotency_key,
    sign_payload,
    transform_result,
)


def _expected_signature(secret: str, body: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def _open_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        host, port = cast(tuple[str, int], sock.getsockname())
        assert host == "127.0.0.1"
        return port


def test_transform_result_to_callback_record():
    record = transform_result(
        job_id="job-1",
        vendor="acme",
        sku="sku-123",
        result={
            "success": True,
            "name": "Widget",
            "price": "$9.99",
            "scraped_at": "2026-02-27T00:00:00Z",
        },
    )

    assert record.job_id == "job-1"
    assert record.vendor == "acme"
    assert record.sku == "sku-123"
    assert record.success is True
    assert record.error is None
    assert record.scraped_at == "2026-02-27T00:00:00Z"
    assert record.data == {"name": "Widget", "price": "$9.99"}


def test_build_payload_matches_callback_contract_shape():
    record = transform_result(
        job_id="job-1",
        vendor="acme",
        sku="sku-123",
        result={
            "success": False,
            "error": "product not found",
            "scraped_at": "2026-02-27T00:00:00Z",
        },
    )

    payload = build_scraper_callback_payload(
        job_id="job-1",
        runner_name="runner-1",
        vendor="acme",
        records=[record],
        lease_token="lease-123",
    )

    assert payload["job_id"] == "job-1"
    assert payload["status"] == "completed"
    assert payload["runner_name"] == "runner-1"
    assert payload["lease_token"] == "lease-123"
    results = payload["results"]
    assert isinstance(results, dict)

    assert cast(list[object], results["scrapers_run"]) == ["acme"]
    assert cast(int, results["skus_processed"]) == 1

    data = cast(dict[str, object], results["data"])
    assert "sku-123" in data
    sku_data = cast(dict[str, object], data["sku-123"])
    vendor_data = cast(dict[str, object], sku_data["acme"])
    assert vendor_data["success"] is False
    assert vendor_data["error"] == "product not found"


def test_signature_and_idempotency_are_deterministic():
    body = '{"job_id":"job-1","status":"completed"}'
    signature = sign_payload(body, "secret-123")
    assert signature == _expected_signature("secret-123", body)

    key_a = make_idempotency_key("job-1", "acme", "sku-123", "2026-02-27T00:00:00Z")
    key_b = make_idempotency_key("job-1", "acme", "sku-123", "2026-02-27T00:00:00Z")
    key_c = make_idempotency_key("job-1", "acme", "sku-123", "2026-02-27T00:00:01Z")

    assert key_a == key_b
    assert key_a != key_c


def test_callback_client_end_to_end_with_mock_server():
    captured: dict[str, str] = {}

    class MockCallbackHandler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802
            content_length = int(self.headers.get("Content-Length", "0"))
            body_bytes = self.rfile.read(content_length)
            captured["body"] = body_bytes.decode("utf-8")
            captured["signature"] = self.headers.get("X-Scraper-Signature", "")
            captured["idempotency"] = self.headers.get("Idempotency-Key", "")
            captured["api_key"] = self.headers.get("X-API-Key", "")

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            _ = self.wfile.write(b'{"success":true}')

        @override
        def log_message(self, format: str, *args: object) -> None:
            return

    port = _open_port()
    server = HTTPServer(("127.0.0.1", port), MockCallbackHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    try:
        payload = {
            "job_id": "job-1",
            "status": "completed",
            "runner_name": "runner-1",
            "results": {
                "data": {"sku-123": {"acme": {"name": "Widget"}}},
                "skus_processed": 1,
                "scrapers_run": ["acme"],
            },
        }
        body = json.dumps(payload, separators=(",", ":"), sort_keys=True)
        idempotency_key = make_idempotency_key("job-1", "acme", "sku-123", "2026-02-27T00:00:00Z")
        expected_headers = build_callback_headers(
            body=body,
            api_key="bsr_test",
            webhook_secret="secret-123",
            idempotency_key=idempotency_key,
        )

        client = CallbackClient(
            callback_url=f"http://127.0.0.1:{port}/api/admin/scraping/callback",
            api_key="bsr_test",
            webhook_secret="secret-123",
        )
        response = client.send(payload=payload, idempotency_key=idempotency_key)

        assert response.status_code == 200
        assert captured["body"] == body
        assert captured["api_key"] == "bsr_test"
        assert captured["idempotency"] == idempotency_key
        assert captured["signature"] == expected_headers["X-Scraper-Signature"]
    finally:
        server.shutdown()
        server.server_close()
        server_thread.join(timeout=2)
