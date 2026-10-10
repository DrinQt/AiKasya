"""Start the local Ollama server on demand, without shell commands."""
import asyncio
import os
import shutil
import subprocess
from pathlib import Path

from app.local_ai.client import check_ollama_status, DEFAULT_MODEL

_start_lock = asyncio.Lock()
_process = None


def find_ollama():
    executable = shutil.which("ollama")
    if executable:
        return executable
    candidates = []
    if os.name == "nt":
        for root in (os.environ.get("LOCALAPPDATA"), os.environ.get("ProgramFiles")):
            if root:
                candidates.extend([Path(root) / "Programs/Ollama/ollama.exe",
                                   Path(root) / "Ollama/ollama.exe"])
    return next((str(path) for path in candidates if path.is_file()), None)


def runtime_status(status):
    ready = status.get("running", False) and DEFAULT_MODEL in status.get("models", [])
    return {
        "ready": ready,
        "status": "ready" if ready else "missing_model",
        "model": DEFAULT_MODEL,
        "message": f"Ollama is ready with {DEFAULT_MODEL}." if ready else
                   f"Ollama is running, but {DEFAULT_MODEL} is missing. Run: ollama pull {DEFAULT_MODEL}",
    }


async def ensure_ollama_running():
    global _process
    async with _start_lock:
        status = await check_ollama_status()
        if status.get("running"):
            return runtime_status(status)
        executable = find_ollama()
        if not executable:
            return {"ready": False, "status": "missing_install", "model": DEFAULT_MODEL,
                    "message": "Ollama is not installed or could not be found. Install Ollama on the backend computer, then retry."}
        try:
            if _process is None or _process.poll() is not None:
                env = {**os.environ, "OLLAMA_HOST": "127.0.0.1:11434", "OLLAMA_NO_CLOUD": "1"}
                if os.name == "nt":
                    # Vulkan discovery hangs on some Windows drivers. CUDA remains available.
                    env.setdefault("OLLAMA_VULKAN", "0")
                _process = subprocess.Popen(
                    [executable, "serve"], stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env,
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
                )
            async with asyncio.timeout(60):
                while True:
                    await asyncio.sleep(0.3)
                    status = await check_ollama_status()
                    if status.get("running"):
                        return runtime_status(status)
                    if _process.poll() is not None:
                        break
        except (OSError, TimeoutError):
            pass
        return {"ready": False, "status": "error", "model": DEFAULT_MODEL,
                "message": "Ollama could not start. Check the local Ollama installation and retry."}
