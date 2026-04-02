from __future__ import annotations

import json
import logging
import os
import threading
import time as _time
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

try:
    # Python 3.7+
    from http.server import ThreadingHTTPServer as HTTPServer
except Exception:
    from http.server import HTTPServer  # type: ignore

from typing import Optional, Any

from .metrics import get_metrics_collector

logger = logging.getLogger("metrics_endpoint")


class MetricsEndpointHandler(BaseHTTPRequestHandler):
    """HTTP handler that serves metrics and health data."""

    def do_GET(self) -> None:  # pragma: no cover
        parsed_url = urlparse(self.path)
        path = parsed_url.path

        if path == "/metrics":
            self._handle_metrics()
        elif path == "/health":
            self._handle_health()
        elif path == "/selector-health":
            self._handle_selector_health(parsed_url)
        elif path == "/site-health":
            self._handle_site_health()
        else:
            self.send_response(404)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"Not Found")

    def _handle_metrics(self) -> None:
        try:
            collector = get_metrics_collector()
            payload = collector.get_prometheus_metrics()
            body = payload.encode("utf-8")

            self.send_response(200)
            # Prometheus text format v0.0.4
            self.send_header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            logger.exception("Failed to render metrics: %s", exc)
            self._send_error(500, "Internal Server Error")

    def _handle_health(self) -> None:
        """Simple health check for Docker."""
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"status": "healthy", "timestamp": _time.time()}).encode())

    def _handle_selector_health(self, parsed_url) -> None:
        """Get detailed selector health metrics."""
        try:
            from core.selector_health import get_selector_health_tracker
            tracker = get_selector_health_tracker()
            
            query_params = parse_qs(parsed_url.query)
            site = query_params.get("site", [None])[0]
            status = query_params.get("status", [None])[0]

            if status == "unhealthy":
                summaries = tracker.get_unhealthy_selectors(site=site)
            else:
                summaries = tracker.get_all_summaries()
                if site:
                    summaries = [s for s in summaries if s.site == site]

            response = {
                "status": "ok",
                "count": len(summaries),
                "selectors": [s.to_dict() for s in summaries],
                "threshold": tracker.alert_threshold,
            }
            
            self._send_json(response)
        except Exception as e:
            logger.exception("Failed to get selector health: %s", e)
            self._send_error(500, str(e))

    def _handle_site_health(self) -> None:
        """Get aggregated health metrics per site."""
        try:
            from core.selector_health import get_selector_health_tracker
            tracker = get_selector_health_tracker()
            all_summaries = tracker.get_all_summaries()

            # Group by site
            site_data = {}
            for s in all_summaries:
                if s.site not in site_data:
                    site_data[s.site] = {
                        "success_sum": 0.0,
                        "count": 0,
                        "healthy": 0,
                        "degraded": 0,
                        "failing": 0,
                    }

                stats = site_data[s.site]
                stats["success_sum"] += s.success_rate
                stats["count"] += 1

                if s.success_rate >= 0.9:
                    stats["healthy"] += 1
                elif s.success_rate >= tracker.alert_threshold:
                    stats["degraded"] += 1
                else:
                    stats["failing"] += 1

            results = []
            for site, stats in site_data.items():
                results.append({
                    "site": site,
                    "success_rate": round(stats["success_sum"] / stats["count"], 3) if stats["count"] > 0 else 1.0,
                    "total_selectors": stats["count"],
                    "healthy": stats["healthy"],
                    "degraded": stats["degraded"],
                    "failing": stats["failing"],
                })

            self._send_json({"status": "ok", "sites": results, "total_sites": len(results)})
        except Exception as e:
            logger.exception("Failed to get site health: %s", e)
            self._send_error(500, str(e))

    def _send_json(self, data: dict) -> None:
        body = json.dumps(data).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_error(self, code: int, message: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(message.encode("utf-8"))

    def log_message(self, format: str, *args: object) -> None:  # pragma: no cover
        # Route logs through standard logger to avoid printing to stderr
        logger.info("%s - - %s", self.client_address[0], format % args)


def start_metrics_server(port: Optional[int] = None):
    """Start a background HTTP server exposing /metrics.

    Args:
        port: TCP port to listen on. If None, reads METRICS_PORT env var or defaults to 8000.

    Returns:
        The HTTPServer instance and the Thread running serve_forever().
    """

    if port is None:
        port = int(os.environ.get("METRICS_PORT", "8000"))

    server_address = ("", int(port))
    httpd = HTTPServer(server_address, MetricsEndpointHandler)

    thread = threading.Thread(target=httpd.serve_forever, name="metrics-server-thread", daemon=True)
    thread.start()
    logger.info("Metrics server started on port %s", port)
    return httpd, thread


def stop_metrics_server(httpd: Optional[Any]) -> None:
    """Shutdown and close the given HTTPServer."""
    if httpd is None:
        return
    try:
        # The server exposes shutdown() in both HTTPServer and ThreadingHTTPServer
        if hasattr(httpd, "shutdown"):
            httpd.shutdown()  # type: ignore[attr-defined]
    except Exception:
        logger.exception("Error shutting down metrics server")
    try:
        if hasattr(httpd, "server_close"):
            httpd.server_close()  # type: ignore[attr-defined]
    except Exception:
        logger.exception("Error closing metrics server")
