"""Run the ROOTS frontend and protected API together for local development."""

from __future__ import annotations

import os
import subprocess
import sys
import time
import webbrowser
from pathlib import Path


ROOT = Path(__file__).resolve().parent
FRONTEND_PORT = os.getenv("ROOTS_FRONTEND_PORT", "5500")
API_PORT = os.getenv("ROOTS_API_PORT", "8000")


def command(module: str, *args: str) -> list[str]:
    return [sys.executable, "-m", module, *args]


def stop(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()


def main() -> int:
    if not (ROOT / ".env").exists():
        print("ROOTS cannot start label scanning: copy .env.example to .env and add GEMINI_API_KEY.")
        return 1

    processes = [
        subprocess.Popen(
            command("uvicorn", "api:app", "--host", "127.0.0.1", "--port", API_PORT),
            cwd=ROOT,
        ),
        subprocess.Popen(
            command("http.server", FRONTEND_PORT, "--directory", "www"),
            cwd=ROOT,
        ),
    ]
    url = f"http://127.0.0.1:{FRONTEND_PORT}"
    print(f"ROOTS frontend: {url}")
    print(f"ROOTS API:      http://127.0.0.1:{API_PORT}")
    print("Press Ctrl+C to stop both.")

    try:
        time.sleep(0.8)
        if any(process.poll() is not None for process in processes):
            return next(process.returncode for process in processes if process.returncode is not None)
        if os.getenv("ROOTS_OPEN_BROWSER") == "1":
            webbrowser.open(url)
        while all(process.poll() is None for process in processes):
            time.sleep(0.25)
        return next(process.returncode for process in processes if process.returncode is not None)
    except KeyboardInterrupt:
        return 0
    finally:
        for process in processes:
            stop(process)


if __name__ == "__main__":
    raise SystemExit(main())
