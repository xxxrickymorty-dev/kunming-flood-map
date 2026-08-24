# 昆明积水地图 · kunming-flood-map

协作者请先读仓库根 **[../AGENTS.md](../AGENTS.md)**，发布细节见 `.cursor/skills/kunming-flood-deploy/SKILL.md`。

## 线上

- 地址：http://43.180.135.43:8088/
- 服务器目录：`/workspace/kunming-flood-map`
- 容器：`kunming-flood-map-nginx-1`（端口 8088，因 80 被 ai_learning 占用）

## 本机目录（与服务器一致）

```
kunming-flood-map/
  docker-compose.yml
  deploy/nginx.conf.template
  html/index.html
  html/vendor/          # Leaflet 本地资源
  scripts/publish.ps1
```

## 发布

```powershell
.\kunming-flood-map\scripts\publish.ps1
```

脚本会按以下流程发布（**无「同步根目录旧 html」步骤**，那个文件是历史跳转页，已非源）：

1. 在仓库根打包 `docker-compose.yml` + `html/` + `deploy/` 为 tar.gz；
2. 通过 SSH（私钥由维护者私发，勿提交仓库）`scp` 到服务器 `/tmp`；
3. `ssh` 解包到 `/workspace/kunming-flood-map`，并执行 `docker compose up -d --force-recreate`（html/ 与 nginx.conf 是 bind mount，换 inode 必须 force-recreate，仅 reload 不够）；
4. 输出 `done <site-url> status=200` 后，提醒访问者 Ctrl+F5 强刷。

Agent 发布流程见个人 skill `~/.cursor/skills/kunming-flood-deploy`（不在本仓库，由维护者私发）。
