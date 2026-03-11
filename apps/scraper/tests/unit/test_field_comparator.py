from tests.evaluation.field_comparator import compare_exact
from tests.evaluation.field_comparator import compare_field
from tests.evaluation.field_comparator import compare_lists
from tests.evaluation.field_comparator import compare_text
from tests.evaluation.types import MatchType


def test_compare_text_returns_high_similarity_for_related_strings():
    result = compare_text("Scotts NatureScapes Mulch", "Scotts NatureScapes Color Enhanced Mulch")

    assert result.match_score > 0.7
    assert result.match_type == MatchType.FUZZY


def test_compare_lists_uses_overlap_percentage():
    result = compare_lists(
        ["Pet Supplies", "Dog", "Food"],
        ["Pet Supplies", "Food", "Sale"],
    )

    assert result.match_score == 0.5
    assert result.match_type == MatchType.PARTIAL


def test_compare_exact_is_case_insensitive():
    result = compare_exact("SKU-123", "sku-123")

    assert result.match_score == 1.0
    assert result.match_type == MatchType.EXACT


def test_compare_field_dispatches_to_exact_for_brand_and_sku():
    brand_result = compare_field("brand", "Blue Buffalo", "blue buffalo")
    sku_result = compare_field("sku", "AB-99", "ab-99")

    assert brand_result.match_score == 1.0
    assert brand_result.match_type == MatchType.EXACT
    assert sku_result.match_score == 1.0
    assert sku_result.match_type == MatchType.EXACT


def test_compare_field_dispatches_to_list_comparison():
    result = compare_field("categories", ["A", "B"], ["B", "C"])

    assert result.match_score == 1.0 / 3.0
    assert result.match_type == MatchType.PARTIAL


def test_compare_text_handles_none_and_empty_values():
    both_empty = compare_text(None, "")
    one_empty = compare_text(None, "Scotts")

    assert both_empty.match_score == 1.0
    assert both_empty.match_type == MatchType.EXACT
    assert one_empty.match_score == 0.0
    assert one_empty.match_type == MatchType.NONE


def test_compare_lists_handles_none_values():
    both_none = compare_lists(None, None)
    expected_none = compare_lists(None, ["a"])

    assert both_none.match_score == 1.0
    assert both_none.match_type == MatchType.EXACT
    assert expected_none.match_score == 0.0
    assert expected_none.match_type == MatchType.NONE


def test_compare_text_exposes_score_alias_for_qa_script():
    result = compare_text("Scotts Mulch", "Scotts NatureScapes Mulch")

    assert result.score == result.match_score
    assert result.score > 0.7
