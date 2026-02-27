# T4 Findings: YAML Parser Adaptation

## Task Summary
Analyzed existing YAML DSL structure, created parser that reads existing configs, mapped existing fields to crawl4ai concepts, maintained backward compatibility.

## Parser Location
- **Module**: `BayStateScraper/lib/parser/yaml_parser.py`
- **Entry Point**: `parse_yaml(file_path)` function

## Existing YAML Schema Analyzed

### Core Fields
| Field | Type | Description | Crawl4ai Mapping |
|-------|------|-------------|------------------|
| `name` | string | Unique scraper identifier | metadata.name |
| `display_name` | string | Human-readable name | metadata.display_name |
| `base_url` | string | Base URL for scraping | url |
| `scraper_type` | string | "static" or "agentic" | extraction_type |

### AI Configuration
| Field | Type | Description | Crawl4ai Mapping |
|-------|------|-------------|------------------|
| `ai_config.tool` | string | "browser-use" | llm_provider |
| `ai_config.task` | string | Natural language task | instruction |
| `ai_config.max_steps` | int | Max AI steps (1-50) | max_steps |
| `ai_config.confidence_threshold` | float | Min confidence (0-1) | confidence_threshold |
| `ai_config.llm_model` | string | OpenAI model | model |
| `ai_config.use_vision` | bool | Enable GPT-4V | vision |
| `ai_config.headless` | bool | Run headless | headless |

### Workflows
| Field | Type | Description | Crawl4ai Mapping |
|-------|------|-------------|------------------|
| `workflows[].action` | string | Action type (navigate, click, extract, ai_extract, ai_search, ai_validate) | step_type |
| `workflows[].name` | string | Step name | step_name |
| `workflows[].params` | dict | Action parameters | step_params |

### Selectors
| Field | Type | Description | Crawl4ai Mapping |
|-------|------|-------------|------------------|
| `selectors[].name` | string | Field name | field_name |
| `selectors[].selector` | string | CSS selector | css_selector |
| `selectors[].attribute` | string | Attribute to extract | attribute |
| `selectors[].multiple` | bool | Extract multiple | multiple |
| `selectors[].required` | bool | Required field | required |

### Anti-Detection
| Field | Type | Description | Crawl4ai Mapping |
|-------|------|-------------|------------------|
| `anti_detection.enable_captcha_detection` | bool | Detect CAPTCHAs | browser_config.captcha |
| `anti_detection.enable_rate_limiting` | bool | Rate limiting | browser_config.rate_limit |
| `anti_detection.enable_human_simulation` | bool | Human behavior | browser_config.human_behavior |
| `anti_detection.enable_session_rotation` | bool | Rotate sessions | browser_config.session_pool |
| `anti_detection.rate_limit_min_delay` | float | Min delay (seconds) | browser_config.delay_min |
| `anti_detection.rate_limit_max_delay` | float | Max delay (seconds) | browser_config.delay_max |

### Validation
| Field | Type | Description | Crawl4ai Mapping |
|-------|------|-------------|------------------|
| `validation.no_results_selectors` | list | CSS selectors for no-results | result_validation.empty_selectors |
| `validation.no_results_text_patterns` | list | Text patterns | result_validation.empty_patterns |

### Test Data
| Field | Type | Description |
|-------|------|-------------|
| `test_skus` | list | Valid SKUs for testing |
| `fake_skus` | list | Invalid SKUs for no-results |
| `edge_case_skus` | list | Boundary case SKUs |

## Test Results

All 6 sample configs parsed successfully:

| Config | Status | name | scraper_type | workflows | selectors |
|--------|--------|------|--------------|-----------|-----------|
| ai-walmart.yaml | OK | ai-walmart | agentic | 3 | 0 |
| ai-template.yaml | OK | ai-product-extractor | agentic | 5 | 1 |
| ai-mazuri.yaml | OK | ai-mazuri | agentic | 3 | 0 |
| ai-coastal.yaml | OK | ai-coastal | agentic | 4 | 0 |
| ai-central-pet.yaml | OK | ai-central-pet | agentic | 3 | 0 |
| ai-amazon.yaml | OK | ai-amazon | agentic | 3 | 0 |

## Crawl4ai Concept Mapping Summary

The parser creates a `Crawl4AIConfig` dataclass that maps:

1. **Static scrapers** (scraper_type: "static")
   - selectors → css_selectors in crawl4ai
   - workflows → execution steps

2. **Agentic scrapers** (scraper_type: "agentic")
   - ai_config → llm extraction config
   - workflows with ai_* actions → agent instructions
   - No selectors needed (AI handles extraction)

## Backward Compatibility

The parser:
- Reads ALL existing YAML fields without modification
- Returns structured Crawl4AIConfig with raw_config preserved
- Does NOT change existing YAML schema
- Does NOT break existing configs

## Next Steps for Transpilation

To convert to crawl4ai format:
1. Use `parse_yaml()` to get Crawl4AIConfig
2. Map fields based on scraper_type
3. Generate crawl4ai-compatible JSON/YAML

---

*Generated: 2026-02-27*
