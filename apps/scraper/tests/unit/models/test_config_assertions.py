"""RED tests for test_assertions schema and validation.

These tests reference modules and functionality that do not exist yet,
ensuring they FAIL in the RED phase of TDD.

Task 1 of Scraper QA Integration: Extends scraper YAML config schema
with backward-compatible test_assertions field.
"""

from __future__ import annotations


def test_config_with_test_assertions_parses_from_yaml():
    """Config with test_assertions should round-trip through YAML parsing.

    This test uses the YAML parser which does not yet handle test_assertions,
    making it a RED test until the parser is updated.
    """
    from scrapers.parser.config_parser import parse_config

    yaml_content = """
schema_version: "1.0"
name: test-scraper
base_url: https://example.com
test_assertions:
  - sku: "123456789"
    expected:
      name: "Test Product"
      price: "$9.99"
  - sku: "987654321"
    expected:
      name: "Another Product"
"""
    config = parse_config(yaml_content)

    assert config.test_assertions is not None
    assert len(config.test_assertions) == 2
    assert config.test_assertions[0].sku == "123456789"
    assert config.test_assertions[0].expected["name"] == "Test Product"


def test_assertion_runner_validates_expected_fields():
    """AssertionRunner should validate scraper output against expected fields.

    Imports from scrapers.models.assertions which does not exist yet.
    """
    from scrapers.models.assertions import AssertionRunner

    runner = AssertionRunner()
    result = runner.validate(
        sku="123456789",
        expected={"name": "Test Product", "price": "$9.99"},
        actual={"name": "Test Product", "price": "$9.99", "image": "https://example.com/img.jpg"},
    )

    assert result.passed is True
    assert len(result.mismatches) == 0


def test_assertion_runner_detects_mismatches():
    """AssertionRunner should detect field value mismatches.

    Imports from scrapers.models.assertions which does not exist yet.
    """
    from scrapers.models.assertions import AssertionRunner

    runner = AssertionRunner()
    result = runner.validate(
        sku="123456789",
        expected={"name": "Expected Name", "price": "$9.99"},
        actual={"name": "Wrong Name", "price": "$14.99"},
    )

    assert result.passed is False
    assert len(result.mismatches) == 2
