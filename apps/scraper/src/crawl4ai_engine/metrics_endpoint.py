from __future__ import annotations

import logging
import os
import threading
from http.server import BaseHTTPRequestHandler

try:
    # Python 3.7+
    from http.server import ThreadingHTTPServer as HTTPServer
except Exception:
    from http.server import HTTPServer  # type: ignore

from typing import Optional, Any

from .metrics import get_metrics_collector

logger = logging.getLogger("metrics_endpoint")


class MetricsEndpointHandler(BaseHTTPRequestHandler):
    """HTTP handler that serves Prometheus-formatted metrics from the
    global Crawl4AIMetricsCollector.
    """

    def do_GET(self) -> None:  # pragma: no cover - simple plumbing
        if self.path != "/metrics":
            self.send_response(404)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"Not Found")
            return

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
            self.send_response(500)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"Internal Server Error")

    def log_message(self, format: str, *args: object) -> None:  # pragma: no cover - reduces noisy stderr
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
