"""
UPC validation and prefix extraction utilities.

Provides functions for validating, normalizing, and extracting prefixes from UPC codes
following GS1 GTIN standards (GTIN-8, GTIN-12, GTIN-13, GTIN-14).
"""

from typing import Optional, Tuple

UPC_LENGTHS = [8, 12, 13, 14]  # GTIN standards


def normalize_upc(upc: str) -> str:
    """
    Normalize UPC by removing dashes, spaces, and ensuring string format.
    Preserves leading zeros.
    """
    if upc is None:
        return ""
    # Remove dashes, spaces, and convert to string
    normalized = str(upc).replace("-", "").replace(" ", "").strip()
    return normalized


def validate_upc(upc: str) -> Tuple[bool, str]:
    """
    Validate UPC format.
    Returns (is_valid, error_message)
    """
    normalized = normalize_upc(upc)

    if not normalized:
        return False, "UPC is empty"

    if not normalized.isdigit():
        return False, "UPC contains non-numeric characters"

    length = len(normalized)
    if length not in UPC_LENGTHS:
        return False, f"UPC length {length} is not valid (must be one of {UPC_LENGTHS})"

    # Validate check digit
    if not validate_check_digit(normalized):
        return False, "UPC check digit is invalid"

    return True, ""


def validate_check_digit(upc: str) -> bool:
    """
    Validate UPC check digit using GS1 algorithm.
    """
    if len(upc) < 2:
        return False

    # Remove check digit
    data = upc[:-1]
    provided_check = int(upc[-1])

    # Calculate check digit
    calculated = calculate_check_digit(data)

    return calculated == provided_check


def calculate_check_digit(data: str) -> int:
    """
    Calculate GS1 check digit for UPC.
    Algorithm: sum of digits in odd positions * 3 + sum of digits in even positions,
    then find number that makes total multiple of 10.
    """
    if not data or not data.isdigit():
        return -1

    total = 0
    for i, digit in enumerate(reversed(data)):
        d = int(digit)
        if i % 2 == 0:
            total += d * 3  # Odd positions (from right, 1-indexed)
        else:
            total += d  # Even positions

    check_digit = (10 - (total % 10)) % 10
    return check_digit


def extract_prefix(upc: str, length: int = 8) -> str:
    """
    Extract prefix of specified length from UPC.
    Returns full UPC if shorter than requested length.
    """
    normalized = normalize_upc(upc)
    if len(normalized) >= length:
        return normalized[:length]
    return normalized


def get_upc_type(upc: str) -> Optional[str]:
    """
    Determine UPC/GTIN type based on length.
    Returns: 'GTIN-8', 'GTIN-12', 'GTIN-13', 'GTIN-14', or None
    """
    normalized = normalize_upc(upc)
    length_map = {8: "GTIN-8", 12: "GTIN-12", 13: "GTIN-13", 14: "GTIN-14"}
    return length_map.get(len(normalized))


def is_valid_upc(upc: str) -> bool:
    """Quick validation without error details."""
    valid, _ = validate_upc(upc)
    return valid
