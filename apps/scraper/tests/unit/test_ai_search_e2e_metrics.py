from __future__ import annotations


from benchmarks.ai_search.dataset import ExtractionGroundTruth
from benchmarks.ai_search.metrics import (
    EndToEndResultRow,
    FieldQualityMetrics,
    PipelineStageMetrics,
    TimingMetrics,
    compute_field_quality,
    determine_failure_stage,
    score_brand,
    score_categories,
    score_description,
    score_images,
    score_name,
    score_size_metrics,
    summarize,
)


class TestFieldScoring:
    def test_score_brand_exact_match(self) -> None:
        assert score_brand("Acme", "Acme") == 1.0

    def test_score_brand_fuzzy_match(self) -> None:
        assert score_brand("acme corp", "Acme Corp") > 0.8

    def test_score_brand_no_match(self) -> None:
        assert score_brand("Other", "Acme") == 0.0

    def test_score_brand_empty(self) -> None:
        assert score_brand(None, "Acme") == 0.0
        assert score_brand("", "Acme") == 0.0

    def test_score_name_exact_match(self) -> None:
        assert score_name("Widget Pro", "Widget Pro") == 1.0

    def test_score_name_partial_match(self) -> None:
        score = score_name("Widget Pro 10oz", "Widget Pro 12oz")
        assert 0.5 < score < 1.0

    def test_score_name_no_match(self) -> None:
        assert score_name("Something Else", "Widget Pro") == 0.0

    def test_score_description_all_substrings_found(self) -> None:
        assert score_description("Great widget with fast shipping", ["widget", "fast"]) == 1.0

    def test_score_description_some_substrings_found(self) -> None:
        assert score_description("Great widget", ["widget", "fast"]) == 0.5

    def test_score_description_no_expectations(self) -> None:
        assert score_description("Anything", []) == 1.0

    def test_score_size_metrics_exact_match(self) -> None:
        assert score_size_metrics("10 oz", "10 oz") == 1.0

    def test_score_size_metrics_normalized_match(self) -> None:
        # Substring containment gives high score
        assert score_size_metrics("10 oz bag", "10 oz") > 0.5
        # Variant token overlap handles "10oz" vs "10 oz"
        assert score_size_metrics("10oz", "10 oz") > 0.5

    def test_score_size_metrics_none_expected(self) -> None:
        assert score_size_metrics("10 oz", None) == 1.0

    def test_score_images_required_and_present(self) -> None:
        assert score_images(["https://example.com/img.jpg"], True) == 1.0

    def test_score_images_required_but_missing(self) -> None:
        assert score_images([], True) == 0.0

    def test_score_images_not_required(self) -> None:
        assert score_images([], False) == 1.0

    def test_score_categories_overlap(self) -> None:
        assert score_categories(["Dog Food", "Dry"], ["Dog Food", "Wet"]) > 0.0

    def test_score_categories_exact(self) -> None:
        assert score_categories(["Dog Food"], ["Dog Food"]) == 1.0

    def test_score_categories_no_expectations(self) -> None:
        assert score_categories(["Anything"], []) == 1.0

    def test_score_categories_does_not_exceed_one(self) -> None:
        # Many extracted categories should not push score above 1.0
        assert score_categories(["A", "B", "C", "D", "E"], ["A"]) <= 1.0

    def test_score_categories_at_exactly_one(self) -> None:
        # Extracted superset of expected should score exactly 1.0, not higher
        score = score_categories(["A", "B", "C"], ["A"])
        assert score == 1.0, f"Expected 1.0, got {score}"
        # Exact match with multiple categories
        score = score_categories(["Dog Food", "Dry"], ["Dog Food", "Dry"])
        assert score == 1.0, f"Expected 1.0, got {score}"


class TestComputeFieldQuality:
    def test_compute_field_quality_with_full_ground_truth(self) -> None:
        ground_truth = ExtractionGroundTruth(
            brand="Acme",
            name="Widget Pro",
            description_contains=["widget", "pro"],
            size_metrics="10 oz",
            image_required=True,
            categories=["Widgets", "Tools"],
        )
        extraction_result = {
            "brand": "Acme",
            "product_name": "Widget Pro",
            "description": "The best widget pro available",
            "size_metrics": "10 oz",
            "images": ["https://example.com/img.jpg"],
            "categories": ["Widgets", "Tools"],
        }
        quality = compute_field_quality(extraction_result, ground_truth)
        assert quality.brand_score == 1.0
        assert quality.name_score == 1.0
        assert quality.description_score == 1.0
        assert quality.size_metrics_score == 1.0
        assert quality.image_score == 1.0
        assert quality.categories_score == 1.0
        assert quality.overall_score > 0.9

    def test_compute_field_quality_with_no_ground_truth(self) -> None:
        quality = compute_field_quality({}, None)
        assert quality.overall_score == 0.0


class TestDetermineFailureStage:
    def test_search_failure(self) -> None:
        stages = PipelineStageMetrics(search_success=False)
        stage, reason = determine_failure_stage(stages, FieldQualityMetrics(), None)
        assert stage == "search"
        assert "search results" in reason

    def test_url_selection_failure(self) -> None:
        stages = PipelineStageMetrics(search_success=True, url_selection_success=False)
        stage, reason = determine_failure_stage(stages, FieldQualityMetrics(), None)
        assert stage == "url_selection"

    def test_domain_mismatch(self) -> None:
        stages = PipelineStageMetrics(search_success=True, url_selection_success=True, domain_match=False)
        stage, reason = determine_failure_stage(stages, FieldQualityMetrics(), None)
        assert stage == "url_selection"
        assert "domain" in reason.lower()

    def test_crawl_failure(self) -> None:
        stages = PipelineStageMetrics(
            search_success=True, url_selection_success=True, domain_match=True, crawl_success=False
        )
        stage, reason = determine_failure_stage(stages, FieldQualityMetrics(), None)
        assert stage == "crawl"

    def test_extraction_failure(self) -> None:
        stages = PipelineStageMetrics(
            search_success=True,
            url_selection_success=True,
            domain_match=True,
            crawl_success=True,
            extraction_success=False,
        )
        stage, reason = determine_failure_stage(stages, FieldQualityMetrics(), None)
        assert stage == "extraction"

    def test_validation_failure(self) -> None:
        stages = PipelineStageMetrics(
            search_success=True,
            url_selection_success=True,
            domain_match=True,
            crawl_success=True,
            extraction_success=True,
            validation_passed=False,
        )
        stage, reason = determine_failure_stage(stages, FieldQualityMetrics(), "brand mismatch")
        assert stage == "validation"
        assert "brand mismatch" in reason

    def test_data_quality_failure(self) -> None:
        stages = PipelineStageMetrics(
            search_success=True,
            url_selection_success=True,
            domain_match=True,
            crawl_success=True,
            extraction_success=True,
            validation_passed=True,
            data_quality_passed=False,
        )
        stage, reason = determine_failure_stage(stages, FieldQualityMetrics(overall_score=0.3), None)
        assert stage == "data_quality"
        assert "0.30" in reason

    def test_all_pass(self) -> None:
        stages = PipelineStageMetrics(
            search_success=True,
            url_selection_success=True,
            domain_match=True,
            crawl_success=True,
            extraction_success=True,
            validation_passed=True,
            data_quality_passed=True,
            end_to_end_success=True,
        )
        stage, reason = determine_failure_stage(stages, FieldQualityMetrics(overall_score=0.9), None)
        assert stage is None
        assert reason is None


class TestSummarize:
    def test_summarize_empty(self) -> None:
        summary = summarize([])
        assert summary["total_entries"] == 0
        assert summary["end_to_end_success_rate"] == 0.0

    def test_summarize_mixed_results(self) -> None:
        rows = [
            EndToEndResultRow(
                sku="SKU-1",
                brand="A",
                product_name="One",
                expected_source_url="https://a.com/1",
                expected_official_domains=["a.com"],
                source_type="official",
                stages=PipelineStageMetrics(
                    search_success=True,
                    url_selection_success=True,
                    domain_match=True,
                    crawl_success=True,
                    extraction_success=True,
                    validation_passed=True,
                    data_quality_passed=True,
                    end_to_end_success=True,
                ),
                field_quality=FieldQualityMetrics(brand_score=1.0, name_score=0.8, overall_score=0.9),
                timing=TimingMetrics(total_ms=1000),
            ),
            EndToEndResultRow(
                sku="SKU-2",
                brand="B",
                product_name="Two",
                expected_source_url="https://b.com/2",
                expected_official_domains=["b.com"],
                source_type="official",
                stages=PipelineStageMetrics(
                    search_success=True,
                    url_selection_success=False,
                    end_to_end_success=False,
                ),
                failure_stage="url_selection",
                field_quality=FieldQualityMetrics(),
                timing=TimingMetrics(total_ms=2000),
            ),
        ]
        summary = summarize(rows)
        assert summary["total_entries"] == 2
        assert summary["end_to_end_success_rate"] == 0.5
        assert summary["url_selection_success_rate"] == 0.5
        assert summary["average_brand_score"] == 1.0
        assert summary["average_name_score"] == 0.8
        assert summary["failure_breakdown"] == {"url_selection": 1}
