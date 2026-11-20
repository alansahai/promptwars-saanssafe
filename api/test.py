from http.server import BaseHTTPRequestHandler
import json
import os
import sys

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        data = {
            "python_version": sys.version,
            "cwd": os.getcwd(),
            "files_in_cwd": os.listdir("."),
            "files_in_api": os.listdir("api") if os.path.exists("api") else [],
            "sys_path": sys.path,
        }
        try:
            import fastapi
            data["fastapi"] = fastapi.__version__
        except Exception as e:
            data["fastapi_error"] = str(e)

        try:
            import pydantic_settings
            data["pydantic_settings"] = "ok"
        except Exception as e:
            data["pydantic_settings_error"] = str(e)

        try:
            import google.genai
            data["google_genai"] = "ok"
        except Exception as e:
            data["google_genai_error"] = str(e)

        try:
            from app.main import app
            data["app_main"] = "ok"
        except Exception as e:
            import traceback
            data["app_main_error"] = str(e)
            data["app_main_trace"] = traceback.format_exc()

        self.wfile.write(json.dumps(data, indent=2).encode('utf-8'))
