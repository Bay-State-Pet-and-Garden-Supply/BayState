from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
pytest.importorskip("fastapi")
from fastapi.testclient import TestClient

from api.server import app
from core.selector_health import SelectorHealthSummary


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def mock_tracker():
    with patch("api.server.get_selector_health_tracker") as mock:
        tracker = MagicMock()
        tracker.alert_threshold = 0.7
        mock.return_value = tracker
        yield tracker


def test_get_selector_health_all(client, mock_tracker):
    """Test /observability/selector-health returns all selectors."""
    summary = SelectorHealthSummary(selector=".test", site="test_site", total_attempts=10, success_rate=0.8)
    mock_tracker.get_all_summaries.return_value = [summary]
    
    response = client.get("/observability/selector-health")
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["count"] == 1
    assert data["selectors"][0]["selector"] == ".test"


def test_get_selector_health_unhealthy(client, mock_tracker):
    """Test /observability/selector-health?status=unhealthy."""
    summary = SelectorHealthSummary(selector=".bad", site="test_site", total_attempts=10, success_rate=0.4)
    mock_tracker.get_unhealthy_selectors.return_value = [summary]
    
    response = client.get("/observability/selector-health?status=unhealthy")
    
    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 1
    assert data["selectors"][0]["selector"] == ".bad"
    mock_tracker.get_unhealthy_selectors.assert_called_once()


def test_get_site_health(client, mock_tracker):
    """Test /observability/site-health aggregated metrics."""
    s1 = SelectorHealthSummary(selector=".s1", site="site1", success_rate=1.0)
    s2 = SelectorHealthSummary(selector=".s2", site="site1", success_rate=0.5)
    mock_tracker.get_all_summaries.return_value = [s1, s2]
    
    response = client.get("/observability/site-health")
    
    assert response.status_code == 200
    data = response.json()
    assert data["total_sites"] == 1
    site = data["sites"][0]
    assert site["site"] == "site1"
    assert site["success_rate"] == 0.75
    assert site["total_selectors"] == 2
    assert site["healthy"] == 1
    assert site["failing"] == 1
