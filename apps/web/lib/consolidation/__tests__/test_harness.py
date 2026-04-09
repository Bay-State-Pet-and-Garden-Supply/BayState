"""
AI Consolidation Test Harness

Test harness for Gemini and OpenAI API clients with:
- Retry logic with exponential backoff
- Batch consolidation testing
- Consistency metrics calculation
"""

import json
import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, TypedDict, cast

from google import genai
from openai import OpenAI

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class ProductFixture(TypedDict, total=False):
    sku: str
    name: str
    upc: str
    brand: str
    category: str
    price: str


def load_local_env() -> None:
    """Load API keys from apps/web/.env.local when process env is empty."""

    app_root = Path(__file__).resolve().parents[3]
    env_path = app_root / ".env.local"

    if not env_path.exists():
        return

    try:
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            env_key = key.strip()
            if env_key not in {"GEMINI_API_KEY", "OPENAI_API_KEY"}:
                continue

            cleaned_value = value.strip().strip('"').strip("'")
            if cleaned_value and not os.environ.get(env_key):
                os.environ[env_key] = cleaned_value
    except Exception as error:
        logger.warning("Failed to load local API keys from .env.local: %s", error)


def optional_string(value: object) -> str | None:
    return value if isinstance(value, str) else None


def build_baseline_user_prompt(product: ProductFixture) -> str:
    """Build the baseline user prompt from product fixture data."""

    return "\n".join(
        [
            "Consolidate this product into a canonical record:",
            f"SKU: {product.get('sku', 'Unknown')}",
            f"Name: {product.get('name', 'Unknown')}",
            f"Brand: {product.get('brand', 'Unknown')}",
            f"Category: {product.get('category', 'Unknown')}",
            f"Price: {product.get('price', 'Unknown')}",
        ]
    )


@dataclass
class ConsolidationResult:
    """Structured result from product consolidation."""

    brand: str | None = None
    category: str | None = None
    name: str | None = None
    raw_response: str | None = None
    response_time_ms: float = 0.0
    success: bool = False
    error: str | None = None


@dataclass
class ConsistencyMetrics:
    """Metrics for consolidation consistency."""

    brand_consistency: float = 0.0  # Percentage
    category_consistency: float = 0.0  # Percentage
    name_adherence: float = 0.0  # Percentage
    total_products: int = 0
    successful_calls: int = 0


class GeminiClient:
    """Gemini API client with retry logic and error handling."""

    def __init__(self, model: str = "gemini-3.1-flash-lite-preview"):
        load_local_env()
        self.api_key: str | None = os.environ.get("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY environment variable not set")
        self.client: genai.Client = genai.Client(api_key=self.api_key)
        self.model: str = model
        self.max_retries: int = 3
        self.base_delay: float = 1.0  # seconds

    def consolidate_product(
        self, system_prompt: str, user_prompt: str
    ) -> ConsolidationResult:
        """
        Call Gemini API to consolidate product information.

        Args:
            system_prompt: System prompt with instructions
            user_prompt: User prompt with product data

        Returns:
            ConsolidationResult with parsed response
        """
        start_time = time.time()

        for attempt in range(self.max_retries):
            try:
                logger.info(f"Gemini API call attempt {attempt + 1}/{self.max_retries}")

                response = self.client.models.generate_content(
                    model=self.model,
                    contents=user_prompt,
                    config={
                        "system_instruction": system_prompt,
                        "temperature": 0,
                    },
                )

                response_time_ms = (time.time() - start_time) * 1000
                raw_text = response.text if hasattr(response, "text") else str(response)
                raw_text = raw_text or ""

                result = self._parse_response(raw_text, response_time_ms)
                logger.info(
                    f"Gemini API success: {result.success}, response_time: {response_time_ms:.2f}ms"
                )
                return result

            except Exception as e:
                error_msg = str(e)
                logger.warning(f"Gemini API attempt {attempt + 1} failed: {error_msg}")

                if attempt < self.max_retries - 1:
                    retry_delay: float = self.base_delay * (2.0**attempt)
                    logger.info(f"Retrying in {retry_delay}s...")
                    time.sleep(retry_delay)
                else:
                    logger.error(f"Gemini API all retries exhausted: {error_msg}")
                    return ConsolidationResult(
                        success=False,
                        error=error_msg,
                        response_time_ms=(time.time() - start_time) * 1000,
                    )

        return ConsolidationResult(success=False, error="Max retries exceeded")

    def _parse_response(
        self, raw_text: str, response_time_ms: float
    ) -> ConsolidationResult:
        """Parse raw API response into structured result."""
        try:
            cleaned_text = raw_text.strip()

            if cleaned_text.startswith("```"):
                cleaned_text = cleaned_text.strip("`")
                if cleaned_text.lower().startswith("json"):
                    cleaned_text = cleaned_text[4:].strip()

            if cleaned_text.startswith("{"):
                payload = cast(dict[str, object], json.loads(cleaned_text))

                return ConsolidationResult(
                    brand=optional_string(payload.get("brand")),
                    category=optional_string(payload.get("category")),
                    name=optional_string(payload.get("name")),
                    raw_response=raw_text,
                    response_time_ms=response_time_ms,
                    success=True,
                )

            # Try to extract structured data from response
            brand = None
            category = None
            name = None

            lines = raw_text.strip().split("\n")
            for line in lines:
                line_lower = line.lower()
                if line_lower.startswith("brand:") or line_lower.startswith("brand -"):
                    brand = line.split(":", 1)[-1].strip()
                elif line_lower.startswith("category:") or line_lower.startswith(
                    "category -"
                ):
                    category = line.split(":", 1)[-1].strip()
                elif line_lower.startswith("name:") or line_lower.startswith("name -"):
                    name = line.split(":", 1)[-1].strip()

            # If no structured format found, use the whole response as name
            if not name and raw_text.strip():
                name = raw_text.strip()[:200]  # Truncate if too long

            return ConsolidationResult(
                brand=brand,
                category=category,
                name=name,
                raw_response=raw_text,
                response_time_ms=response_time_ms,
                success=True,
            )
        except Exception as e:
            return ConsolidationResult(
                raw_response=raw_text,
                response_time_ms=response_time_ms,
                success=False,
                error=f"Parse error: {str(e)}",
            )


class OpenAIClient:
    """OpenAI API client with retry logic and error handling."""

    def __init__(self, model: str = "gpt-4o-mini"):
        load_local_env()
        self.api_key: str | None = os.environ.get("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY environment variable not set")
        self.client: OpenAI = OpenAI(api_key=self.api_key)
        self.model: str = model
        self.max_retries: int = 3
        self.base_delay: float = 1.0  # seconds

    def consolidate_product(
        self, system_prompt: str, user_prompt: str
    ) -> ConsolidationResult:
        """
        Call OpenAI API to consolidate product information.

        Args:
            system_prompt: System prompt with instructions
            user_prompt: User prompt with product data

        Returns:
            ConsolidationResult with parsed response
        """
        start_time = time.time()

        for attempt in range(self.max_retries):
            try:
                logger.info(f"OpenAI API call attempt {attempt + 1}/{self.max_retries}")

                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0,
                )

                response_time_ms = (time.time() - start_time) * 1000
                raw_text = (
                    response.choices[0].message.content if response.choices else ""
                )
                raw_text = raw_text or ""

                result = self._parse_response(raw_text, response_time_ms)
                logger.info(
                    f"OpenAI API success: {result.success}, response_time: {response_time_ms:.2f}ms"
                )
                return result

            except Exception as e:
                error_msg = str(e)
                logger.warning(f"OpenAI API attempt {attempt + 1} failed: {error_msg}")

                # Check for rate limit
                if "rate_limit" in error_msg.lower() or "429" in error_msg:
                    if attempt < self.max_retries - 1:
                        rate_limit_delay: float = self.base_delay * (2.0**attempt)
                        logger.info(f"Rate limited, retrying in {rate_limit_delay}s...")
                        time.sleep(rate_limit_delay)
                        continue

                if attempt < self.max_retries - 1:
                    retry_delay: float = self.base_delay * (2.0**attempt)
                    logger.info(f"Retrying in {retry_delay}s...")
                    time.sleep(retry_delay)
                else:
                    logger.error(f"OpenAI API all retries exhausted: {error_msg}")
                    return ConsolidationResult(
                        success=False,
                        error=error_msg,
                        response_time_ms=(time.time() - start_time) * 1000,
                    )

        return ConsolidationResult(success=False, error="Max retries exceeded")

    def _parse_response(
        self, raw_text: str, response_time_ms: float
    ) -> ConsolidationResult:
        """Parse raw API response into structured result."""
        try:
            cleaned_text = raw_text.strip()

            if cleaned_text.startswith("```"):
                cleaned_text = cleaned_text.strip("`")
                if cleaned_text.lower().startswith("json"):
                    cleaned_text = cleaned_text[4:].strip()

            if cleaned_text.startswith("{"):
                payload = cast(dict[str, object], json.loads(cleaned_text))

                return ConsolidationResult(
                    brand=optional_string(payload.get("brand")),
                    category=optional_string(payload.get("category")),
                    name=optional_string(payload.get("name")),
                    raw_response=raw_text,
                    response_time_ms=response_time_ms,
                    success=True,
                )

            brand = None
            category = None
            name = None

            lines = raw_text.strip().split("\n")
            for line in lines:
                line_lower = line.lower()
                if line_lower.startswith("brand:") or line_lower.startswith("brand -"):
                    brand = line.split(":", 1)[-1].strip()
                elif line_lower.startswith("category:") or line_lower.startswith(
                    "category -"
                ):
                    category = line.split(":", 1)[-1].strip()
                elif line_lower.startswith("name:") or line_lower.startswith("name -"):
                    name = line.split(":", 1)[-1].strip()

            if not name and raw_text.strip():
                name = raw_text.strip()[:200]

            return ConsolidationResult(
                brand=brand,
                category=category,
                name=name,
                raw_response=raw_text,
                response_time_ms=response_time_ms,
                success=True,
            )
        except Exception as e:
            return ConsolidationResult(
                raw_response=raw_text,
                response_time_ms=response_time_ms,
                success=False,
                error=f"Parse error: {str(e)}",
            )


def batch_consolidation_test(
    product_group: list[ProductFixture],
    system_prompt: str,
    client_type: str = "gemini",
    user_prompt_builder: Callable[[ProductFixture], str] | None = None,
) -> list[ConsolidationResult]:
    """
    Test all products in a group with the specified API client.

    Args:
        product_group: List of product dicts with 'brand', 'category', 'name' keys
        system_prompt: System prompt for consolidation
        client_type: 'gemini' or 'openai'

    Returns:
        List of ConsolidationResult for each product
    """
    if client_type == "gemini":
        client = GeminiClient()
    elif client_type == "openai":
        client = OpenAIClient()
    else:
        raise ValueError(f"Unknown client type: {client_type}")

    results: list[ConsolidationResult] = []

    for i, product in enumerate(product_group):
        logger.info(f"Processing product {i + 1}/{len(product_group)}: {product}")

        user_prompt = (
            user_prompt_builder(product)
            if user_prompt_builder is not None
            else build_baseline_user_prompt(product)
        )

        result = client.consolidate_product(system_prompt, user_prompt)
        results.append(result)

        # Small delay between calls to avoid rate limits
        if i < len(product_group) - 1:
            time.sleep(0.5)

    return results


def calculate_consistency_metrics(
    results: list[ConsolidationResult],
) -> ConsistencyMetrics:
    """
    Calculate consistency metrics from consolidation results.

    Args:
        results: List of ConsolidationResult from batch testing

    Returns:
        ConsistencyMetrics with percentage scores
    """
    total = len(results)
    if total == 0:
        return ConsistencyMetrics()

    successful = [r for r in results if r.success]
    successful_count = len(successful)

    # Calculate brand consistency (how many have a brand value)
    brands_present = sum(1 for r in successful if r.brand)
    brand_consistency = (
        (brands_present / successful_count * 100) if successful_count > 0 else 0
    )

    # Calculate category consistency (how many have a category value)
    categories_present = sum(1 for r in successful if r.category)
    category_consistency = (
        categories_present / successful_count * 100 if successful_count > 0 else 0
    )

    # Calculate name adherence (how many have a name value)
    names_present = sum(1 for r in successful if r.name)
    name_adherence = (
        (names_present / successful_count * 100) if successful_count > 0 else 0
    )

    return ConsistencyMetrics(
        brand_consistency=round(brand_consistency, 2),
        category_consistency=round(category_consistency, 2),
        name_adherence=round(name_adherence, 2),
        total_products=total,
        successful_calls=successful_count,
    )


def verify_clients() -> tuple[bool, bool]:
    """
    Verify both API clients can connect and return responses.

    Returns:
        Tuple of (gemini_success, openai_success)
    """
    gemini_success = False
    openai_success = False

    # Test Gemini
    try:
        gemini = GeminiClient()
        result = gemini.consolidate_product(
            system_prompt="You are a product categorization assistant.",
            user_prompt="Test message",
        )
        gemini_success = result.success
        logger.info(
            f"Gemini client verification: {'PASS' if gemini_success else 'FAIL'}"
        )
    except Exception as e:
        logger.error(f"Gemini client verification failed: {e}")

    # Test OpenAI
    try:
        openai = OpenAIClient()
        result = openai.consolidate_product(
            system_prompt="You are a product categorization assistant.",
            user_prompt="Test message",
        )
        openai_success = result.success
        logger.info(
            f"OpenAI client verification: {'PASS' if openai_success else 'FAIL'}"
        )
    except Exception as e:
        logger.error(f"OpenAI client verification failed: {e}")

    return gemini_success, openai_success


if __name__ == "__main__":
    # Run verification when executed directly
    print("Verifying API clients...")
    gemini_ok, openai_ok = verify_clients()
    print(f"\nResults:")
    print(f"  Gemini: {'OK' if gemini_ok else 'FAILED'}")
    print(f"  OpenAI: {'OK' if openai_ok else 'FAILED'}")
