"""Serve the demo locally with a server-side AMap keyword search proxy."""

import argparse
import json
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import urlopen


AMAP_SEARCH = "https://restapi.amap.com/v3/place/text"


class DemoHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        url = urlsplit(self.path)
        if url.path != "/api/amap/poi-search":
            return super().do_GET()

        query = parse_qs(url.query)
        keywords = query.get("keywords", [""])[0].strip()
        city = query.get("city", [""])[0].strip()
        if not keywords or not city or len(keywords) > 60 or len(city) > 40:
            return self.send_json(400, {"info": "INVALID_QUERY"})

        key = os.environ.get("SEETIME_AMAP_WEB_SERVICE_KEY", "").strip()
        if not key:
            return self.send_json(503, {"info": "POI_SEARCH_NOT_CONFIGURED"})

        params = urlencode({
            "key": key,
            "keywords": keywords,
            "city": city,
            "citylimit": "true",
            "offset": "20",
            "page": "1",
            "extensions": "all",
        })
        try:
            with urlopen(f"{AMAP_SEARCH}?{params}", timeout=8) as response:
                result = json.load(response)
        except (OSError, ValueError):
            return self.send_json(502, {"info": "AMAP_UPSTREAM_UNAVAILABLE"})
        self.send_json(200, result)

    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8794)
    args = parser.parse_args()
    directory = Path(__file__).resolve().parent.parent
    handler = partial(DemoHandler, directory=directory)
    with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        print(f"SeeTime demo: http://127.0.0.1:{args.port}", flush=True)
        server.serve_forever()
