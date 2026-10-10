import asyncio
from unittest.mock import Mock

import pytest
from app.local_ai import runtime


@pytest.mark.asyncio
async def test_running_server_is_reused_and_exact_model_is_required(monkeypatch):
    async def status():
        return {"running": True, "models": [runtime.DEFAULT_MODEL]}
    launch = Mock()
    monkeypatch.setattr(runtime, "check_ollama_status", status)
    monkeypatch.setattr(runtime.subprocess, "Popen", launch)
    assert (await runtime.ensure_ollama_running())["ready"] is True
    launch.assert_not_called()
    assert runtime.runtime_status({"running": True, "models": ["other:latest"]})["status"] == "missing_model"


@pytest.mark.asyncio
async def test_missing_executable_reports_installation_problem(monkeypatch):
    async def status():
        return {"running": False}
    monkeypatch.setattr(runtime, "check_ollama_status", status)
    monkeypatch.setattr(runtime, "find_ollama", lambda: None)
    assert (await runtime.ensure_ollama_running())["status"] == "missing_install"


@pytest.mark.asyncio
async def test_concurrent_chat_entries_launch_only_one_server(monkeypatch):
    calls = 0
    async def status():
        nonlocal calls
        calls += 1
        return {"running": calls > 1, "models": [runtime.DEFAULT_MODEL]}
    process = Mock()
    process.poll.return_value = None
    launch = Mock(return_value=process)
    monkeypatch.setattr(runtime, "_start_lock", asyncio.Lock())
    monkeypatch.setattr(runtime, "_process", None)
    monkeypatch.setattr(runtime, "check_ollama_status", status)
    monkeypatch.setattr(runtime, "find_ollama", lambda: "ollama.exe")
    monkeypatch.setattr(runtime.subprocess, "Popen", launch)
    results = await asyncio.gather(runtime.ensure_ollama_running(), runtime.ensure_ollama_running())
    assert all(result["ready"] for result in results)
    launch.assert_called_once()
    assert launch.call_args.args[0] == ["ollama.exe", "serve"]


@pytest.mark.asyncio
async def test_failed_launch_reports_error(monkeypatch):
    async def status():
        return {"running": False}
    monkeypatch.setattr(runtime, "check_ollama_status", status)
    monkeypatch.setattr(runtime, "find_ollama", lambda: "ollama.exe")
    monkeypatch.setattr(runtime, "_process", None)
    monkeypatch.setattr(runtime.subprocess, "Popen", Mock(side_effect=OSError("failed")))
    assert (await runtime.ensure_ollama_running())["status"] == "error"
