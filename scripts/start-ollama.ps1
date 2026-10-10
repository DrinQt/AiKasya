param([switch]$DownloadModel)

$taskOllama = (Get-Command ollama -ErrorAction SilentlyContinue).Source
if (-not $taskOllama) {
    $taskOllama = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
}
if (-not (Test-Path -LiteralPath $taskOllama)) {
    Write-Error 'Ollama is not installed. Install it from https://ollama.com/download/windows.'
    exit 1
}
$Host.UI.RawUI.WindowTitle = 'AIKasya - Ollama server'
$env:OLLAMA_HOST = '127.0.0.1:11434'
$env:OLLAMA_NO_CLOUD = '1'
if ($DownloadModel) {
    $Host.UI.RawUI.WindowTitle = 'AIKasya - Ollama model download'
    & $taskOllama pull llama3.2:3b
    return
}
# Avoid Vulkan driver discovery stalls on Windows; CUDA stays available.
if (-not $env:OLLAMA_VULKAN) { $env:OLLAMA_VULKAN = '0' }
Write-Host 'Starting Ollama locally. Keep this terminal open while using AIKasya.'
& $taskOllama serve
