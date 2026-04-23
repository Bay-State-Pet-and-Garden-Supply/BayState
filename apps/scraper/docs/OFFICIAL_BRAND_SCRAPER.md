# Official Brand Scraper

The `OfficialBrandScraper` is a specialized, high-fidelity ingestion pipeline designed to isolate and extract product data directly from official manufacturer domains. It addresses the "Patagonia Effect"—where retail aggregators (Amazon, Chewy, etc.) outrank official brands in search results—by utilizing multi-stage source validation and adaptive extraction.

## **Pipeline Architecture**

The scraper operates in three primary phases: **Discovery**, **Validation**, and **Extraction**.

### **1. Discovery (Search Layer)**
We utilize `SerperSearchClient` with specific tuning to find the official manufacturer:
- **Geographic/Language Locking**: Payload uses `gl` (country) and `hl` (language) parameters to prevent regional distributor distortion.
- **Aggregator Exclusion**: Queries are programmatically constructed with aggressive `-site:` operators (e.g., `-site:amazon.com -site:chewy.com`) to algorithmically filter out mega-retailers.
- **Knowledge Graph Anchoring**: The system prioritizes the `knowledgeGraph.website` field from the Serper response as the "absolute ground truth" root domain.

### **2. Validation (Source Selection)**
If a Knowledge Graph entity is missing, the system falls back to **LLM Snippet Scoring**:
- **Lightweight Evaluation**: A lightweight LLM (GPT-4o-mini) analyzes the top 5 organic search snippets.
- **Heuristic Scoring**: The LLM scores URLs based on:
    - **Domain Congruence**: Matching the root domain to the brand name.
    - **Trust Signals**: Presence of "Official Store," "Technical Support," or "Warranty" keywords.
    - **Lack of Aggregator Jargon**: Penalizing snippets containing "Wholesale," "Compare prices," or "Discount."

### **3. Extraction (Crawl4AI Layer)**
Once the official URL is acquired, the scraper executes a two-stage extraction process using `Crawl4AIEngine`:

#### **Stage 1: Deterministic (LLM-Free)**
- Uses `JsonCssExtractionStrategy`.
- **Requirement**: A pre-generated CSS schema file.
- **Benefit**: Extremely fast, zero API cost, and no hallucination risk.
- **Schema Tool**: Use `apps/scraper/scripts/generate_crawl4ai_schema.py` to analyze multiple manufacturer pages offline and generate resilient, attribute-based selectors.

#### **Stage 2: Semantic Fallback (LLM)**
- Uses `LLMExtractionStrategy` (GPT-4o-mini) as a failover for complex, unstructured, or obfuscated layouts.
- **Strict Typing**: Forced into a Pydantic `ProductSpecs` model to ensure database-ready JSON.
- **Content Pruning**: Utilizes `target_elements` (e.g., `main`, `article`) and `networkidle` wait conditions to handle dynamic JavaScript hydration.

## **Usage**

### **Programmatic Orchestration**
```python
from scrapers.ai_search.official_brand_scraper import OfficialBrandScraper

scraper = OfficialBrandScraper()

# 1. Find the URL
url = await scraper.identify_official_url(sku="12345", brand="Kong")

# 2. Extract Data
# If we have a cached schema for Kong, Stage 1 will execute.
# Otherwise, it falls back to Stage 2 (LLM).
data = await scraper.extract_data(url, schema_path="configs/schemas/kong.json")
```

### **Offline Schema Generation**
To add a new brand with high-efficiency extraction:
```bash
python apps/scraper/scripts/generate_crawl4ai_schema.py \
  --output configs/schemas/brand_name.json \
  --urls https://brand.com/prod1 https://brand.com/prod2
```

## **Key Files**
- **Orchestrator**: `apps/scraper/scrapers/ai_search/official_brand_scraper.py`
- **Query Logic**: `apps/scraper/scrapers/ai_search/query_builder.py`
- **Validation**: `apps/scraper/scrapers/ai_search/scoring.py`
- **Engine**: `apps/scraper/src/crawl4ai_engine/engine.py`
- **Schema Tool**: `apps/scraper/scripts/generate_crawl4ai_schema.py`
