"""Tests for crawl4ai transpiler (YAML parser and schema generator)."""

import pytest
from unittest.mock import patch

from engine.transpiler.yaml_parser import (
    YAMLConfigParser,
    ParsedYAMLConfig,
    SelectorField,
    UnsupportedFeature,
)
from engine.transpiler.schema_generator import YAMLToCrawl4AI


class TestYAMLConfigParser:
    """Test suite for YAMLConfigParser."""

    @pytest.fixture
    def parser(self):
        """Create parser instance."""
        return YAMLConfigParser()

    def test_parse_dict_basic(self, parser):
        """Test parsing basic YAML config."""
        config = {
            "name": "test-scraper",
            "base_url": "https://example.com",
            "selectors": [
                {"name": "title", "selector": "h1", "attribute": "text"},
                {"name": "price", "selector": ".price"},
            ],
        }

        result = parser.parse_dict(config)

        assert result.name == "test-scraper"
        assert result.base_url == "https://example.com"
        assert len(result.selectors) == 2
        assert result.selectors[0].name == "title"
        assert result.selectors[0].selector == "h1"

    def test_parse_dict_with_base_selector(self, parser):
        """Test parsing with base selector."""
        config = {
            "name": "test",
            "selectors": {
                "base": ".product-container",
                "fields": [
                    {"name": "title", "selector": "h1"},
                ],
            },
        }

        result = parser.parse_dict(config)

        assert result.base_selector == ".product-container"

    def test_parse_dict_selectors_as_mapping(self, parser):
        """Test parsing selectors as mapping."""
        config = {
            "name": "test",
            "selectors": {
                "title": {"selector": "h1", "attribute": "text"},
                "price": ".price",
            },
        }

        result = parser.parse_dict(config)

        assert len(result.selectors) == 2

    def test_parse_dict_selectors_as_string_value(self, parser):
        """Test parsing selector with string value becomes simple selector."""
        config = {
            "name": "test",
            "selectors": {
                "title": "h1",
            },
        }

        result = parser.parse_dict(config)

        assert result.selectors[0].name == "title"
        assert result.selectors[0].selector == "h1"

    def test_parse_dict_with_nested_fields(self, parser):
        """Test parsing nested fields."""
        config = {
            "name": "test",
            "selectors": [
                {
                    "name": "product",
                    "selector": ".product",
                    "fields": [
                        {"name": "title", "selector": "h2"},
                        {"name": "price", "selector": ".price"},
                    ],
                }
            ],
        }

        result = parser.parse_dict(config)

        assert len(result.selectors) == 1
        assert len(result.selectors[0].children) == 2
        assert result.selectors[0].children[0].name == "title"

    def test_parse_dict_no_selectors(self, parser):
        """Test parsing config with no selectors."""
        config = {
            "name": "test",
            "base_url": "https://example.com",
        }

        result = parser.parse_dict(config)

        assert len(result.selectors) == 0
        assert len(result.unsupported) > 0

    def test_parse_file_not_found(self, parser):
        """Test parsing non-existent file raises error."""
        with pytest.raises(FileNotFoundError):
            parser.parse_file("/nonexistent/path.yaml")

    def test_unsupported_agentic_scraper_type(self, parser):
        """Test agentic scraper type flagged as unsupported."""
        config = {
            "name": "test",
            "scraper_type": "agentic",
        }

        result = parser.parse_dict(config)

        unsupported_paths = [u.path for u in result.unsupported]
        assert "scraper_type" in unsupported_paths

    def test_unsupported_ai_config(self, parser):
        """Test ai_config flagged as unsupported."""
        config = {
            "name": "test",
            "ai_config": {"model": "gpt-4"},
        }

        result = parser.parse_dict(config)

        unsupported_paths = [u.path for u in result.unsupported]
        assert "ai_config" in unsupported_paths

    def test_unsupported_login(self, parser):
        """Test login flagged as unsupported."""
        config = {
            "name": "test",
            "login": {"username": "user", "password": "pass"},
        }

        result = parser.parse_dict(config)

        unsupported_paths = [u.path for u in result.unsupported]
        assert "login" in unsupported_paths

    def test_unsupported_workflow_action(self, parser):
        """Test unsupported workflow action flagged."""
        config = {
            "name": "test",
            "workflows": [{"action": "ai_extract"}],
        }

        result = parser.parse_dict(config)

        assert len(result.unsupported) > 0


class TestSelectorField:
    """Test suite for SelectorField dataclass."""

    def test_create_simple_field(self):
        """Test creating simple selector field."""
        field = SelectorField(name="title", selector="h1")

        assert field.name == "title"
        assert field.selector == "h1"
        assert field.selector_type == "css"
        assert field.value_type == "text"

    def test_create_xpath_field(self):
        """Test creating XPath selector field."""
        field = SelectorField(name="title", selector="//h1", selector_type="xpath")

        assert field.selector_type == "xpath"

    def test_create_with_attribute(self):
        """Test creating field with attribute."""
        field = SelectorField(
            name="price",
            selector=".price",
            value_type="attribute",
            attribute="data-price",
        )

        assert field.attribute == "data-price"

    def test_create_with_children(self):
        """Test creating field with children."""
        child = SelectorField(name="child", selector=".child")
        field = SelectorField(name="parent", selector=".parent", children=[child])

        assert len(field.children) == 1
        assert field.children[0].name == "child"


class TestUnsupportedFeature:
    """Test suite for UnsupportedFeature dataclass."""

    def test_create_unsupported_feature(self):
        """Test creating unsupported feature."""
        feature = UnsupportedFeature(path="selectors", reason="No fields found")

        assert feature.path == "selectors"
        assert feature.reason == "No fields found"

    def test_create_with_value(self):
        """Test creating with value."""
        feature = UnsupportedFeature(path="field", reason="Invalid", value={"key": "val"})

        assert feature.value == {"key": "val"}


class TestYAMLToCrawl4AI:
    """Test suite for YAMLToCrawl4AI transpiler."""

    @pytest.fixture
    def transpiler(self):
        """Create transpiler instance."""
        return YAMLToCrawl4AI()

    def test_transpile_simple_config(self, transpiler):
        """Test transpiling simple config."""
        with patch.object(transpiler.parser, "parse_dict") as mock_parse:
            mock_parse.return_value = ParsedYAMLConfig(
                name="test",
                base_url="https://example.com",
                base_selector=".container",
                selectors=[
                    SelectorField(name="title", selector="h1", selector_type="css", value_type="text"),
                ],
                unsupported=[],
                raw_config={},
            )

            result = transpiler._build_schema_payload(mock_parse({}))

            assert result["name"] == "test"
            assert result["baseSelector"] == ".container"
            assert len(result["fields"]) == 1

    def test_transpile_with_unsupported(self, transpiler):
        """Test transpiling with unsupported features."""
        with patch.object(transpiler.parser, "parse_dict") as mock_parse:
            mock_parse.return_value = ParsedYAMLConfig(
                name="test",
                base_url=None,
                base_selector=None,
                selectors=[
                    SelectorField(name="title", selector="h1"),
                ],
                unsupported=[
                    UnsupportedFeature(path="login", reason="Not supported"),
                ],
                raw_config={},
            )

            result = transpiler._build_schema_payload(mock_parse({}))

            assert result["metadata"]["manual_review_required"] is True
            assert len(result["metadata"]["unsupported"]) == 1

    def test_transpile_to_python(self, transpiler):
        """Test transpiling to Python code."""
        with patch.object(transpiler.parser, "parse_file") as mock_parse:
            mock_parse.return_value = ParsedYAMLConfig(
                name="test",
                base_url=None,
                base_selector=None,
                selectors=[],
                unsupported=[],
                raw_config={},
            )

            code = transpiler.transpile_to_python("/fake/path.yaml")

            assert "from __future__ import annotations" in code
            assert "CRAWL4AI_SCHEMA" in code

    def test_transpile_to_python_with_output_path(self, transpiler, tmp_path):
        """Test transpiling to file."""
        with patch.object(transpiler.parser, "parse_file") as mock_parse:
            mock_parse.return_value = ParsedYAMLConfig(
                name="test",
                base_url=None,
                base_selector=None,
                selectors=[],
                unsupported=[],
                raw_config={},
            )

            output_file = tmp_path / "output.py"
            transpiler.transpile_to_python(
                "/fake/path.yaml",
                output_path=str(output_file),
            )

            assert output_file.exists()

    def test_transpile_to_python_custom_variable_name(self, transpiler):
        """Test with custom variable name."""
        with patch.object(transpiler.parser, "parse_file") as mock_parse:
            mock_parse.return_value = ParsedYAMLConfig(
                name="test",
                base_url=None,
                base_selector=None,
                selectors=[],
                unsupported=[],
                raw_config={},
            )

            code = transpiler.transpile_to_python(
                "/fake/path.yaml",
                variable_name="MY_SCHEMA",
            )

            assert "MY_SCHEMA" in code


class TestFieldToSchema:
    """Test suite for field to schema conversion."""

    @pytest.fixture
    def transpiler(self):
        """Create transpiler instance."""
        return YAMLToCrawl4AI()

    def test_field_to_schema_basic(self, transpiler):
        """Test basic field to schema conversion."""
        field = SelectorField(name="title", selector="h1", value_type="text")

        schema = transpiler._field_to_schema(field)

        assert schema["name"] == "title"
        assert schema["selector"] == "h1"
        assert schema["type"] == "text"
        assert schema["selectorType"] == "css"

    def test_field_to_schema_xpath(self, transpiler):
        """Test XPath field to schema."""
        field = SelectorField(name="title", selector="//h1", selector_type="xpath", value_type="text")

        schema = transpiler._field_to_schema(field)

        assert schema["selectorType"] == "xpath"

    def test_field_to_schema_with_attribute(self, transpiler):
        """Test field with attribute."""
        field = SelectorField(
            name="price",
            selector=".price",
            value_type="attribute",
            attribute="data-price",
        )

        schema = transpiler._field_to_schema(field)

        assert schema["attribute"] == "data-price"

    def test_field_to_schema_with_children(self, transpiler):
        """Test field with children."""
        child = SelectorField(name="child", selector=".child", value_type="text")
        field = SelectorField(name="parent", selector=".parent", value_type="nested", children=[child])

        schema = transpiler._field_to_schema(field)

        assert "fields" in schema
        assert len(schema["fields"]) == 1


class TestBuildSchemaPayload:
    """Test suite for building schema payload."""

    @pytest.fixture
    def transpiler(self):
        """Create transpiler instance."""
        return YAMLToCrawl4AI()

    def test_build_payload_basic(self, transpiler):
        """Test building basic payload."""
        parsed = ParsedYAMLConfig(
            name="my-scraper",
            base_url="https://example.com",
            base_selector=".container",
            selectors=[
                SelectorField(name="title", selector="h1", value_type="text"),
            ],
            unsupported=[],
            raw_config={},
        )

        payload = transpiler._build_schema_payload(parsed)

        assert payload["name"] == "my-scraper"
        assert payload["baseUrl"] == "https://example.com"
        assert payload["baseSelector"] == ".container"
        assert len(payload["fields"]) == 1

    def test_build_payload_no_base_url(self, transpiler):
        """Test payload without base URL."""
        parsed = ParsedYAMLConfig(
            name="test",
            base_url=None,
            base_selector=None,
            selectors=[],
            unsupported=[],
            raw_config={},
        )

        payload = transpiler._build_schema_payload(parsed)

        assert "baseUrl" not in payload


class TestXPathDetection:
    """Test suite for XPath detection in YAML parser."""

    @pytest.fixture
    def parser(self):
        """Create parser instance."""
        return YAMLConfigParser()

    def test_detects_xpath_selector(self, parser):
        """Test detecting xpath key."""
        config = {
            "name": "test",
            "selectors": [
                {"name": "title", "xpath": "//h1"},
            ],
        }

        result = parser.parse_dict(config)

        assert result.selectors[0].selector_type == "xpath"
        assert result.selectors[0].selector == "//h1"

    def test_xpath_falls_back_to_selector(self, parser):
        """Test xpath field falls back to selector key."""
        config = {
            "name": "test",
            "selectors": [
                {"name": "title", "selector": "h1", "xpath": None},
            ],
        }

        result = parser.parse_dict(config)

        assert result.selectors[0].selector == "h1"


class TestValueTypeInference:
    """Test suite for value type inference."""

    @pytest.fixture
    def parser(self):
        """Create parser instance."""
        return YAMLConfigParser()

    def test_infer_text_type(self, parser):
        """Test inferring text type."""
        config = {
            "name": "test",
            "selectors": [
                {"name": "title", "selector": "h1", "attribute": "text"},
            ],
        }

        result = parser.parse_dict(config)

        assert result.selectors[0].value_type == "text"

    def test_infer_inner_text(self, parser):
        """Test inferring inner_text type."""
        config = {
            "name": "test",
            "selectors": [
                {"name": "title", "selector": "h1", "attribute": "inner_text"},
            ],
        }

        result = parser.parse_dict(config)

        assert result.selectors[0].value_type == "text"

    def test_infer_html_type(self, parser):
        """Test inferring html type."""
        config = {
            "name": "test",
            "selectors": [
                {"name": "desc", "selector": ".desc", "attribute": "html"},
            ],
        }

        result = parser.parse_dict(config)

        assert result.selectors[0].value_type == "html"

    def test_infer_nested_type(self, parser):
        """Test inferring nested type."""
        config = {
            "name": "test",
            "selectors": [
                {
                    "name": "product",
                    "selector": ".product",
                    "fields": [{"name": "title", "selector": "h2"}],
                }
            ],
        }

        result = parser.parse_dict(config)

        assert result.selectors[0].value_type == "nested"

    def test_infer_nested_list_type(self, parser):
        """Test inferring nested list type."""
        config = {
            "name": "test",
            "selectors": [
                {
                    "name": "reviews",
                    "selector": ".review",
                    "type": "list",
                    "fields": [{"name": "text", "selector": ".text"}],
                }
            ],
        }

        result = parser.parse_dict(config)

        assert result.selectors[0].value_type == "nested_list"


class TestSupportedWorkflowActions:
    """Test suite for supported workflow actions."""

    @pytest.fixture
    def parser(self):
        """Create parser instance."""
        return YAMLConfigParser()

    def test_supported_actions_listed(self, parser):
        """Test supported actions are defined."""
        expected_actions = {"extract", "navigate", "wait", "wait_for", "wait_for_hidden", "click", "input"}
        assert parser._SUPPORTED_WORKFLOW_ACTIONS == expected_actions

    def test_extract_action_supported(self, parser):
        """Test extract action is supported."""
        config = {
            "name": "test",
            "workflows": [{"action": "extract"}],
        }

        result = parser.parse_dict(config)

        # Should not flag extract as unsupported
        unsupported_paths = [u.path for u in result.unsupported]
        assert "workflows[0].action" not in unsupported_paths


class TestTranspilerCLI:
    """Test suite for CLI integration (transpiler)."""

    def test_transpiler_can_be_imported(self):
        """Test transpiler can be imported."""
        from src.crawl4ai_engine.transpiler import schema_generator

        assert hasattr(schema_generator, "YAMLToCrawl4AI")

    def test_parser_can_be_imported(self):
        """Test parser can be imported."""
        from src.crawl4ai_engine.transpiler import yaml_parser

        assert hasattr(yaml_parser, "YAMLConfigParser")
