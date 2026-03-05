/**
 * Action definitions for the visual workflow builder.
 * Provides metadata about each action type for UI rendering.
 */
import type { ActionDefinition, ActionType } from './types';

export const actionDefinitions: Record<ActionType, ActionDefinition> = {
  navigate: {
    type: 'navigate',
    label: 'Navigate',
    icon: 'Globe',
    color: 'blue',
    description: 'Navigate to a URL',
    category: 'navigation',
    browserBound: true,
    params: {
      url: {
        type: 'string',
        label: 'URL',
        required: true,
        placeholder: 'https://example.com/search?q={sku}',
        description: 'URL to navigate to. Use {sku} for variable substitution.',
      },
      wait_after: {
        type: 'number',
        label: 'Wait After (seconds)',
        required: false,
        default: 0,
      },
      fail_on_error: {
        type: 'boolean',
        label: 'Fail on Error',
        required: false,
        default: true,
      },
    },
  },

  wait: {
    type: 'wait',
    label: 'Wait',
    icon: 'Clock',
    color: 'gray',
    description: 'Wait for a fixed duration',
    category: 'navigation',
    browserBound: true,
    params: {
      seconds: {
        type: 'number',
        label: 'Seconds',
        required: true,
        default: 2,
      },
    },
  },

  wait_for: {
    type: 'wait_for',
    label: 'Wait For Element',
    icon: 'Search',
    color: 'purple',
    description: 'Wait until an element appears on the page',
    category: 'navigation',
    browserBound: true,
    params: {
      selector: {
        type: 'string',
        label: 'Selector(s)',
        required: true,
        placeholder: '.result-item, #product',
        description: 'CSS selector or comma-separated list of selectors',
      },
      timeout: {
        type: 'number',
        label: 'Timeout (seconds)',
        required: false,
        default: 10,
      },
    },
  },

  click: {
    type: 'click',
    label: 'Click',
    icon: 'MousePointer',
    color: 'green',
    description: 'Click an element on the page',
    category: 'interaction',
    browserBound: true,
    params: {
      selector: {
        type: 'selector',
        label: 'Selector',
        required: true,
        placeholder: 'button.submit, a.product-link',
      },
      index: {
        type: 'number',
        label: 'Index',
        required: false,
        default: 0,
        description: 'Which element to click if multiple match (0-based)',
      },
      filter_text_exclude: {
        type: 'string',
        label: 'Exclude Text',
        required: false,
        placeholder: 'sponsored',
        description: 'Skip elements containing this text',
      },
      wait_after: {
        type: 'number',
        label: 'Wait After (seconds)',
        required: false,
        default: 0,
      },
    },
  },

  conditional_click: {
    type: 'conditional_click',
    label: 'Conditional Click',
    icon: 'MousePointer2',
    color: 'teal',
    description: 'Click only if element exists (e.g., cookie banners)',
    category: 'interaction',
    browserBound: true,
    params: {
      selector: {
        type: 'selector',
        label: 'Selector',
        required: true,
        placeholder: '#cookie-accept',
      },
      timeout: {
        type: 'number',
        label: 'Timeout (seconds)',
        required: false,
        default: 2,
      },
    },
  },

  input_text: {
    type: 'input_text',
    label: 'Input Text',
    icon: 'Type',
    color: 'orange',
    description: 'Type text into an input field',
    category: 'interaction',
    browserBound: true,
    params: {
      selector: {
        type: 'selector',
        label: 'Input Selector',
        required: true,
      },
      text: {
        type: 'string',
        label: 'Text',
        required: true,
        placeholder: '{sku}',
      },
      clear_first: {
        type: 'boolean',
        label: 'Clear First',
        required: false,
        default: true,
      },
    },
  },

  extract: {
    type: 'extract',
    label: 'Extract',
    icon: 'FileOutput',
    color: 'cyan',
    description: 'Extract data using predefined selectors',
    category: 'extraction',
    browserBound: true,
    params: {
      fields: {
        type: 'array',
        label: 'Fields',
        required: true,
        description: 'List of selector names to extract',
      },
    },
  },

  extract_and_transform: {
    type: 'extract_and_transform',
    label: 'Extract & Transform',
    icon: 'Wand2',
    color: 'indigo',
    description: 'Extract data with inline transformations (recommended)',
    category: 'extraction',
    browserBound: true,
    params: {
      fields: {
        type: 'object',
        label: 'Field Configurations',
        required: true,
        description: 'Define fields with selectors and optional transforms',
      },
    },
  },

  transform_value: {
    type: 'transform_value',
    label: 'Transform Value',
    icon: 'RefreshCw',
    color: 'yellow',
    description: 'Transform an already-extracted value',
    category: 'transform',
    browserBound: false,
    params: {
      field: {
        type: 'string',
        label: 'Field',
        required: true,
        description: 'Field to transform in-place',
      },
      regex: {
        type: 'string',
        label: 'Regex',
        required: false,
        placeholder: 'Visit the (.+) Store',
        description: 'Simple regex extraction (group 1)',
      },
      transformations: {
        type: 'array',
        label: 'Transformations',
        required: false,
        description: 'List of transformation operations',
      },
    },
  },

  check_no_results: {
    type: 'check_no_results',
    label: 'Check No Results',
    icon: 'SearchX',
    color: 'red',
    description: 'Detect "no results" page state',
    category: 'validation',
    browserBound: true,
    params: {},
  },

  conditional_skip: {
    type: 'conditional_skip',
    label: 'Conditional Skip',
    icon: 'SkipForward',
    color: 'slate',
    description: 'Stop workflow if a flag is set',
    category: 'flow',
    browserBound: false,
    params: {
      if_flag: {
        type: 'string',
        label: 'If Flag',
        required: true,
        placeholder: 'no_results_found',
        description: 'Stop if this flag is true in results',
      },
    },
  },

  conditional: {
    type: 'conditional',
    label: 'Conditional',
    icon: 'GitBranch',
    color: 'violet',
    description: 'If/then/else branching logic',
    category: 'flow',
    browserBound: false,
    params: {
      condition_type: {
        type: 'string',
        label: 'Condition Type',
        required: true,
        options: [
          { value: 'field_exists', label: 'Field Exists' },
          { value: 'value_match', label: 'Value Match' },
          { value: 'element_exists', label: 'Element Exists' },
        ],
      },
      field: {
        type: 'string',
        label: 'Field',
        required: false,
      },
      value: {
        type: 'string',
        label: 'Value',
        required: false,
      },
      selector: {
        type: 'selector',
        label: 'Selector',
        required: false,
      },
    },
  },

  scroll: {
    type: 'scroll',
    label: 'Scroll',
    icon: 'ArrowDown',
    color: 'stone',
    description: 'Scroll the page or an element',
    category: 'interaction',
    browserBound: true,
    params: {
      direction: {
        type: 'string',
        label: 'Direction',
        required: false,
        default: 'down',
        options: [
          { value: 'up', label: 'Up' },
          { value: 'down', label: 'Down' },
          { value: 'top', label: 'Top' },
          { value: 'bottom', label: 'Bottom' },
        ],
      },
      amount: {
        type: 'number',
        label: 'Amount (pixels)',
        required: false,
      },
      selector: {
        type: 'selector',
        label: 'Container Selector',
        required: false,
        description: 'Scroll within this element instead of page',
      },
    },
  },

  verify: {
    type: 'verify',
    label: 'Verify',
    icon: 'CheckCircle',
    color: 'emerald',
    description: 'Verify page content matches expected value',
    category: 'validation',
    browserBound: true,
    params: {
      selector: {
        type: 'selector',
        label: 'Selector',
        required: true,
      },
      expected_value: {
        type: 'string',
        label: 'Expected Value',
        required: true,
      },
      match_mode: {
        type: 'string',
        label: 'Match Mode',
        required: false,
        default: 'contains',
        options: [
          { value: 'exact', label: 'Exact' },
          { value: 'contains', label: 'Contains' },
          { value: 'fuzzy_number', label: 'Fuzzy Number' },
        ],
      },
    },
  },

  login: {
    type: 'login',
    label: 'Login',
    icon: 'LogIn',
    color: 'amber',
    description: 'Execute login flow from config',
    category: 'interaction',
    browserBound: true,
    params: {},
  },

  execute_script: {
    type: 'execute_script',
    label: 'Execute Script',
    icon: 'Code',
    color: 'zinc',
    description: 'Run custom JavaScript in the page',
    category: 'interaction',
    browserBound: true,
    params: {
      script: {
        type: 'string',
        label: 'JavaScript',
        required: true,
        placeholder: 'return document.title;',
      },
      selector: {
        type: 'selector',
        label: 'Element Selector',
        required: false,
        description: 'Passed as first argument to script',
      },
    },
  },

  process_images: {
    type: 'process_images',
    label: 'Process Images',
    icon: 'Image',
    color: 'pink',
    description: 'Filter and upgrade image URLs',
    category: 'transform',
    browserBound: false,
    params: {
      field: {
        type: 'string',
        label: 'Field',
        required: true,
        default: 'Images',
      },
      quality_patterns: {
        type: 'array',
        label: 'Quality Upgrade Patterns',
        required: false,
      },
      filters: {
        type: 'array',
        label: 'URL Filters',
        required: false,
      },
      deduplicate: {
        type: 'boolean',
        label: 'Deduplicate',
        required: false,
        default: true,
      },
    },
  },

  combine_fields: {
    type: 'combine_fields',
    label: 'Combine Fields',
    icon: 'Merge',
    color: 'rose',
    description: 'Merge multiple fields using a format string',
    category: 'transform',
    browserBound: false,
    params: {
      target_field: {
        type: 'string',
        label: 'Target Field',
        required: true,
      },
      format: {
        type: 'string',
        label: 'Format String',
        required: true,
        placeholder: '{brand} - {name}',
      },
      fields: {
        type: 'array',
        label: 'Source Fields',
        required: true,
      },
    },
  },

  parse_weight: {
    type: 'parse_weight',
    label: 'Parse Weight',
    icon: 'Scale',
    color: 'lime',
    description: 'Parse and normalize weight values',
    category: 'transform',
    browserBound: false,
    params: {
      field: {
        type: 'string',
        label: 'Field',
        required: true,
        default: 'Weight',
      },
      target_unit: {
        type: 'string',
        label: 'Target Unit',
        required: false,
        default: 'lb',
        options: [
          { value: 'lb', label: 'Pounds (lb)' },
          { value: 'kg', label: 'Kilograms (kg)' },
          { value: 'oz', label: 'Ounces (oz)' },
          { value: 'g', label: 'Grams (g)' },
        ],
      },
    },
  },

  extract_from_json: {
    type: 'extract_from_json',
    label: 'Extract from JSON',
    icon: 'Braces',
    color: 'sky',
    description: 'Parse JSON from a string field',
    category: 'transform',
    browserBound: false,
    params: {
      source_field: {
        type: 'string',
        label: 'Source Field',
        required: true,
      },
      json_path: {
        type: 'string',
        label: 'JSON Path',
        required: true,
        placeholder: 'data.product.price',
      },
      target_field: {
        type: 'string',
        label: 'Target Field',
        required: true,
      },
    },
  },

  ai_search: {
    type: 'ai_search',
    label: 'AI Search',
    icon: 'Brain',
    color: 'violet',
    description: 'Use AI to search for and navigate to product pages',
    category: 'ai',
    browserBound: true,
    params: {
      query_template: {
        type: 'string',
        label: 'Search Query Template',
        required: true,
        placeholder: 'site:example.com {sku}',
        description: 'Search query. Use {sku} for variable substitution.',
      },
      navigate_to_first: {
        type: 'boolean',
        label: 'Navigate to First Result',
        required: false,
        default: true,
        description: 'Automatically click the first search result',
      },
      max_results: {
        type: 'number',
        label: 'Max Results to Consider',
        required: false,
        default: 3,
        description: 'Number of search results to analyze',
      },
    },
  },

  ai_extract: {
    type: 'ai_extract',
    label: 'AI Extract',
    icon: 'Sparkles',
    color: 'fuchsia',
    description: 'Use AI to intelligently extract structured data from the page',
    category: 'ai',
    browserBound: true,
    params: {
      instruction: {
        type: 'string',
        label: 'Extraction Instruction',
        required: true,
        placeholder: 'Extract the product name, brand, price, and main image URL',
        description: 'Natural language instruction for what to extract',
      },
      output_schema: {
        type: 'object',
        label: 'Output Schema',
        required: false,
        description: 'Expected output structure (JSON schema)',
      },
      use_vision: {
        type: 'boolean',
        label: 'Use Vision',
        required: false,
        default: true,
        description: 'Enable visual analysis of the page',
      },
    },
  },

  ai_validate: {
    type: 'ai_validate',
    label: 'AI Validate',
    icon: 'ShieldCheck',
    color: 'emerald',
    description: 'Use AI to validate extracted data with confidence scoring',
    category: 'ai',
    browserBound: false,
    params: {
      field: {
        type: 'string',
        label: 'Field to Validate',
        required: true,
        description: 'The field name to validate',
      },
      criteria: {
        type: 'string',
        label: 'Validation Criteria',
        required: true,
        placeholder: 'Check if the price is a valid number with currency symbol',
        description: 'Natural language description of what makes this valid',
      },
      confidence_threshold: {
        type: 'number',
        label: 'Confidence Threshold',
        required: false,
        default: 0.7,
        description: 'Minimum confidence score (0-1) to pass validation',
      },
    },
  },
};

export const actionCategories = {
  navigation: {
    label: 'Navigation',
    description: 'Page navigation and waiting',
    actions: ['navigate', 'wait', 'wait_for'],
  },
  interaction: {
    label: 'Interaction',
    description: 'User interaction simulation',
    actions: ['click', 'conditional_click', 'input_text', 'scroll', 'login', 'execute_script'],
  },
  extraction: {
    label: 'Extraction',
    description: 'Data extraction from page',
    actions: ['extract', 'extract_and_transform'],
  },
  transform: {
    label: 'Transform',
    description: 'Data transformation',
    actions: ['transform_value', 'process_images', 'combine_fields', 'parse_weight', 'extract_from_json'],
  },
  validation: {
    label: 'Validation',
    description: 'Page and data validation',
    actions: ['check_no_results', 'verify'],
  },
  flow: {
    label: 'Flow Control',
    description: 'Workflow branching and control',
    actions: ['conditional_skip', 'conditional'],
  },
  ai: {
    label: 'AI-Powered',
    description: 'AI-driven extraction and validation',
    actions: ['ai_search', 'ai_extract', 'ai_validate'],
  },
} as const;
