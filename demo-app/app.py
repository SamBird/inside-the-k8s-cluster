#!/usr/bin/env python3
import json
import os
import socket
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock
from urllib.parse import urlparse


def env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


class DemoState:
    def __init__(self) -> None:
        self._lock = Lock()
        self.request_count = 0
        self.ready = env_bool("INITIAL_READINESS", True)

    def increment_requests(self) -> int:
        with self._lock:
            self.request_count += 1
            return self.request_count

    def set_ready(self, value: bool) -> None:
        with self._lock:
            self.ready = value

    def reset_requests(self) -> None:
        with self._lock:
            self.request_count = 0

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "podName": os.getenv("POD_NAME") or socket.gethostname(),
                "nodeName": os.getenv("NODE_NAME", "unknown"),
                "namespace": os.getenv("POD_NAMESPACE", "default"),
                "podIP": os.getenv("POD_IP", "unknown"),
                "imageVersion": os.getenv("APP_VERSION", "dev"),
                "requestCount": self.request_count,
                "readiness": self.ready,
            }


STATE = DemoState()


class DemoHandler(BaseHTTPRequestHandler):
    server_version = "inside-k8s-demo-app/1.0"

    def _set_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _write_json(self, payload: dict, status_code: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self._set_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._set_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path

        if path in {"/", "/info"}:
            STATE.increment_requests()
            response = STATE.snapshot()
            response["path"] = path
            self._write_json(response, 200)
            return

        if path == "/healthz/live":
            self._write_json({"live": True}, 200)
            return

        if path == "/healthz/ready":
            ready = STATE.snapshot()["readiness"]
            status = 200 if ready else 503
            self._write_json({"ready": ready}, status)
            return

        self._write_json({"error": "not found", "path": path}, 404)

    def do_POST(self) -> None:
        path = urlparse(self.path).path

        if path == "/admin/readiness/fail":
            STATE.set_ready(False)
            self._write_json({"ok": True, "action": "readiness=failing", "state": STATE.snapshot()}, 200)
            return

        if path == "/admin/readiness/restore":
            STATE.set_ready(True)
            self._write_json({"ok": True, "action": "readiness=restored", "state": STATE.snapshot()}, 200)
            return

        if path == "/admin/reset-counter":
            STATE.reset_requests()
            self._write_json({"ok": True, "action": "counter=reset", "state": STATE.snapshot()}, 200)
            return

        self._write_json({"error": "not found", "path": path}, 404)

    def log_message(self, fmt: str, *args) -> None:
        # Keep logs compact for terminal demos.
        print(f"{self.client_address[0]} - {fmt % args}")


def main() -> None:
    port = int(os.getenv("PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), DemoHandler)
    print(f"Demo app listening on :{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
