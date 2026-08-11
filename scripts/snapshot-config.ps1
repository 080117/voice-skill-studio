# 本机配置快照：把可能被项目改动的配置备份到 docs/backups/（gitignore，不入库）
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root 'docs\backups'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

function Copy-Snapshot($src, $name) {
  if (Test-Path $src) {
    $target = Join-Path $dest $name
    Copy-Item -LiteralPath $src -Destination $target -Force
    Write-Output ("  saved: {0} -> {1}" -f $src, $target)
  } else {
    Write-Output ("  (missing) {0}" -f $src)
  }
}

Write-Output '=== Snapshot to docs/backups ==='
Copy-Snapshot "$env:USERPROFILE\.codex\config.toml" "codex-config-$stamp.toml"
Copy-Snapshot "$env:USERPROFILE\.cc-switch\settings.json" "cc-switch-settings-$stamp.json"
Copy-Snapshot "$env:USERPROFILE\.config\opencode\opencode.jsonc" "opencode-$stamp.jsonc"

# 环境变量名清单（只记名字，不记值）
$envNames = Get-ChildItem Env: | Where-Object { $_.Name -match 'KEY_|API_KEY|TOKEN|BASE_URL|MODEL|PROVIDER|ANTHROPIC|OPENAI|DEEPSEEK|GEMINI|MOONSHOT|SILICON|GROQ|OPENROUTER' } | Select-Object -ExpandProperty Name
$envList = Join-Path $dest "env-names-$stamp.txt"
$envNames | Sort-Object | Set-Content -Path $envList -Encoding utf8
Write-Output ("  saved env var NAMES: {0} ({1} entries)" -f $envList, $envNames.Count)

# 摘要（非敏感值）
$summary = [ordered]@{
  timestamp = (Get-Date).ToString('o')
  codex_model = (Select-String -Path "$env:USERPROFILE\.codex\config.toml" -Pattern '^model\s*=' -ErrorAction SilentlyContinue).Line
  codex_provider = (Select-String -Path "$env:USERPROFILE\.codex\config.toml" -Pattern '^model_provider\s*=' -ErrorAction SilentlyContinue).Line
  cc_switch_currentProviderCodex = (Get-Content "$env:USERPROFILE\.cc-switch\settings.json" -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json).currentProviderCodex
  git_user_name = git config --get user.name
  git_user_email = git config --get user.email
}
$summary | ConvertTo-Json | Set-Content -Path (Join-Path $dest "snapshot-summary-$stamp.json") -Encoding utf8
Write-Output ("  saved summary: snapshot-summary-{0}.json" -f $stamp)
Write-Output '=== Done. 还原依据见 docs/REVERT.md ==='
