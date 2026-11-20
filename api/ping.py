import json
import sys
import traceback
from http.server import BaseHTTPRequestHandler


class handler(BaseHTTPRequestHandler):  # noqa: N801
    def do_GET(self):
        try:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            data = {
                "ping": "pong",
                "python": sys.version,
                "platform": sys.platform,
            }
            self.wfile.write(json.dumps(data).encode("utf-8"))
        except Exception as exc:
            self.send_response(500)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(f"PING ERROR: {exc}\n{traceback.format_exc()}".encode())
