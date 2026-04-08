"""Brand and name matching utilities."""

import re
from difflib import SequenceMatcher
from typing import Optional
from urllib.parse import urlparse


class MatchingUtils:
    """Utilities for matching brands, names, and tokens."""

    # Stop words for tokenization
    STOP_WORDS = {
        "the",
        "and",
        "for",
        "with",
        "from",
        "that",
        "this",
        "your",
        "size",
        "pack",
        "inch",
        "inches",
        "oz",
        "lb",
        "lbs",
    }
    BRAND_PREFIX_EXCLUDED_TOKENS = {
        "new",
        "best",
        "premium",
        "organic",
        "product",
        "products",
        "cat",
        "dog",
        "pad",
        "pads",
        "litter",
        "box",
        "system",
        "count",
        "pack",
        "pk",
        "ct",
    }

    VARIANT_UNIT_ALIASES = {
        "count": "ct",
        "ct": "ct",
        "pack": "ct",
        "packs": "ct",
        "pk": "ct",
        "inch": "in",
        "inches": "in",
        "in": "in",
        "oz": "oz",
        "lb": "lb",
        "lbs": "lb",
    }

    @staticmethod
    def _normalize_dimension_token(first: str, second: str) -> str:
        """Normalize WxH dimension tokens so reversed dimensions still match."""
        try:
            first_value = int(first)
            second_value = int(second)
        except ValueError:
            return f"{first}x{second}"

        if first_value <= second_value:
            return f"{first}x{second}"
        return f"{second}x{first}"

    def normalize_token_text(self, value: Optional[str]) -> str:
        """Normalize text for token comparison."""
        text = (value or "").lower()
        return re.sub(r"[^a-z0-9]", "", text)

    def tokenize_keywords(self, value: Optional[str]) -> set[str]:
        """Extract keyword tokens from text."""
        tokens = re.findall(r"[a-z0-9]+", (value or "").lower())
        return {token for token in tokens if len(token) >= 3 and token not in self.STOP_WORDS}

    def extract_variant_tokens(self, value: Optional[str]) -> set[str]:
        """Extract normalized dimension/count/weight tokens for variant checks."""
        text = (value or "").lower()
        if not text:
            return set()

        normalized = re.sub(r"\b(inches?|inch)\b", "in", text)
        normalized = re.sub(r'(?<=\d)\s*["″”]\s*', " in ", normalized)
        tokens: set[str] = set()
        dimension_pattern = re.compile(r"(?<!\d)(\d{1,4})\s*(?:in)?\s*[x×]\s*(\d{1,4})(?:\s*in)?(?!\d)")
        normalized_without_dimensions = normalized

        for match in dimension_pattern.finditer(normalized):
            first, second = match.groups()
            tokens.add(self._normalize_dimension_token(first, second))
            normalized_without_dimensions = normalized_without_dimensions.replace(match.group(0), " ")

        for number, unit in re.findall(
            r"(?<!\d)(\d{1,4})\s*(ct|count|pack|packs|pk|lb|lbs|oz|inch|inches|in)\b",
            normalized_without_dimensions,
        ):
            normalized_unit = self.VARIANT_UNIT_ALIASES.get(unit, unit)
            tokens.add(f"{number}{normalized_unit}")

        return tokens

    def has_variant_token_overlap(self, expected_name: Optional[str], actual_text: Optional[str]) -> bool:
        """Check whether expected structured variant tokens appear in the actual text."""
        expected_variant_tokens = self.extract_variant_tokens(expected_name)
        if not expected_variant_tokens:
            return True

        actual_variant_tokens = self.extract_variant_tokens(actual_text)
        return len(expected_variant_tokens.intersection(actual_variant_tokens)) > 0

    @staticmethod
    def _variant_token_kind(token: str) -> str:
        if "x" in token:
            return "dimension"
        if token.endswith("ct"):
            return "count"
        if token.endswith("oz"):
            return "weight"
        if token.endswith("lb"):
            return "weight"
        if token.endswith("in"):
            return "length"
        return "other"

    def has_conflicting_variant_tokens(self, expected_name: Optional[str], actual_text: Optional[str]) -> bool:
        """Check whether actual text introduces a conflicting variant of the same kind."""
        expected_variant_tokens = self.extract_variant_tokens(expected_name)
        if not expected_variant_tokens:
            return False

        expected_by_kind = {
            self._variant_token_kind(token): token
            for token in expected_variant_tokens
        }
        actual_variant_tokens = self.extract_variant_tokens(actual_text)
        for token in actual_variant_tokens:
            token_kind = self._variant_token_kind(token)
            expected_token = expected_by_kind.get(token_kind)
            if expected_token and token != expected_token:
                return True

        return False

    def is_brand_match(
        self,
        expected_brand: Optional[str],
        actual_brand: Optional[str],
        source_url: str,
    ) -> bool:
        """Check if brands match."""
        if not expected_brand:
            return True

        expected_normalized = self.normalize_token_text(expected_brand)
        if not expected_normalized:
            return True

        actual_normalized = self.normalize_token_text(actual_brand)
        if actual_normalized and (expected_normalized in actual_normalized or actual_normalized in expected_normalized):
            return True

        source_domain = self.normalize_token_text(urlparse(source_url).netloc)
        if source_domain and expected_normalized in source_domain:
            return True

        return False

    def is_name_match(self, expected_name: Optional[str], actual_name: Optional[str]) -> bool:
        """Check if product names match."""
        if not expected_name:
            return True
        if not actual_name:
            return False

        expected_normalized = self.normalize_token_text(expected_name)
        actual_normalized = self.normalize_token_text(actual_name)

        if expected_normalized and actual_normalized and (expected_normalized in actual_normalized or actual_normalized in expected_normalized):
            return True

        expected_tokens = self.tokenize_keywords(expected_name)
        actual_tokens = self.tokenize_keywords(actual_name)
        if not expected_tokens or not actual_tokens:
            return False

        token_overlap = len(expected_tokens.intersection(actual_tokens)) / max(1, len(expected_tokens))
        ratio = SequenceMatcher(None, expected_normalized, actual_normalized).ratio()

        return token_overlap >= 0.35 or ratio >= 0.6

    def has_specific_token_overlap(
        self,
        expected_name: Optional[str],
        actual_name: Optional[str],
        brand: Optional[str],
    ) -> bool:
        """Check for specific token overlap excluding brand tokens."""
        expected_tokens = self.tokenize_keywords(expected_name)
        actual_tokens = self.tokenize_keywords(actual_name)
        brand_tokens = self.tokenize_keywords(brand)

        specific_expected = expected_tokens.difference(brand_tokens)
        if not specific_expected:
            return True

        return len(specific_expected.intersection(actual_tokens)) > 0

    def _format_brand_tokens(self, tokens: list[str]) -> str:
        return " ".join(token.upper() if token.isupper() and len(token) <= 4 else token.capitalize() for token in tokens)

    def _extract_brand_prefix(self, candidate_text: Optional[str], expected_tokens: set[str]) -> Optional[str]:
        tokens = re.findall(r"[a-z0-9]+", (candidate_text or "").lower())
        if not tokens or not expected_tokens:
            return None

        prefix_tokens: list[str] = []
        matched_expected_token = False
        for token in tokens:
            if token in expected_tokens:
                matched_expected_token = True
                break
            if token.isdigit():
                if prefix_tokens:
                    break
                continue
            prefix_tokens.append(token)
            if len(prefix_tokens) > 3:
                return None

        if not matched_expected_token or not prefix_tokens:
            return None

        if all(token in self.BRAND_PREFIX_EXCLUDED_TOKENS for token in prefix_tokens):
            return None

        return self._format_brand_tokens(prefix_tokens)

    def infer_brand_prefix(
        self,
        candidate_text: Optional[str],
        expected_name: Optional[str],
        source_url: str = "",
    ) -> Optional[str]:
        expected_tokens = {
            token
            for token in re.findall(r"[a-z0-9]+", (expected_name or "").lower())
            if token and not token.isdigit()
        }
        if not expected_tokens:
            return None

        brand_from_text = self._extract_brand_prefix(candidate_text, expected_tokens)
        if brand_from_text:
            return brand_from_text

        path_segments = [segment for segment in urlparse(source_url).path.split("/") if segment]
        if not path_segments:
            return None

        slug_text = path_segments[-1].replace("-", " ").replace("_", " ")
        return self._extract_brand_prefix(slug_text, expected_tokens)
