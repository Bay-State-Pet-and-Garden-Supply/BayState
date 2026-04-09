"""
Unit tests for upc_utils module.
"""

import pytest
from scrapers.utils.upc_utils import (
    normalize_upc,
    validate_upc,
    validate_check_digit,
    calculate_check_digit,
    extract_prefix,
    get_upc_type,
    is_valid_upc,
    UPC_LENGTHS,
)


class TestNormalizeUpc:
    """Tests for normalize_upc function."""

    def test_preserves_leading_zeros(self):
        assert normalize_upc("01234567") == "01234567"

    def test_removes_dashes(self):
        assert normalize_upc("123-456-789-012") == "123456789012"

    def test_removes_spaces(self):
        assert normalize_upc("123 456 789 012") == "123456789012"

    def test_handles_none(self):
        assert normalize_upc(None) == ""

    def test_handles_integer(self):
        assert normalize_upc(123456789012) == "123456789012"


class TestValidateUpc:
    """Tests for validate_upc function."""

    def test_valid_gtin12_with_check_digit(self):
        valid, error = validate_upc('036000241457')
        assert valid is True
        assert error == ''

    def test_valid_gtin8(self):
        valid, error = validate_upc('01234572')
        assert valid is True
        assert error == ''

    def test_empty_string(self):
        valid, error = validate_upc("")
        assert valid is False
        assert error == "UPC is empty"

    def test_none_input(self):
        valid, error = validate_upc(None)
        assert valid is False
        assert error == "UPC is empty"

    def test_non_numeric(self):
        valid, error = validate_upc("abc123456789")
        assert valid is False
        assert error == "UPC contains non-numeric characters"

    def test_too_short(self):
        valid, error = validate_upc("123")
        assert valid is False
        assert "not valid" in error

    def test_invalid_length(self):
        valid, error = validate_upc("1234567890")
        assert valid is False
        assert "not valid" in error

    def test_invalid_check_digit(self):
        valid, error = validate_upc("072705115811")
        assert valid is False
        assert error == "UPC check digit is invalid"


class TestValidateCheckDigit:
    """Tests for validate_check_digit function."""

    def test_valid_gtin12(self):
        assert validate_check_digit('036000241457') is True

    def test_valid_gtin8(self):
        assert validate_check_digit('01234572') is True

    def test_valid_gtin14(self):
        assert validate_check_digit('14999999999996') is True

    def test_invalid_check_digit(self):
        assert validate_check_digit("072705115811") is False

    def test_too_short(self):
        assert validate_check_digit("1") is False


class TestCalculateCheckDigit:
    """Tests for calculate_check_digit function."""

    def test_gtin12_check_digit(self):
        assert calculate_check_digit('03600024145') == 7

    def test_gtin8_check_digit(self):
        assert calculate_check_digit('0123457') == 2

    def test_gtin13_check_digit(self):
        assert calculate_check_digit('590123412345') == 7

    def test_gtin14_check_digit(self):
        assert calculate_check_digit('1499999999999') == 6

    def test_empty_string(self):
        assert calculate_check_digit("") == -1

    def test_non_digit_string(self):
        assert calculate_check_digit("abc") == -1


class TestExtractPrefix:
    """Tests for extract_prefix function."""

    def test_extract_8_from_12(self):
        assert extract_prefix("123456789012", 8) == "12345678"

    def test_extract_10_from_12(self):
        assert extract_prefix("123456789012", 10) == "1234567890"

    def test_short_upc_returns_full(self):
        assert extract_prefix("123", 8) == "123"

    def test_normalizes_before_extracting(self):
        assert extract_prefix("123-456-789-012", 8) == "12345678"

    def test_default_length_is_8(self):
        assert extract_prefix("123456789012") == "12345678"


class TestGetUpcType:
    """Tests for get_upc_type function."""

    def test_gtin8(self):
        assert get_upc_type("01234567") == "GTIN-8"

    def test_gtin12(self):
        assert get_upc_type("123456789012") == "GTIN-12"

    def test_gtin13(self):
        assert get_upc_type("1234567890123") == "GTIN-13"

    def test_gtin14(self):
        assert get_upc_type("12345678901234") == "GTIN-14"

    def test_unknown_type(self):
        assert get_upc_type("123") is None

    def test_normalizes_before_type_check(self):
        assert get_upc_type("123-456-789-012") == "GTIN-12"


class TestIsValidUpc:
    """Tests for is_valid_upc function."""

    def test_valid_upc_returns_true(self):
        assert is_valid_upc('036000241457') is True

    def test_invalid_upc_returns_false(self):
        assert is_valid_upc("abc") is False

    def test_empty_returns_false(self):
        assert is_valid_upc("") is False


class TestUpcLengths:
    """Tests for UPC_LENGTHS constant."""

    def test_contains_expected_lengths(self):
        assert UPC_LENGTHS == [8, 12, 13, 14]
