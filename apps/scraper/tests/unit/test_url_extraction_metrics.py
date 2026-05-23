"""Offline unit tests for benchmarks.url_extraction.metrics.

These tests do NOT require network, browser, or API keys.
They test pure scoring functions against crafted extraction results.
"""

from __future__ import annotations

from benchmarks.url_extraction.metrics import (
    DIRTY_HTML_MARKERS,
    FORBIDDEN_IMAGE_DOMAINS,
    FORBIDDEN_PATH_HINTS,
    PROTEIN_ONLY_VALUES,
    ExtractionScore,
    check_approved_image_bounds,
    check_category_not_protein_only,
    check_dirty_html_markers,
    check_forbidden_image_domains,
    check_forbidden_image_path_hints,
    compute_canonical_duplicate_ratio,
    score_brand,
    score_description_contains,
    score_extraction,
    score_flavor_contains,
    score_food_form,
    score_name_contains,
    score_species,
    score_weight,
    summarize_scores,
)


# =========================================================================
# score_brand
# =========================================================================


class TestScoreBrand:
    def test_exact_match(self):
        assert score_brand("Open Farm", "Open Farm") == 1.0

    def test_case_insensitive(self):
        assert score_brand("open farm", "Open Farm") == 1.0

    def test_substring_containment(self):
        assert score_brand("Open Farm Pet", "Open Farm") == 0.85
        assert score_brand("Open Farm", "Open Farm Co.") == 0.85

    def test_mismatch(self):
        assert score_brand("Purina", "Open Farm") == 0.0

    def test_none_value(self):
        assert score_brand(None, "Open Farm") == 0.0
        assert score_brand("", "Open Farm") == 0.0


# =========================================================================
# score_name_contains
# =========================================================================


class TestScoreNameContains:
    def test_all_tokens_present(self):
        assert score_name_contains("GoodGut Harvest Chicken Dog Kibble", [
            "GoodGut", "Harvest Chicken", "Dog Kibble",
        ]) == 1.0

    def test_partial_match(self):
        score = score_name_contains("GoodGut Chicken Dog Kibble", [
            "GoodGut", "Harvest Chicken",
        ])
        assert score == 0.5

    def test_no_tokens(self):
        assert score_name_contains("Whatever", []) == 1.0

    def test_no_name(self):
        assert score_name_contains(None, ["Token"]) == 0.0

    def test_case_insensitive_substring(self):
        assert score_name_contains("GoodGut Harvest Chicken DOG Kibble - 19 lb", [
            "dog kibble",
        ]) == 1.0


# =========================================================================
# score_description_contains
# =========================================================================


class TestScoreDescriptionContains:
    def test_all_phrases_present(self):
        desc = (
            "Made with Lifeway organic kefir containing 2 billion CFUs "
            "and humanely-raised chicken."
        )
        assert score_description_contains(desc, [
            "Lifeway", "2 billion CFUs", "humanely-raised chicken",
        ]) == 1.0

    def test_partial_match(self):
        desc = "Made with humanely-raised chicken."
        assert score_description_contains(desc, [
            "Lifeway", "humanely-raised chicken",
        ]) == 0.5

    def test_no_phrases(self):
        assert score_description_contains("Whatever", []) == 1.0

    def test_no_description(self):
        assert score_description_contains(None, ["test"]) == 0.0


# =========================================================================
# score_weight
# =========================================================================


class TestScoreWeight:
    def test_exact_containment(self):
        assert score_weight("19 lb", "19 lb") is True

    def test_substring(self):
        assert score_weight("GoodGut Harvest Chicken - 19 lb Bag", "19 lb") is True

    def test_alias_lb_pounds(self):
        assert score_weight("19 pounds", "19 lb") is True
        assert score_weight("19 lbs", "19 lb") is True
        assert score_weight("19 lb", "19 pounds") is True

    def test_alias_oz_ounce(self):
        assert score_weight("5.3 oz", "5.3 ounce") is True
        assert score_weight("5.3 ounces", "5.3 oz") is True

    def test_no_match(self):
        assert score_weight("19 lb", "5.3 oz") is False

    def test_none_value(self):
        assert score_weight(None, "19 lb") is False
        assert score_weight("19 lb", None) is False


# =========================================================================
# score_species
# =========================================================================


class TestScoreSpecies:
    def test_exact_match(self):
        assert score_species("Dog", "Dog") is True
        assert score_species("Cat", "Cat") is True

    def test_case_insensitive(self):
        assert score_species("dog", "Dog") is True

    def test_mismatch(self):
        assert score_species("Dog", "Cat") is False

    def test_none_value(self):
        assert score_species(None, "Dog") is False


# =========================================================================
# score_food_form
# =========================================================================


class TestScoreFoodForm:
    def test_exact_match(self):
        assert score_food_form("Dry Food", "Dry Food") is True
        assert score_food_form("Wet Food", "Wet Food") is True

    def test_case_insensitive(self):
        assert score_food_form("dry food", "Dry Food") is True

    def test_mismatch(self):
        assert score_food_form("Dry Food", "Wet Food") is False

    def test_none_value(self):
        assert score_food_form(None, "Dry Food") is False


# =========================================================================
# score_flavor_contains
# =========================================================================


class TestScoreFlavorContains:
    def test_all_present(self):
        assert score_flavor_contains("Chicken", ["Chicken"]) == 1.0

    def test_partial(self):
        assert score_flavor_contains("Chicken", ["Chicken", "Salmon"]) == 0.5

    def test_no_tokens(self):
        assert score_flavor_contains("Chicken", []) == 1.0

    def test_no_flavor(self):
        assert score_flavor_contains(None, ["Chicken"]) == 0.0


# =========================================================================
# check_category_not_protein_only
# =========================================================================


class TestCheckCategoryNotProteinOnly:
    def test_protein_only_with_pet_food_tag_fails(self):
        ok, reason = check_category_not_protein_only(
            ["Poultry"], ["pet-food"],
        )
        assert ok is False
        assert "protein" in (reason or "").lower()

    def test_protein_only_without_pet_food_tag_passes(self):
        ok, reason = check_category_not_protein_only(
            ["Poultry"], ["livestock"],
        )
        assert ok is True
        assert reason is None

    def test_legitimate_category_passes(self):
        ok, reason = check_category_not_protein_only(
            ["Dog", "Food", "Dry Food"], ["pet-food"],
        )
        assert ok is True

    def test_none_categories_passes(self):
        ok, reason = check_category_not_protein_only(None, ["pet-food"])
        assert ok is True

    def test_all_protein_values_trigger(self):
        for val in PROTEIN_ONLY_VALUES:
            ok, reason = check_category_not_protein_only(
                [val.title()], ["pet-food"],
            )
            assert ok is False, f"'{val}' should trigger fail"


# =========================================================================
# check_approved_image_bounds
# =========================================================================


class TestCheckApprovedImageBounds:
    def test_within_bounds(self):
        ok, count, reason = check_approved_image_bounds(
            ["a.jpg", "b.jpg", "c.jpg"], 1, 5,
        )
        assert ok is True
        assert count == 3
        assert reason is None

    def test_too_few(self):
        ok, count, reason = check_approved_image_bounds([], 1, 5)
        assert ok is False
        assert "Too few" in (reason or "")
        assert count == 0

    def test_too_many(self):
        ok, count, reason = check_approved_image_bounds(
            ["a.jpg"] * 20, 1, 12,
        )
        assert ok is False
        assert "Too many" in (reason or "")
        assert count == 20

    def test_none_images(self):
        ok, count, reason = check_approved_image_bounds(None, 1, 12)
        assert ok is False


# =========================================================================
# check_forbidden_image_domains
# =========================================================================


class TestCheckForbiddenDomain:
    def test_unsplash_rejected(self):
        ok, hits = check_forbidden_image_domains([
            "https://images.unsplash.com/photo-123",
            "https://cdn.shopify.com/img.jpg",
        ])
        assert ok is False
        assert len(hits) == 1
        assert "unsplash" in hits[0]

    def test_no_forbidden_domains(self):
        ok, hits = check_forbidden_image_domains([
            "https://cdn.shopify.com/img.jpg",
        ])
        assert ok is True
        assert hits == []

    def test_none_images(self):
        ok, hits = check_forbidden_image_domains(None)
        assert ok is True

    def test_subdomain_match(self):
        ok, hits = check_forbidden_image_domains([
            "https://media.images.unsplash.com/photo",
        ])
        assert ok is False


# =========================================================================
# check_forbidden_image_path_hints
# =========================================================================


class TestCheckForbiddenPathHints:
    def test_recycle_hint(self):
        ok, hits = check_forbidden_image_path_hints([
            "https://cdn.shopify.com/recycle-icon.png",
        ])
        assert ok is False
        assert len(hits) == 1

    def test_logo_hint(self):
        ok, hits = check_forbidden_image_path_hints([
            "https://cdn.shopify.com/logo.svg",
        ])
        assert ok is False

    def test_clean_paths(self):
        ok, hits = check_forbidden_image_path_hints([
            "https://cdn.shopify.com/products/goodgut-front.jpg",
        ])
        assert ok is True
        assert hits == []

    def test_none_images(self):
        ok, hits = check_forbidden_image_path_hints(None)
        assert ok is True

    def test_multiple_hints(self):
        ok, hits = check_forbidden_image_path_hints([
            "https://cdn.shopify.com/logo.svg",
            "https://cdn.shopify.com/footer-bg.png",
            "https://cdn.shopify.com/recycle-icon.png",
        ])
        assert ok is False
        assert len(hits) == 3


# =========================================================================
# check_dirty_html_markers
# =========================================================================


class TestCheckDirtyHtmlMarkers:
    def test_dirty_html_present(self):
        ok, hits = check_dirty_html_markers(
            "This product has virtual_list and bottomSpacer in its description.",
        )
        assert ok is False
        assert "virtual_list" in hits
        assert "bottomspacer" in hits

    def test_data_qa_in_markdown(self):
        ok, hits = check_dirty_html_markers(
            'data-qa="product-description" text here',
        )
        assert ok is False
        assert "data-qa=" in hits

    def test_aria_setsize(self):
        ok, hits = check_dirty_html_markers(
            'aria-setsize="3" item appears',
        )
        assert ok is False

    def test_clean_description(self):
        ok, hits = check_dirty_html_markers(
            "Made with real chicken and wholesome grains.",
        )
        assert ok is True
        assert hits == []

    def test_none_description(self):
        ok, hits = check_dirty_html_markers(None)
        assert ok is True


# =========================================================================
# compute_canonical_duplicate_ratio
# =========================================================================


class TestComputeCanonicalDuplicateRatio:
    def test_no_duplicates(self):
        ratio = compute_canonical_duplicate_ratio([
            "https://cdn.example.com/img1.jpg?width=800",
            "https://cdn.example.com/img2.jpg?width=800",
        ])
        assert ratio == 0.0

    def test_all_duplicates(self):
        ratio = compute_canonical_duplicate_ratio([
            "https://cdn.example.com/img.jpg?width=800",
            "https://cdn.example.com/img.jpg?width=400",
            "https://cdn.example.com/img.jpg?width=200",
        ])
        # All 3 have the same canonical (scheme+netloc+path), so 1 unique / 3 raw = 0.667
        assert ratio == 1.0 - (1.0 / 3.0)

    def test_some_duplicates(self):
        # 3 URLs, 2 unique canonicals = ratio 1 - 2/3 = 0.333
        ratio = compute_canonical_duplicate_ratio([
            "https://cdn.example.com/img1.jpg?width=800",
            "https://cdn.example.com/img1.jpg?width=400",
            "https://cdn.example.com/img2.jpg?width=800",
        ])
        assert ratio == 1.0 - (2.0 / 3.0)

    def test_single_image(self):
        ratio = compute_canonical_duplicate_ratio([
            "https://cdn.example.com/img.jpg",
        ])
        assert ratio == 0.0

    def test_empty_list(self):
        assert compute_canonical_duplicate_ratio([]) == 0.0

    def test_none(self):
        assert compute_canonical_duplicate_ratio(None) == 0.0


# =========================================================================
# score_extraction (integration)
# =========================================================================


class TestScoreExtraction:
    def test_perfect_match(self):
        result = {
            "success": True,
            "product_name": "GoodGut Harvest Chicken Dog Kibble",
            "brand": "Open Farm",
            "description": "Made with Lifeway kefir (2 billion CFUs) and humanely-raised chicken.",
            "weight": "19 lb",
            "pet_type": "Dog",
            "food_form": "Dry Food",
            "flavor": "Chicken",
            "categories": ["Dog", "Food", "Dry Food"],
            "images": [
                "https://cdn.shopify.com/img1.jpg",
                "https://cdn.shopify.com/img2.jpg",
            ],
        }
        expected = {
            "brand": "Open Farm",
            "name_contains": ["GoodGut", "Dog Kibble"],
            "description_contains": ["Lifeway", "humanely-raised chicken"],
            "weight": "19 lb",
            "species": "Dog",
            "food_form": "Dry Food",
            "flavor_contains": ["Chicken"],
            "min_approved_images": 1,
            "max_approved_images": 12,
            "forbidden_image_domains": ["unsplash.com"],
            "forbidden_image_path_hints": ["recycle", "logo"],
        }
        tags = ["pet-food", "shopify"]

        score = score_extraction(result, expected, tags)
        assert score.brand_score == 1.0
        assert score.name_score == 1.0
        assert score.description_score == 1.0
        assert score.weight_match is True
        assert score.species_match is True
        assert score.food_form_match is True
        assert score.flavor_score == 1.0
        assert score.category_sane is True
        assert score.image_count_in_bounds is True
        assert score.hard_fails == []
        assert score.overall_score > 0.9

    def test_missing_all_fields(self):
        result = {
            "success": False,
            "error": "All extraction attempts failed",
        }
        expected = {
            "brand": "Open Farm",
            "name_contains": ["GoodGut"],
            "description_contains": ["test"],
            "weight": "19 lb",
            "species": "Dog",
            "food_form": "Dry Food",
            "flavor_contains": ["Chicken"],
            "min_approved_images": 1,
            "max_approved_images": 12,
        }
        tags = ["pet-food"]

        score = score_extraction(result, expected, tags)
        assert score.success is False
        assert score.brand_score == 0.0
        assert score.name_score == 0.0
        assert score.weight_match is False
        assert score.species_match is False
        assert score.image_count_in_bounds is False
        # category_sane stays True (no categories = not a protein-only violation),
        # contributing 0.05 weight. Everything else is 0.
        assert score.overall_score == 0.05

    def test_protein_category_hard_fail(self):
        result = {
            "success": True,
            "product_name": "GoodGut Chicken Kibble",
            "brand": "Open Farm",
            "description": "A product.",
            "weight": "19 lb",
            "pet_type": "Dog",
            "food_form": "Dry Food",
            "flavor": "Chicken",
            "categories": ["Poultry"],
            "images": ["https://cdn.shopify.com/img.jpg"],
        }
        expected = {
            "brand": "Open Farm",
            "name_contains": [],
            "description_contains": [],
            "weight": "19 lb",
            "species": "Dog",
            "food_form": "Dry Food",
            "flavor_contains": [],
            "min_approved_images": 1,
            "max_approved_images": 12,
        }
        tags = ["pet-food"]

        score = score_extraction(result, expected, tags, entry_id="test-1")
        assert score.category_sane is False
        assert any("category_protein_only" in f for f in score.hard_fails)
        assert score.overall_score <= 0.49

    def test_forbidden_image_domain_hard_fail(self):
        result = {
            "success": True,
            "product_name": "Test Product",
            "brand": "Open Farm",
            "description": "A test product.",
            "images": [
                "https://images.unsplash.com/photo-123",
                "https://cdn.shopify.com/img.jpg",
            ],
        }
        expected = {
            "brand": "Open Farm",
            "name_contains": [],
            "description_contains": [],
            "weight": "19 lb",
            "species": "Dog",
            "food_form": "Dry Food",
            "flavor_contains": [],
            "min_approved_images": 0,
            "max_approved_images": 99,
            "forbidden_image_domains": ["unsplash.com"],
        }
        tags = []

        score = score_extraction(result, expected, tags, entry_id="test-2")
        assert any("forbidden_image_domain" in f for f in score.hard_fails)
        assert score.forbidden_domain_hits == [
            "https://images.unsplash.com/photo-123",
        ]

    def test_dirty_html_hard_fail(self):
        result = {
            "success": True,
            "product_name": "Test",
            "brand": "Test",
            "description": (
                "This product has virtual_list items and "
                'data-qa="description" markers.'
            ),
            "images": ["https://cdn.example.com/img.jpg"],
        }
        expected = {
            "brand": "Test",
            "name_contains": [],
            "description_contains": [],
            "weight": "1 lb",
            "species": "Dog",
            "food_form": "Dry Food",
            "flavor_contains": [],
            "min_approved_images": 0,
            "max_approved_images": 99,
        }
        tags = []

        score = score_extraction(result, expected, tags, entry_id="test-3")
        assert any("dirty_html_markers" in f for f in score.hard_fails)

    def test_token_usage_captured(self):
        result = {
            "success": True,
            "product_name": "Test",
            "brand": "Test",
            "description": "Test description.",
            "images": ["https://cdn.example.com/img.jpg"],
            "token_usage": {
                "prompt_tokens": 100,
                "completion_tokens": 50,
                "total_tokens": 150,
            },
        }
        expected = {
            "brand": "Test",
            "name_contains": [],
            "description_contains": [],
            "weight": "1 lb",
            "species": "Dog",
            "food_form": "Dry Food",
            "flavor_contains": [],
            "min_approved_images": 0,
            "max_approved_images": 99,
        }
        tags = []

        score = score_extraction(result, expected, tags)
        assert score.token_usage is not None
        assert score.token_usage.get("total_tokens") == 150

    def test_duration_captured(self):
        result = {
            "success": True,
            "product_name": "Test",
            "brand": "Test",
            "description": "Test.",
            "images": ["https://cdn.example.com/img.jpg"],
            "duration_ms": 1234,
        }
        expected = {
            "brand": "Test",
            "name_contains": [],
            "description_contains": [],
            "weight": "1 lb",
            "species": "Dog",
            "food_form": "Dry Food",
            "flavor_contains": [],
            "min_approved_images": 0,
            "max_approved_images": 99,
        }
        tags = []
        score = score_extraction(result, expected, tags)
        assert score.duration_ms == 1234

    def test_warning_high_duration(self):
        result = {
            "success": True,
            "product_name": "Test",
            "brand": "Test",
            "description": "Test.",
            "images": ["https://cdn.example.com/img.jpg"],
            "duration_ms": 35000,
        }
        expected = {
            "brand": "Test",
            "name_contains": [],
            "description_contains": [],
            "weight": "1 lb",
            "species": "Dog",
            "food_form": "Dry Food",
            "flavor_contains": [],
            "min_approved_images": 0,
            "max_approved_images": 99,
        }
        tags = []
        score = score_extraction(result, expected, tags)
        assert "high_duration" in str(score.warnings)

    def test_warning_missing_token_usage(self):
        result = {
            "success": True,
            "product_name": "Test",
            "brand": "Test",
            "description": "Test.",
            "images": ["https://cdn.example.com/img.jpg"],
        }
        expected = {
            "brand": "Test",
            "name_contains": [],
            "description_contains": [],
            "weight": "1 lb",
            "species": "Dog",
            "food_form": "Dry Food",
            "flavor_contains": [],
            "min_approved_images": 0,
            "max_approved_images": 99,
        }
        tags = []
        score = score_extraction(result, expected, tags)
        assert "token_usage_unavailable" in str(score.warnings)

    def test_duplicate_ratio_warning(self):
        result = {
            "success": True,
            "product_name": "Test",
            "brand": "Test",
            "description": "Test.",
            "images": [
                "https://cdn.example.com/img.jpg?w=800",
                "https://cdn.example.com/img.jpg?w=400",
                "https://cdn.example.com/img.jpg?w=200",
                "https://cdn.example.com/img2.jpg",
                "https://cdn.example.com/img3.jpg",
            ],
        }
        expected = {
            "brand": "Test",
            "name_contains": [],
            "description_contains": [],
            "weight": "1 lb",
            "species": "Dog",
            "food_form": "Dry Food",
            "flavor_contains": [],
            "min_approved_images": 0,
            "max_approved_images": 99,
        }
        tags = []
        score = score_extraction(result, expected, tags)
        # 5 images, 3 unique canonicals = ratio 1-3/5 = 0.4, above 0.25
        assert score.duplicate_ratio > 0.25
        assert "high_duplicate_ratio" in str(score.warnings)


# =========================================================================
# summarize_scores
# =========================================================================


class TestSummarizeScores:
    def test_empty_list(self):
        summary = summarize_scores([])
        assert summary["total_entries"] == 0

    def test_single_result(self):
        result = {
            "success": True,
            "product_name": "Test Product",
            "brand": "Test Brand",
            "description": "A nice product.",
            "images": ["https://cdn.example.com/img.jpg"],
        }
        expected = {
            "brand": "Test Brand",
            "name_contains": ["Test Product"],
            "description_contains": ["nice"],
            "weight": "1 lb",
            "species": "Dog",
            "food_form": "Dry Food",
            "flavor_contains": [],
            "min_approved_images": 0,
            "max_approved_images": 99,
        }
        score = score_extraction(result, expected, [], entry_id="test-1")

        summary = summarize_scores([score])
        assert summary["total_entries"] == 1
        assert summary["overall_pass_rate"] == 1.0  # no hard fails
        assert summary["average_brand_score"] == 1.0
        assert summary["average_name_score"] > 0

    def test_mixed_results(self):
        # Create two scores: one perfect, one with hard fail
        s1 = ExtractionScore(
            entry_id="pass",
            success=True,
            brand_score=1.0,
            name_score=1.0,
            description_score=1.0,
            weight_match=True,
            species_match=True,
            food_form_match=True,
            flavor_score=1.0,
            category_sane=True,
            approved_image_count=3,
            image_count_in_bounds=True,
            hard_fails=[],
            warnings=[],
            overall_score=0.95,
        )
        s2 = ExtractionScore(
            entry_id="fail",
            success=True,
            brand_score=1.0,
            name_score=0.5,
            description_score=0.0,
            weight_match=False,
            species_match=False,
            food_form_match=False,
            flavor_score=0.0,
            category_sane=False,
            category_sane_reason="Protein-only",
            approved_image_count=0,
            image_count_in_bounds=False,
            forbidden_domain_hits=["https://unsplash.com/x"],
            hard_fails=["forbidden_image_domain", "category_protein_only"],
            warnings=["token_usage_unavailable"],
            overall_score=0.3,
        )

        summary = summarize_scores([s1, s2])
        assert summary["total_entries"] == 2
        assert summary["overall_pass_rate"] == 0.5
        assert summary["average_overall_score"] == 0.625
        assert "forbidden_image_domain" in summary["hard_fail_breakdown"]


# =========================================================================
# Constants validation
# =========================================================================


class TestConstants:
    def test_protein_only_values(self):
        assert isinstance(PROTEIN_ONLY_VALUES, set)
        assert "chicken" in PROTEIN_ONLY_VALUES
        assert len(PROTEIN_ONLY_VALUES) >= 8

    def test_dirty_html_markers(self):
        assert isinstance(DIRTY_HTML_MARKERS, list)
        assert "virtual_list" in DIRTY_HTML_MARKERS
        assert "bottomspacer" in DIRTY_HTML_MARKERS
        assert "data-qa=" in DIRTY_HTML_MARKERS
        assert "aria-setsize" in DIRTY_HTML_MARKERS

    def test_forbidden_domains(self):
        assert "images.unsplash.com" in FORBIDDEN_IMAGE_DOMAINS

    def test_forbidden_path_hints(self):
        assert "recycle" in FORBIDDEN_PATH_HINTS
        assert "logo" in FORBIDDEN_PATH_HINTS
        assert "footer" in FORBIDDEN_PATH_HINTS
        assert "transparency-map" in FORBIDDEN_PATH_HINTS
