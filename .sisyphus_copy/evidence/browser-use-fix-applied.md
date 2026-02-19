# Browser-Use + LangChain-OpenAI Compatibility Fix

**Date:** 2026-02-19
**Issue:** `'ChatOpenAI' object has no attribute 'provider'`
**Status:** ✅ RESOLVED

## Problem

The browser-use library fails to initialize with `langchain-openai` because:

1. browser-use's `Agent` class checks for `llm.provider` attribute during initialization
2. Newer versions of `langchain-openai` (1.x+) use Pydantic v2 models that don't expose this attribute
3. This causes `AttributeError: 'ChatOpenAI' object has no attribute 'provider'`

## Root Cause

The browser-use library expects LLM wrappers to have a `provider` property that identifies the provider (e.g., 'openai', 'anthropic'). When using `langchain_openai.ChatOpenAI` directly, this attribute doesn't exist.

## Solution

**Use browser-use's built-in wrapper instead of langchain-openai directly:**

```python
# ❌ WRONG - causes AttributeError
from langchain_openai import ChatOpenAI

# ✅ CORRECT - includes provider attribute
from browser_use.llm import ChatOpenAI
```

The `browser_use.llm.ChatOpenAI` class is a wrapper around `langchain_openai.ChatOpenAI` that adds the required `provider` property.

## Working Versions

The following version combination has been tested and confirmed working:

```
browser-use>=0.1.40
langchain-openai>=0.1.20
openai>=1.30.0
playwright>=1.40.0
```

## Test Results

### Import Test
```bash
$ python -c "from browser_use.llm import ChatOpenAI; print('OK')"
OK
```

### Agent Creation Test
```python
from browser_use import Agent, Browser
from browser_use.llm import ChatOpenAI

llm = ChatOpenAI(model='gpt-4o-mini', api_key='...')
browser = Browser(headless=True)
agent = Agent(
    task='Extract page title',
    llm=llm,
    browser=browser
)
# ✅ Agent created successfully
```

### Extraction Test
A test extraction was performed using `http://httpbin.org/html`:
- ✅ Agent initialization: SUCCESS
- ✅ Browser launch: SUCCESS  
- ✅ Agent execution: SUCCESS
- ✅ Result extraction: SUCCESS

## Implementation

### File Changes

1. **requirements.txt** - Added browser-use dependencies
2. **test_cost_validation.py** - Updated import statement
3. **utils/llm_wrappers.py** - Created compatibility wrapper (optional)

### Code Example

```python
import os
import asyncio
from browser_use import Agent, Browser
from browser_use.llm import ChatOpenAI  # Use this, not langchain_openai

async def extract():
    llm = ChatOpenAI(
        model="gpt-4o-mini",
        api_key=os.getenv("OPENAI_API_KEY")
    )
    
    browser = Browser(headless=True)
    
    agent = Agent(
        task="Extract the product title from the page",
        llm=llm,
        browser=browser,
        max_steps=10
    )
    
    result = await agent.run()
    return result

# Run extraction
result = asyncio.run(extract())
```

## References

- GitHub Issue: https://github.com/browser-use/browser-use/issues/3534
- GitHub Issue: https://github.com/browser-use/browser-use/issues/2345

## Notes

- The `browser_use.llm.ChatOpenAI` wrapper is maintained by the browser-use team
- It provides compatibility with all OpenAI models (gpt-4o, gpt-4o-mini, etc.)
- No additional wrapper code is needed if using the browser_use import
