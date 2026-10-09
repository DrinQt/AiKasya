import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const frontend = fileURLToPath(new URL("../", import.meta.url));
const backend = path.resolve(frontend, "../backend");
const python = process.env.AIKASYA_BACKEND_PYTHON || path.join(backend, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
function run(command, args, cwd) {
  const child = spawn(command, args, { cwd, stdio: "inherit", windowsHide: true });
  children.push(child);
  child.on("error", error => { console.error(error.message); stop(1); });
  child.on("exit", code => { if (!stopping) stop(code ?? 1); });
  return child;
}
async function ready() {
  try { return (await fetch("http://127.0.0.1:8000/api/ingredients", { signal: AbortSignal.timeout(1000) })).ok; }
  catch { return false; }
}
if (!await ready()) {
  if (!existsSync(python)) {
    console.error("Backend environment missing. From backend, run python -m venv .venv, then install requirements.txt using that environment's Python.");
    process.exit(1);
  }
  console.log("Starting AiKasya backend at http://127.0.0.1:8000");
  run(python, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"], backend);
  for (let attempt = 0; attempt < 40 && !stopping; attempt++) {
    if (await ready()) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (stopping || !await ready()) {
    console.error("Backend did not start. Check the Python error above.");
    stop(1);
  }
} else console.log("Using the running AiKasya backend at http://127.0.0.1:8000");
if (!stopping) run(process.execPath, [path.join(frontend, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", ...process.argv.slice(2)], frontend);