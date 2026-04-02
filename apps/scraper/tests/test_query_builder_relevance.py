from __future__ import annotations
import os
import sys
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scrapers.ai_search.query_builder import QueryBuilder

def test_query_builder_identifier_queries_use_raw_sku_only() -> None:
    qb = QueryBuilder()
    
    # 12-digit numeric SKU (UPC)
    query = qb.build_identifier_query(sku="813347002015")
    assert query == "813347002015"

    # Short numeric SKU
    query = qb.build_identifier_query(sku="12345")
    assert query == "12345"

    # Alphanumeric SKU
    query = qb.build_identifier_query(sku="ABC-123")
    assert query == "ABC-123"

def test_query_builder_intent_keywords() -> None:
    qb = QueryBuilder()
    query = qb.build_search_query(sku="813347002015", product_name="Stud Muffins", brand="Manna Pro")
    
    assert "Manna Pro" in query
    assert "Stud Muffins" in query
    assert "UPC 813347002015" in query
    assert "product" in query
    assert "details" in query
    assert "-review" in query
    assert "-comparison" in query

def test_query_variants_sku_priority() -> None:
    qb = QueryBuilder()
    variants = qb.build_query_variants(sku="813347002015", product_name="Stud Muffins", brand="Manna Pro", category=None)
    
    assert variants[0] == "UPC 813347002015"
    assert "UPC 813347002015" in variants
    assert "Manna Pro Stud Muffins" in variants
