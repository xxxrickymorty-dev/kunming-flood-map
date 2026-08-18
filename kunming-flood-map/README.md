# 昆明积水地图 · kunming-flood-map

## 线上

- 地址：http://43.180.135.43:8088/
- 服务器目录：`/workspace/kunming-flood-map`
- 容器：`kunming-flood-map-nginx-1`（端口 8088，因 80 被 ai_learning 占用）

## 本机目录（与服务器一致）

```
kunming-flood-map/
  docker-compose.yml
  deploy/nginx.conf
  html/index.html
  html/vendor/          # Leaflet 本地资源
  scripts/publish.ps1
```

## 发布

```powershell
.\kunming-flood-map\scripts\publish.ps1
```

会自动：同步根目录 `昆明积水地图-0818.html` → `html/index.html`（Leaflet 改 `/vendor/`）→ 上传 `/workspace/kunming-flood-map` → 重载 Docker nginx。

Agent 发布流程见：`.cursor/skills/kunming-flood-deploy/SKILL.md`（以及个人 skill `~/.cursor/skills/kunming-flood-deploy`）。

密钥：根目录 `4h8g.pem`（SSH 私钥，勿公开）。
