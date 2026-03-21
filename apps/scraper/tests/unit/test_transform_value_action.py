from __future__ import annotations

from types import SimpleNamespace

import pytest

from scrapers.actions.handlers.transform import TransformValueAction


@pytest.mark.asyncio
async def test_transform_value_extracts_petfoodex_upc_from_product_meta() -> None:
    ctx = SimpleNamespace(
        results={
            "Product Meta": "Item #63902399\nUPC#: BAG: 811048023995\nEDLP: $63.00",
        }
    )
    action = TransformValueAction(ctx)

    await action.execute(
        {
            "source_field": "Product Meta",
            "target_field": "UPC",
            "regex": r"(?:UPC#:\s*(?:[A-Z]+:\s*)?|EA:\s*)([0-9]{8,14})",
        }
    )

    assert ctx.results["UPC"] == "811048023995"


@pytest.mark.asyncio
async def test_transform_value_clears_target_field_when_regex_extract_misses() -> None:
    ctx = SimpleNamespace(results={"Product Meta": "HOME\nDOG\nFOOD\nADD TO CART"})
    action = TransformValueAction(ctx)

    await action.execute(
        {
            "source_field": "Product Meta",
            "target_field": "UPC",
            "regex": r"(?:UPC#:\s*(?:[A-Z]+:\s*)?|EA:\s*)([0-9]{8,14})",
        }
    )

    assert ctx.results["UPC"] is None


@pytest.mark.asyncio
async def test_transform_value_preserves_in_place_field_on_regex_miss() -> None:
    ctx = SimpleNamespace(results={"Brand": "Koha"})
    action = TransformValueAction(ctx)

    await action.execute(
        {
            "field": "Brand",
            "transformations": [
                {
                    "type": "regex_extract",
                    "pattern": r"Visit the (.+) Store",
                    "group": 1,
                }
            ],
        }
    )

    assert ctx.results["Brand"] == "Koha"
