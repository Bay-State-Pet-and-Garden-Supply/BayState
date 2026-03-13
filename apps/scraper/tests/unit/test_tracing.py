"""Unit tests for the tracing collector module."""

from __future__ import annotations

import asyncio
import os
import shutil
import sys
import time
import zipfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))

from utils.scraping.tracing import (
    DEFAULT_RETENTION_DAYS,
    MAX_RETENTION_DAYS,
    TracingCollector,
    TracingConfig,
    collect_traces,
    get_default_traces_dir,
)


class TestTracingCollector:
    """Tests for the TracingCollector class."""

    @pytest.fixture
    def temp_traces_dir(self, tmp_path):
        """Create a temporary directory for traces."""
        traces_dir = tmp_path / "traces"
        traces_dir.mkdir()
        yield traces_dir
        # Cleanup
        if traces_dir.exists():
            shutil.rmtree(traces_dir)

    @pytest.fixture
    def mock_context(self):
        """Create a mock Playwright BrowserContext."""
        context = MagicMock()
        context.tracing = MagicMock()
        context.tracing.start = AsyncMock()
        context.tracing.stop = AsyncMock()
        return context

    def test_init_creates_directory(self, tmp_path):
        """Test that initialization creates the traces directory."""
        traces_dir = tmp_path / "new_traces_dir"
        assert not traces_dir.exists()

        collector = TracingCollector(traces_dir=traces_dir)

        assert traces_dir.exists()
        assert traces_dir.is_dir()

    def test_init_default_retention(self, tmp_path):
        """Test default retention days."""
        traces_dir = tmp_path / "traces"
        collector = TracingCollector(traces_dir=traces_dir)

        assert collector.retention_days == DEFAULT_RETENTION_DAYS
        assert collector.enabled is True

    def test_init_custom_retention(self, tmp_path):
        """Test custom retention days."""
        traces_dir = tmp_path / "traces"
        collector = TracingCollector(traces_dir=traces_dir, retention_days=14)

        assert collector.retention_days == 14

    def test_init_retention_clamped_to_max(self, tmp_path):
        """Test that retention days are clamped to maximum."""
        traces_dir = tmp_path / "traces"
        collector = TracingCollector(traces_dir=traces_dir, retention_days=100)

        assert collector.retention_days == MAX_RETENTION_DAYS

    def test_init_retention_clamped_to_min(self, tmp_path):
        """Test that retention days are clamped to minimum."""
        traces_dir = tmp_path / "traces"
        collector = TracingCollector(traces_dir=traces_dir, retention_days=0)

        assert collector.retention_days == 1

    def test_init_disabled(self, tmp_path):
        """Test disabled collector initialization."""
        traces_dir = tmp_path / "traces"
        collector = TracingCollector(traces_dir=traces_dir, enabled=False)

        assert collector.enabled is False

    @pytest.mark.asyncio
    async def test_start_starts_tracing(self, temp_traces_dir, mock_context):
        """Test that start() initiates tracing on the context."""
        collector = TracingCollector(traces_dir=temp_traces_dir)

        await collector.start(mock_context, "test_site")

        mock_context.tracing.start.assert_called_once_with(
            screenshots=True,
            snapshots=True,
            sources=True,
        )
        assert collector._is_collecting is True
        assert collector._current_trace_path is not None

    @pytest.mark.asyncio
    async def test_start_disabled_does_nothing(self, temp_traces_dir, mock_context):
        """Test that start() does nothing when disabled."""
        collector = TracingCollector(traces_dir=temp_traces_dir, enabled=False)

        await collector.start(mock_context, "test_site")

        mock_context.tracing.start.assert_not_called()
        assert collector._is_collecting is False

    @pytest.mark.asyncio
    async def test_start_with_sku_and_job_id(self, temp_traces_dir, mock_context):
        """Test that start() includes SKU and job ID in filename."""
        collector = TracingCollector(traces_dir=temp_traces_dir)

        await collector.start(mock_context, "amazon", sku="ABC123", job_id="job-456")

        assert "amazon_ABC123_job-456_" in str(collector._current_trace_path)
        assert collector._current_trace_path.suffix == ".zip"

    @pytest.mark.asyncio
    async def test_start_double_start_raises(self, temp_traces_dir, mock_context):
        """Test that starting tracing twice raises an error."""
        collector = TracingCollector(traces_dir=temp_traces_dir)

        await collector.start(mock_context, "test_site")

        with pytest.raises(RuntimeError, match="Tracing already in progress"):
            await collector.start(mock_context, "test_site")

    @pytest.mark.asyncio
    async def test_stop_saves_trace(self, temp_traces_dir, mock_context):
        """Test that stop() saves the trace file when save=True."""
        collector = TracingCollector(traces_dir=temp_traces_dir)

        # Create a dummy trace file
        trace_path = temp_traces_dir / "test_trace.zip"
        trace_path.write_bytes(b"dummy trace content")

        await collector.start(mock_context, "test_site")
        collector._current_trace_path = trace_path

        result = await collector.stop(mock_context, save=True)

        mock_context.tracing.stop.assert_called_once_with(path=str(trace_path))
        assert collector._is_collecting is False
        assert result == trace_path

    @pytest.mark.asyncio
    async def test_stop_discards_trace(self, temp_traces_dir, mock_context):
        """Test that stop() discards the trace when save=False."""
        collector = TracingCollector(traces_dir=temp_traces_dir)

        await collector.start(mock_context, "test_site")

        result = await collector.stop(mock_context, save=False)

        mock_context.tracing.stop.assert_called_once_with()
        assert collector._is_collecting is False
        assert result is None

    @pytest.mark.asyncio
    async def test_stop_disabled_does_nothing(self, temp_traces_dir, mock_context):
        """Test that stop() does nothing when disabled."""
        collector = TracingCollector(traces_dir=temp_traces_dir, enabled=False)

        result = await collector.stop(mock_context, save=True)

        mock_context.tracing.stop.assert_not_called()
        assert result is None

    @pytest.mark.asyncio
    async def test_stop_not_collecting_does_nothing(self, temp_traces_dir, mock_context):
        """Test that stop() does nothing when not collecting."""
        collector = TracingCollector(traces_dir=temp_traces_dir)

        result = await collector.stop(mock_context, save=True)

        mock_context.tracing.stop.assert_not_called()
        assert result is None

    @pytest.mark.asyncio
    async def test_stop_handles_exception(self, temp_traces_dir, mock_context):
        """Test that stop() handles exceptions gracefully."""
        collector = TracingCollector(traces_dir=temp_traces_dir)

        await collector.start(mock_context, "test_site")
        mock_context.tracing.stop.side_effect = Exception("Stop failed")

        with pytest.raises(Exception, match="Stop failed"):
            await collector.stop(mock_context, save=True)

        # Should reset state even on exception
        assert collector._is_collecting is False
        assert collector._current_trace_path is None


class TestTracingCleanup:
    """Tests for trace cleanup functionality."""

    @pytest.fixture
    def temp_traces_dir(self, tmp_path):
        """Create a temporary directory with some trace files."""
        traces_dir = tmp_path / "traces"
        traces_dir.mkdir()

        # Create some trace files with different ages
        current_time = time.time()

        # Recent file (within retention)
        recent_file = traces_dir / "recent.zip"
        recent_file.write_bytes(b"recent")
        os.utime(recent_file, (current_time, current_time))

        # Old file (beyond retention)
        old_file = traces_dir / "old.zip"
        old_file.write_bytes(b"old")
        os.utime(old_file, (current_time - 10 * 24 * 60 * 60, current_time - 10 * 24 * 60 * 60))

        # Very old file
        very_old_file = traces_dir / "very_old.zip"
        very_old_file.write_bytes(b"very_old")
        os.utime(very_old_file, (current_time - 20 * 24 * 60 * 60, current_time - 20 * 24 * 60 * 60))

        yield traces_dir

        # Cleanup
        if traces_dir.exists():
            shutil.rmtree(traces_dir)

    def test_cleanup_old_traces(self, temp_traces_dir):
        """Test that old traces are cleaned up."""
        collector = TracingCollector(traces_dir=temp_traces_dir, retention_days=7)

        removed = collector._cleanup_old_traces()

        # Should remove old.zip and very_old.zip
        assert removed == 2
        assert not (temp_traces_dir / "old.zip").exists()
        assert not (temp_traces_dir / "very_old.zip").exists()
        assert (temp_traces_dir / "recent.zip").exists()

    def test_cleanup_no_old_files(self, temp_traces_dir):
        """Test cleanup when no old files exist."""
        collector = TracingCollector(traces_dir=temp_traces_dir, retention_days=30)

        removed = collector._cleanup_old_traces()

        assert removed == 0
        assert (temp_traces_dir / "recent.zip").exists()
        assert (temp_traces_dir / "old.zip").exists()
        assert (temp_traces_dir / "very_old.zip").exists()

    def test_cleanup_all_traces(self, temp_traces_dir):
        """Test cleanup_all_traces removes all traces."""
        collector = TracingCollector(traces_dir=temp_traces_dir)

        removed = collector.cleanup_all_traces()

        assert removed == 3
        assert len(list(temp_traces_dir.glob("*.zip"))) == 0


class TestTracingContextManager:
    """Tests for the collect_traces context manager."""

    @pytest.fixture
    def temp_traces_dir(self, tmp_path):
        """Create a temporary directory for traces."""
        traces_dir = tmp_path / "traces"
        traces_dir.mkdir()
        yield traces_dir
        if traces_dir.exists():
            shutil.rmtree(traces_dir)

    @pytest.fixture
    def mock_context(self):
        """Create a mock Playwright BrowserContext."""
        context = MagicMock()
        context.tracing = MagicMock()
        context.tracing.start = AsyncMock()
        context.tracing.stop = AsyncMock()
        return context

    @pytest.mark.asyncio
    async def test_context_manager_saves_on_exception(self, temp_traces_dir, mock_context):
        """Test that context manager saves trace on exception."""
        collector = TracingCollector(traces_dir=temp_traces_dir)

        with pytest.raises(ValueError, match="Test error"):
            async with collect_traces(collector, mock_context, "test_site"):
                raise ValueError("Test error")

        # Should have called stop with save=True
        mock_context.tracing.stop.assert_called_once()
        call_args = mock_context.tracing.stop.call_args
        assert call_args[1].get("save") is True or call_args[0][0] is True

    @pytest.mark.asyncio
    async def test_context_manager_discards_on_success(self, temp_traces_dir, mock_context):
        """Test that context manager discards trace on success."""
        collector = TracingCollector(traces_dir=temp_traces_dir)

        async with collect_traces(collector, mock_context, "test_site"):
            pass  # No exception

        # Should have called stop with save=False
        mock_context.tracing.stop.assert_called_once()
        call_args = mock_context.tracing.stop.call_args
        assert call_args[1].get("save") is False or len(call_args[0]) == 0

    @pytest.mark.asyncio
    async def test_context_manager_yields_collector(self, temp_traces_dir, mock_context):
        """Test that context manager yields the collector."""
        collector = TracingCollector(traces_dir=temp_traces_dir)

        async with collect_traces(collector, mock_context, "test_site") as ctx_collector:
            assert ctx_collector is collector


class TestTracingConfig:
    """Tests for the TracingConfig class."""

    def test_default_config(self, tmp_path):
        """Test default configuration values."""
        config = TracingConfig()

        assert config.enabled is True
        assert config.traces_dir.name == "traces"
        assert config.retention_days == DEFAULT_RETENTION_DAYS
        assert config.save_on_success is False

    def test_custom_config(self, tmp_path):
        """Test custom configuration values."""
        traces_dir = tmp_path / "custom_traces"
        config = TracingConfig(
            enabled=False,
            traces_dir=traces_dir,
            retention_days=14,
            save_on_success=True,
        )

        assert config.enabled is False
        assert config.traces_dir == traces_dir
        assert config.retention_days == 14
        assert config.save_on_success is True

    def test_create_collector(self, tmp_path):
        """Test creating a collector from config."""
        traces_dir = tmp_path / "custom_traces"
        config = TracingConfig(
            enabled=False,
            traces_dir=traces_dir,
            retention_days=21,
        )

        collector = config.create_collector()

        assert isinstance(collector, TracingCollector)
        assert collector.enabled is False
        assert collector.traces_dir == traces_dir
        assert collector.retention_days == 21


class TestGetTraceInfo:
    """Tests for the get_trace_info method."""

    @pytest.fixture
    def temp_traces_dir(self, tmp_path):
        """Create a temporary directory with trace files."""
        traces_dir = tmp_path / "traces"
        traces_dir.mkdir()

        # Create a trace file
        trace_file = traces_dir / "test_trace_12345.zip"
        trace_file.write_bytes(b"test content")

        yield traces_dir

        if traces_dir.exists():
            shutil.rmtree(traces_dir)

    def test_get_trace_info(self, temp_traces_dir):
        """Test getting trace information."""
        collector = TracingCollector(traces_dir=temp_traces_dir)

        info = collector.get_trace_info()

        assert info["enabled"] is True
        assert info["is_collecting"] is False
        assert info["retention_days"] == DEFAULT_RETENTION_DAYS
        assert info["current_trace_path"] is None
        assert len(info["stored_traces"]) == 1
        assert info["stored_traces"][0]["filename"] == "test_trace_12345.zip"
        assert "size_kb" in info["stored_traces"][0]
        assert "created_at" in info["stored_traces"][0]


class TestGetDefaultTracesDir:
    """Tests for the get_default_traces_dir function."""

    def test_finds_git_directory(self, tmp_path, monkeypatch):
        """Test finding project root with .git directory."""
        # Create a temporary project structure
        project_dir = tmp_path / "project"
        project_dir.mkdir()
        git_dir = project_dir / ".git"
        git_dir.mkdir()

        # Change to a subdirectory
        subdir = project_dir / "subdir"
        subdir.mkdir()
        monkeypatch.chdir(subdir)

        result = get_default_traces_dir()

        assert result == project_dir / "traces"

    def test_finds_requirements_txt(self, tmp_path, monkeypatch):
        """Test finding project root with requirements.txt."""
        project_dir = tmp_path / "project"
        project_dir.mkdir()
        requirements = project_dir / "requirements.txt"
        requirements.write_text("pytest")

        monkeypatch.chdir(project_dir)

        result = get_default_traces_dir()

        assert result == project_dir / "traces"

    def test_fallback_to_current_directory(self, tmp_path, monkeypatch):
        """Test fallback to current directory when no markers found."""
        empty_dir = tmp_path / "empty"
        empty_dir.mkdir()
        monkeypatch.chdir(empty_dir)

        result = get_default_traces_dir()

        assert result == empty_dir / "traces"


class TestTracingIntegration:
    """Integration-style tests for tracing functionality."""

    @pytest.fixture
    def temp_traces_dir(self, tmp_path):
        """Create a temporary directory for traces."""
        traces_dir = tmp_path / "traces"
        traces_dir.mkdir()
        yield traces_dir
        if traces_dir.exists():
            shutil.rmtree(traces_dir)

    @pytest.fixture
    def mock_context(self):
        """Create a mock Playwright BrowserContext."""
        context = MagicMock()
        context.tracing = MagicMock()
        context.tracing.start = AsyncMock()
        context.tracing.stop = AsyncMock()
        return context

    @pytest.mark.asyncio
    async def test_full_workflow_success(self, temp_traces_dir, mock_context):
        """Test complete workflow with successful execution."""
        collector = TracingCollector(traces_dir=temp_traces_dir)

        # Simulate a successful scrape
        await collector.start(mock_context, "amazon", sku="SKU123")

        # Verify trace started
        assert collector._is_collecting is True
        mock_context.tracing.start.assert_called_once()

        # Stop without saving (success case)
        await collector.stop(mock_context, save=False)

        # Verify trace stopped without saving
        mock_context.tracing.stop.assert_called_once_with()
        assert collector._is_collecting is False

    @pytest.mark.asyncio
    async def test_full_workflow_failure(self, temp_traces_dir, mock_context):
        """Test complete workflow with failed execution."""
        collector = TracingCollector(traces_dir=temp_traces_dir)

        # Create a dummy trace file that would be "saved"
        trace_path = temp_traces_dir / "test_failure.zip"
        trace_path.write_bytes(b"dummy trace data")

        await collector.start(mock_context, "amazon", sku="SKU123")
        collector._current_trace_path = trace_path

        # Stop with saving (failure case)
        result = await collector.stop(mock_context, save=True)

        # Verify trace was saved
        mock_context.tracing.stop.assert_called_once_with(path=str(trace_path))
        assert result == trace_path

    @pytest.mark.asyncio
    async def test_multiple_start_stop_cycles(self, temp_traces_dir, mock_context):
        """Test multiple start/stop cycles work correctly."""
        collector = TracingCollector(traces_dir=temp_traces_dir)

        for i in range(3):
            await collector.start(mock_context, "test_site", sku=f"SKU{i}")
            assert collector._is_collecting is True

            await collector.stop(mock_context, save=False)
            assert collector._is_collecting is False

            # Reset mock for next iteration
            mock_context.tracing.start.reset_mock()
            mock_context.tracing.stop.reset_mock()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
