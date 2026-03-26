from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from scrapers.actions.handlers.image import ProcessImagesAction


@pytest.mark.asyncio
async def test_process_images_upgrades_amazon_thumbnail_urls_to_hires() -> None:
    ctx = SimpleNamespace(
        results={
            "Images": [
                "https://m.media-amazon.com/images/I/51aDm-WuyHL._AC_US100_.jpg",
                "https://m.media-amazon.com/images/I/5144L3LSFSL._SX38_SY50_CR,0,0,38,50_.jpg",
                "https://m.media-amazon.com/images/I/41oIgmabzHL._SS40_.jpg",
            ]
        }
    )
    action = ProcessImagesAction(ctx)

    await action.execute(
        {
            "field": "Images",
            "quality_patterns": [
                {
                    "regex": r"\._[A-Z0-9_,-]+_\.",
                    "replacement": "._AC_SL1500_.",
                }
            ],
            "filters": [{"type": "require_text", "text": "images/I/"}],
            "deduplicate": True,
        }
    )

    assert ctx.results["Images"] == [
        "https://m.media-amazon.com/images/I/51aDm-WuyHL._AC_SL1500_.jpg",
        "https://m.media-amazon.com/images/I/5144L3LSFSL._AC_SL1500_.jpg",
        "https://m.media-amazon.com/images/I/41oIgmabzHL._AC_SL1500_.jpg",
    ]


@pytest.mark.asyncio
async def test_process_images_converts_authenticated_images_to_data_urls() -> None:
    page = SimpleNamespace(
        evaluate=AsyncMock(
            return_value=[
                {
                    "original_url": "https://supplier.example.com/images/sku-1.jpg",
                    "data_url": "data:image/jpeg;base64,AAA=",
                    "error": None,
                }
            ]
        )
    )
    ctx = SimpleNamespace(
        results={"Images": ["https://supplier.example.com/images/sku-1.jpg"]},
        config=SimpleNamespace(requires_login=lambda: True),
        browser=SimpleNamespace(page=page),
    )
    action = ProcessImagesAction(ctx)

    await action.execute({"field": "Images", "deduplicate": True})

    assert ctx.results["Images"] == ["data:image/jpeg;base64,AAA="]
    page.evaluate.assert_awaited_once()
