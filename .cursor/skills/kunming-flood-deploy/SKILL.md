---
name: kunming-flood-deploy
description: >-
  Publishes the Kunming flood map (淹了么 / kunming-flood-map) to the VPS at
  43.180.135.43:8088 via SSH PEM and Docker nginx. Use when the user asks to
  deploy, publish, 上线, 发布, 同步服务器, or update the live flood map site.
---

# 昆明积水地图 · 服务器发布

## When to use

用户提到：发布 / 上线 / deploy / publish / 同步到服务器 / 更新线上地图 → **立刻按本 skill 执行**，不要只给手工步骤。

## Facts (do not reinvent)

| Item | Value |
|------|--------|
| 本机工程 | `kunming-flood-map/`（在「淹了么」仓库根下） |
| 源页面（可改 CDN） | `昆明积水地图-0818.html` |
| 线上目录 | `/workspace/kunming-flood-map` |
| 线上地址 | http://43.180.135.43:8088/ |
| SSH | `ubuntu@43.180.135.43`，密钥 `4h8g.pem`（也可用 `~/.ssh/yanleme-4h8g.pem`） |
| 容器 | `kunming-flood-map-nginx-1`，宿主机 **8088→80** |
| 勿动 | `ai_learning` 占用的 **:80**（`/admin/`） |

本地与远端结构一致：

```
kunming-flood-map/
  docker-compose.yml
  deploy/nginx.conf
  html/index.html      # 线上用，Leaflet 走 /vendor/
  html/vendor/
  scripts/publish.ps1
```

## Deploy workflow (required)

1. 若改了 `昆明积水地图-0818.html`：确保 Leaflet 在发布产物里是 `/vendor/leaflet.css` 与 `/vendor/leaflet.js`（脚本会自动替换 unpkg）。
2. 在仓库根「淹了么」执行发布脚本（优先）：

```powershell
powershell -ExecutionPolicy Bypass -File ".\kunming-flood-map\scripts\publish.ps1"
```

3. 确认脚本输出含 `完成 http://43.180.135.43:8088/`，并用 curl/浏览器验证 `200`。
4. 向用户回报线上 URL；提醒强刷缓存。

### PEM / SSH 注意

- 密钥是 **SSH 私钥**，不是 HTTPS 证书；当前站点为 **HTTP:8088**。
- Windows OpenSSH 读 PEM 失败时：复制到 `%USERPROFILE%\.ssh\yanleme-4h8g.pem`，`icacls` 去掉继承并只给当前用户 `R`（`publish.ps1` 已尽量处理）。
- **勿**把 `4h8g.pem` 提交公开仓库（已在 `.gitignore`）。

### 脚本失败时的手动等价命令

```powershell
$key = "$env:USERPROFILE\.ssh\yanleme-4h8g.pem"
# 若无：从项目根 4h8g.pem 复制并收紧 ACL
scp -i $key -o IdentitiesOnly=yes ".\kunming-flood-map\docker-compose.yml" ubuntu@43.180.135.43:/workspace/kunming-flood-map/
scp -i $key -o IdentitiesOnly=yes ".\kunming-flood-map\deploy\nginx.conf" ubuntu@43.180.135.43:/workspace/kunming-flood-map/deploy/
scp -i $key -o IdentitiesOnly=yes -r ".\kunming-flood-map\html\*" ubuntu@43.180.135.43:/workspace/kunming-flood-map/html/
ssh -i $key -o IdentitiesOnly=yes ubuntu@43.180.135.43 "cd /workspace/kunming-flood-map && sudo docker compose up -d && sudo chmod -R a+rX html && sudo docker exec kunming-flood-map-nginx-1 nginx -s reload"
```

## Content edit checklist (before publish)

- 改 UI/数据：优先改根目录 `昆明积水地图-0818.html`，再跑 `publish.ps1`（自动同步到 `html/index.html`）。
- 坐标：底图高德 GCJ-02；点位默认 `POINT_CRS = "gcj"`（勿对国内取点再 WGS→GCJ）；GPS 定位用 `"wgs"`。微调用 `COORD_NUDGE`。
- CSP / nginx：`deploy/nginx.conf` 已放行高德瓦片；改 CSP 后需一并上传并 reload。

## After deploy

回报一句：已发布到 http://43.180.135.43:8088/ ，并说明是否同步了源 HTML。
