# 发布昆明积水地图到 43.180.135.43:8088
# 源 = kunming-flood-map/（html/ + deploy/ + docker-compose.yml）
# 根目录 昆明积水地图-0818.html 只是跳转页，不再参与发布。
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$htmlDir = Join-Path $root "html"
$key = "$env:USERPROFILE\.ssh\yanleme-4h8g.pem"
$target = "ubuntu@43.180.135.43"
$remoteDir = "/workspace/kunming-flood-map"
$port = 8088

if (-not (Test-Path (Join-Path $htmlDir "index.html"))) { throw "缺少 $htmlDir\index.html" }
if (-not (Test-Path (Join-Path $htmlDir "js\app.js"))) { throw "缺少 $htmlDir\js\app.js" }
if (-not (Test-Path (Join-Path $htmlDir "js\data.js"))) { throw "缺少 $htmlDir\js\data.js" }
if (-not (Test-Path (Join-Path $htmlDir "css\app.css"))) { throw "缺少 $htmlDir\css\app.css" }
if (-not (Test-Path $key)) { throw "缺少密钥 $key" }

$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$tar = Join-Path $env:TEMP "kunming-flood-map-$ts.tar.gz"

Push-Location $root
try {
    tar -czf $tar docker-compose.yml html deploy
    if ($LASTEXITCODE -ne 0) { throw "tar 打包失败" }
} finally {
    Pop-Location
}

scp -i $key -o StrictHostKeyChecking=accept-new $tar "${target}:/tmp/kunming-flood-map.tar.gz"
if ($LASTEXITCODE -ne 0) { throw "scp 上传失败" }

# html/ 与 nginx.conf 是 bind mount；tar 覆盖会换 inode，单文件挂载仍指旧 inode，
# 必须 force-recreate 容器让挂载重新绑定（reload 不够）
$remote = @"
set -e
mkdir -p $remoteDir
tar -xzf /tmp/kunming-flood-map.tar.gz -C $remoteDir
cd $remoteDir
sudo docker compose up -d --force-recreate
sleep 2
curl -s -o /dev/null -w "local http status %{http_code}\n" http://127.0.0.1:$port/
rm -f /tmp/kunming-flood-map.tar.gz
"@

$remote | ssh -i $key $target "bash -s"
if ($LASTEXITCODE -ne 0) { throw "远端部署失败" }

Remove-Item $tar -ErrorAction SilentlyContinue

try {
    $r = Invoke-WebRequest -Uri "http://43.180.135.43:$port/" -UseBasicParsing -TimeoutSec 15
    Write-Host "done http://43.180.135.43:$port/ status=$($r.StatusCode)"
} catch {
    Write-Host "deployed but local check failed: $($_.Exception.Message)"
}
