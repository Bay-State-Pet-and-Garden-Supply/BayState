# Hybrid Provider Configuration Guide

This guide explains how to configure the hybrid AI provider system for data consolidation and extraction. The system supports both Gemini and OpenAI providers with automatic fallback and mode selection.

## Environment Variables

### Required Variables

Set these in your shell or `.env.local` file:

```bash
# Required
export GEMINI_API_KEY="your-gemini-key"
export OPENAI_API_KEY="your-openai-key"
```

### Optional Variables

These have sensible defaults but can be customized:

```bash
# Optional (with defaults)
export GEMINI_SEARCH_MODEL="gemini-3.1-flash-lite-preview"
export GEMINI_CONSOLIDATION_MODEL="gemini-3-flash-preview"
export OPENAI_MODEL="gpt-4o-mini"
export EXTRACTION_MODE="auto"  # auto | llm-free | llm
```

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_SEARCH_MODEL` | `gemini-3.1-flash-lite-preview` | Model for product search operations |
| `GEMINI_CONSOLIDATION_MODEL` | `gemini-3-flash-preview` | Model for data consolidation tasks |
| `OPENAI_MODEL` | `gpt-4o-mini` | Fallback OpenAI model |
| `EXTRACTION_MODE` | `auto` | Extraction mode: auto, llm-free, or llm |

## Configuration Files

### 1. apps/web/.env.local

Create this file in the web app directory for local development:

```
GEMINI_API_KEY=your-gemini-key-here
OPENAI_API_KEY=your-openai-key-here
GEMINI_SEARCH_MODEL=gemini-3.1-flash-lite-preview
GEMINI_CONSOLIDATION_MODEL=gemini-3-flash-preview
OPENAI_MODEL=gpt-4o-mini
EXTRACTION_MODE=auto
```

**Security Note:** Never commit this file to version control. It is automatically ignored via `.gitignore`.

### 2. apps/scraper/config/crawl4ai.yaml

This file configures the extraction engine for the scraper:

```yaml
extraction:
  mode: auto
  llm_fallback: openai
  llm_model: gpt-4o-mini
  
search:
  provider: gemini
  model: gemini-3.1-flash-lite-preview
  
consolidation:
  provider: gemini
  model: gemini-3-flash-preview
```

#### Configuration Options

**extraction.mode:**
- `auto` - Automatically choose between LLM-free and LLM-based extraction
- `llm-free` - Use only structured extraction (faster, cheaper)
- `llm` - Always use LLM for extraction (more accurate, slower)

**extraction.llm_fallback:**
- `openai` - Use OpenAI when Gemini fails or for specific tasks
- `gemini` - Use Gemini exclusively

## Verification

Test your configuration before running the full pipeline:

### Test Gemini Connection

```bash
python -c "from test_harness import GeminiClient; c = GeminiClient(); print('OK')"
```

Expected output: `OK`

### Test OpenAI Connection

```bash
python -c "from test_harness import OpenAIClient; c = OpenAIClient(); print('OK')"
```

Expected output: `OK`

### Test Full Pipeline

Run the baseline tests to verify everything works together:

```bash
python apps/web/lib/consolidation/__tests__/run_baseline.py
```

This will test:
- Provider connectivity
- Model availability
- Extraction modes
- Fallback behavior

## Troubleshooting

### Missing API Key

**Symptom:** Error message about missing API key or authentication failure

**Solution:**
1. Check that environment variables are set: `echo $GEMINI_API_KEY`
2. Verify the `.env.local` file exists and contains the keys
3. Restart your terminal or run `source .env.local` to reload
4. For Docker deployments, ensure keys are passed as environment variables

### Rate Limits

**Symptom:** HTTP 429 errors or "rate limit exceeded" messages

**Solution:**
1. Add delays between API calls (built-in retry handles this automatically)
2. Consider upgrading your API tier
3. Use `llm-free` mode for batch operations to reduce API calls
4. Implement request batching for large datasets

### Model Not Found

**Symptom:** Error indicating the model name is invalid or not accessible

**Solution:**
1. Verify model names match current provider documentation
2. Check that your API key has access to the requested model
3. Update the model name in your configuration
4. Common current models:
   - Gemini: `gemini-3.1-flash-lite-preview`, `gemini-3-flash-preview`
   - OpenAI: `gpt-4o-mini`, `gpt-4o`

### Fallback Not Working

**Symptom:** Primary provider fails but fallback does not activate

**Solution:**
1. Verify both API keys are valid
2. Check that `llm_fallback` is set to `openai` in crawl4ai.yaml
3. Review logs for specific error messages
4. Test each provider independently

### Extraction Mode Issues

**Symptom:** Unexpected extraction quality or performance

**Solution:**
- For speed: Use `EXTRACTION_MODE=llm-free`
- For accuracy: Use `EXTRACTION_MODE=llm`
- For balanced: Use `EXTRACTION_MODE=auto` (recommended)

## Quick Reference

### Minimal Setup

```bash
# 1. Set keys
export GEMINI_API_KEY="your-key"
export OPENAI_API_KEY="your-key"

# 2. Test
python -c "from test_harness import GeminiClient; c = GeminiClient(); print('OK')"

# 3. Run
python apps/web/lib/consolidation/__tests__/run_baseline.py
```

### Production Deployment

For production, use environment variables or a secrets manager:

```bash
# Docker
docker run -e GEMINI_API_KEY="$GEMINI_API_KEY" -e OPENAI_API_KEY="$OPENAI_API_KEY" baystate-scraper

# Kubernetes
kubectl create secret generic ai-keys \
  --from-literal=gemini-key="$GEMINI_API_KEY" \
  --from-literal=openai-key="$OPENAI_API_KEY"
```

## Support

For configuration issues or questions about provider setup, refer to:
- Provider documentation: [Gemini](https://ai.google.dev/) | [OpenAI](https://platform.openai.com/)
- Internal docs: `apps/web/lib/consolidation/docs/`
