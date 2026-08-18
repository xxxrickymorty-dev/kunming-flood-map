#Requires -Version 5.1
param(
  [string]$HostIp = "43.180.135.43",
  [string]$User = "ubuntu",
  [string]$KeyPath = "",
  [string]$RemoteDir = "/workspace/kunming-flood-map",
  [switch]$SkipSyncSource
)
$ErrorActionPreference = "Stop"
$Local = $PSScriptRoot
if ((Split-Path -Leaf $Local) -eq "scripts") { $Local = Split-Path -Parent $Local }
$Root = Split-Path -Parent $Local
function Resolve-Pem([string]$Explicit) {
  if ($Explicit -and (Test-Path -LiteralPath $Explicit)) { return $Explicit }
  foreach ($c in @((Join-Path $Root "4h8g.pem"), "$env:USERPROFILE\.ssh\yanleme-4h8g.pem")) {
    if (Test-Path -LiteralPath $c) { return $c }
  }
  throw "PEM not found"
}
function Ensure-PemReadable([string]$Path) {
  $acct = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $dst = Join-Path $env:USERPROFILE ".ssh\yanleme-4h8g.pem"
  New-Item -ItemType Directory -Force -Path (Join-Path $env:USERPROFILE ".ssh") | Out-Null
  Copy-Item -LiteralPath $Path -Destination $dst -Force
  icacls $dst /inheritance:r | Out-Null
  icacls $dst /grant:r ($acct + ":R") | Out-Null
  return $dst
}
function Sync-SourceHtml {
  $src = Join-Path $Root ([char]0x6606+[char]0x660E+[char]0x79EF+[char]0x6C34+[char]0x5730+[char]0x56FE+"-0818.html")
  # fallback glob
  $src = Get-ChildItem -LiteralPath $Root -Filter "*-0818.html" | Select-Object -First 1 -ExpandProperty FullName
  if (-not $src) { Write-Host "skip source"; return }
  $dstHtml = Join-Path $Local "html\index.html"
  $raw = [System.IO.File]::ReadAllText($src, [System.Text.UTF8Encoding]::new($false))
  $out = $raw.Replace("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css", "/vendor/leaflet.css").Replace("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js", "/vendor/leaflet.js")
  [System.IO.File]::WriteAllText($dstHtml, $out, [System.Text.UTF8Encoding]::new($false))
  Write-Host "synced HTML"
}
if (-not $SkipSyncSource) { Sync-SourceHtml }
$KeyPath = Ensure-PemReadable (Resolve-Pem $KeyPath)
$target = "${User}@${HostIp}"
ssh -i $KeyPath -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new $target "sudo mkdir -p $RemoteDir/html $RemoteDir/deploy; sudo chown -R ${User}:${User} $RemoteDir"
scp -i $KeyPath -o IdentitiesOnly=yes (Join-Path $Local "docker-compose.yml") "${target}:${RemoteDir}/docker-compose.yml"
scp -i $KeyPath -o IdentitiesOnly=yes (Join-Path $Local "deploy\nginx.conf") "${target}:${RemoteDir}/deploy/nginx.conf"
scp -i $KeyPath -o IdentitiesOnly=yes -r (Join-Path $Local "html\*") "${target}:${RemoteDir}/html/"
ssh -i $KeyPath -o IdentitiesOnly=yes $target "cd $RemoteDir; sudo docker compose up -d; sudo chmod -R a+rX html; sudo docker exec kunming-flood-map-nginx-1 nginx -s reload"
$code = ssh -i $KeyPath -o IdentitiesOnly=yes $target "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8088/"
Write-Host "done http://${HostIp}:8088/ status=$code"
