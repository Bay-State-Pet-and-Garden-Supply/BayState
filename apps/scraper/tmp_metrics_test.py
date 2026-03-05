from __future__ import annotations

import time
import urllib.request
from pathlib import Path

from src.crawl4ai_engine.metrics_endpoint import start_metrics_server


def main() -> None:
    httpd, thread = start_metrics_server(8000)
    try:
        # give server a moment to start
        time.sleep(0.5)
        with urllib.request.urlopen("http://localhost:8000/metrics", timeout=5) as r:
            body = r.read().decode("utf-8")

        out_path = Path(".sisyphus/evidence/t1-metrics-endpoint-response.txt")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(body)
        print("WROTE:", out_path)
        # also print first 20 lines for quick verification
        for i, line in enumerate(body.splitlines()):
            if i >= 20:
                break
            print(line)
    finally:
        try:
            httpd.shutdown()
        except Exception:
            pass
        try:
            httpd.server_close()
        except Exception:
            pass


if __name__ == "__main__":
    main()
