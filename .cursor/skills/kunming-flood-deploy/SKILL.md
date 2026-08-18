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
| 唯一事实源 | `kunming-flood-map/html/`（index.html + css/app.css + js/data.js + js/app.js + vendor/） |
| 数据改动 | 只改 `html/js/data.js`（hist 里 `ref` 指向事件点，坐标不重复维护） |
| 根目录旧文件 | `昆明积水地图-0818.html` 已退化为跳转页，**不再是源** |
| 线上目录 | `/workspace/kunming-flood-map`（`/home/ubuntu/kunming-flood-map` 是历史误建残留，勿用） |
| 线上地址 | http://43.180.135.43:8088/ |
| SSH | `ubuntu@43.180.135.43`，密钥 `~/.ssh/yanleme-4h8g.pem` |
| 容器 | `kunming-flood-map-nginx-1`，宿主机 **8088→80** |
| 勿动 | `ai_learning` 占用的 **:80**（`/admin/`） |

本地与远端结构一致：

```
kunming-flood-map/
  docker-compose.yml
  deploy/nginx.conf
  html/index.html
  html/css/app.css
  html/js/data.js       # 点位数据（events + hist）
  html/js/app.js        # 应用逻辑
  html/vendor/          # Leaflet 本地化
  html/districts.geojson
  scripts/publish.ps1
```

## Deploy workflow (required)

1. 直接改 `kunming-flood-map/html/` 下的文件（数据改 `js/data.js`，样式改 `css/app.css`，逻辑改 `js/app.js`）。无需任何同步步骤。
2. 在仓库根「淹了么」执行发布脚本：

```powershell
powershell -ExecutionPolicy Bypass -File ".\kunming-flood-map\scripts\publish.ps1"
```

3. 确认脚本输出含 `done http://43.180.135.43:8088/ status=200`，并用 curl/浏览器验证。
4. 向用户回报线上 URL；提醒强刷缓存（html/css/js 为 no-cache 协商缓存，正常刷新即可拿到新版）。

### PEM / SSH 注意

- 密钥是 **SSH 私钥**，不是 HTTPS 证书；当前站点为 **HTTP:8088**。
- Windows OpenSSH 读 PEM 失败时：复制到 `%USERPROFILE%\.ssh\yanleme-4h8g.pem`，`icacls` 去掉继承并只给当前用户 `R`。
- **勿**把 `4h8g.pem` 提交公开仓库（已在 `.gitignore`）。

### 脚本失败时的手动等价命令

```powershell
$key = "$env:USERPROFILE\.ssh\yanleme-4h8g.pem"
tar -czf "$env:TEMP\kfm.tar.gz" -C kunming-flood-map docker-compose.yml html deploy
scp -i $key "$env:TEMP\kfm.tar.gz" ubuntu@43.180.135.43:/tmp/kfm.tar.gz
ssh -i $key ubuntu@43.180.135.43 "tar -xzf /tmp/kfm.tar.gz -C /workspace/kunming-flood-map && cd /workspace/kunming-flood-map && sudo docker compose up -d && sudo docker exec kunming-flood-map-nginx-1 nginx -s reload"
```

## Content edit checklist (before publish)

- 点位坐标：底图高德 **GCJ-02**；`data.js` 里存的就是 GCJ（`POINT_CRS = "gcj"`，勿再 WGS→GCJ）；浏览器 GPS 用 `"wgs"` 转换。微调用 `COORD_NUDGE`。
- 从 OSM/Nominatim 取的是 **WGS84**，入库前必须转 GCJ-02（`app.js` 里的 `wgs84ToGcj02`）；百度是 **BD-09**，不能直接抄。
- CSP / nginx：`deploy/nginx.conf` 已放行高德瓦片与 Nominatim；改 CSP 后随包上传并重启容器生效。
- file:// 直开可用（相对路径 + data.js 全局变量），仅 districts.geojson 与 Nominatim 需网络。

## After deploy

回报一句：已发布到 http://43.180.135.43:8088/ ，并提醒强刷缓存。
