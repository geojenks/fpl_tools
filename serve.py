#!/usr/bin/env python3
"""Serve the viewer and proxy /api/* to the FPL API (which blocks browser calls).

    python3 serve.py              # http://localhost:8000
    python3 serve.py --lan        # also reachable from your phone on the same Wi-Fi

Standard library only. Responses are cached briefly so a page left open
doesn't hammer FPL.
"""
import argparse
import gzip
import socket
import threading
import time
import urllib.error
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

UPSTREAM = "https://fantasy.premierleague.com/api/"
WEB_DIR = Path(__file__).resolve().parent / "web"
USER_AGENT = "Mozilla/5.0 (fpl_tools live viewer)"

# Seconds to cache each endpoint family; live data refreshes fastest.
TTL = [
    ("bootstrap-static", 300),
    ("leagues-", 120),
    ("entry/", 120),
    ("event/", 30),
    ("fixtures", 30),
]
_cache: dict[str, tuple[float, int, bytes]] = {}
_lock = threading.Lock()


def ttl_for(path: str) -> int:
    for prefix, ttl in TTL:
        if path.startswith(prefix):
            return ttl
    return 30


def fetch_upstream(path: str) -> tuple[int, bytes]:
    now = time.time()
    with _lock:
        hit = _cache.get(path)
        if hit and hit[0] > now:
            return hit[1], hit[2]
    req = urllib.request.Request(
        UPSTREAM + path,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json", "Accept-Encoding": "gzip"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            status, body = r.status, r.read()
            if r.headers.get("Content-Encoding") == "gzip":
                body = gzip.decompress(body)
    except urllib.error.HTTPError as e:
        status, body = e.code, e.read() or b"{}"
    if status == 200:
        with _lock:
            _cache[path] = (now + ttl_for(path), status, body)
    return status, body


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/api/"):
            path = self.path[len("/api/"):]
            if ".." in path:
                self.send_error(400)
                return
            try:
                status, body = fetch_upstream(path)
            except Exception as exc:  # network down, DNS, timeout
                self.send_error(502, f"FPL unreachable: {exc}")
                return
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def log_message(self, fmt, *args):
        if "/api/" not in str(args[0] if args else ""):
            super().log_message(fmt, *args)


def lan_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
    except OSError:
        return "your-computer-ip"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--lan", action="store_true", help="listen on all interfaces so phones on your Wi-Fi can connect")
    args = ap.parse_args()
    host = "0.0.0.0" if args.lan else "127.0.0.1"
    server = ThreadingHTTPServer((host, args.port), partial(Handler, directory=str(WEB_DIR)))
    print(f"FPL viewer on http://localhost:{args.port}/")
    if args.lan:
        print(f"On your phone (same Wi-Fi): http://{lan_ip()}:{args.port}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
