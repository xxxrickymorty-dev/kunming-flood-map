---
name: kunming-flood-verify
description: >-
  MANDATORY before any new or moved pin in kunming-flood-map/html/js/data.js.
  Audits pin placement against user Gaode screenshots, Nominatim/OSM, GCJ conversion,
  nearby pins, and check-coords.mjs. Use when adding/moving points, user asks 对吗/太偏了,
  or before publish. Never skip — pair with kunming-flood-coords then kunming-flood-deploy.
---

# 昆明积水地图 · 点位检查（标注前强制）

## 强制规则（最高优先级）

**凡新增或修改 `data.js` 里任一事件点坐标，必须先完整执行本 skill 全部步骤，再写入/发布。**

禁止：
- 只用路名猜坐标、从邻近点「估一个」
- 用户给了高德截图/POI 仍用 OSM 中段或东段代替路口
- 跳过 `check-coords.mjs` 或跳过高德 marker 目视

流程：**kunming-flood-coords（怎么写）→ kunming-flood-verify（本文件，必做）→ kunming-flood-deploy（通过后上线）**

## 检查清单（按序，不可跳）

```
- [ ] 0. 用户是否给了高德截图/POI？→ 以 POI 全名为落点，禁止改译
- [ ] 1. 读 data.js 该点 id / name / lat,lng / note
- [ ] 2. 查官方或原文是否同名多点
- [ ] 3. Nominatim/OSM 搜「完整路名 + 昆明/官渡」
- [ ] 4. WGS → GCJ-02（禁止 WGS 直写 data.js）
- [ ] 5. 与邻近已有点比方位；偏差 >300 m 须说明理由
- [ ] 6. 高德 marker 链接目视三问
- [ ] 7. node kunming-flood-map/scripts/check-coords.mjs（warnings=0）
- [ ] 8. 结论写入 note；不对则改坐标后再跑 7
```

## Step 0：用户高德截图 / POI（有则最高优先级）

用户发高德搜「官南大道与福发路交叉口」等 **POI 全名** 时：

1. **落点 = 该 POI 所在路口/路段**，不是同名路东段、不是小区内部
2. OSM 取**该路在 POI 处的节点**（如福发路西端近官南），不是路中段
3. 写 note 须含：`用户高德 POI「…」为准`
4. 用 `https://uri.amap.com/marker?position={lng},{lat}&name=POI名` 与截图对照

## Step 3：Nominatim（Windows 用 curl.exe）

```powershell
curl.exe -s "https://nominatim.openstreetmap.org/search?q=官南大道+福发路+昆明&format=json&limit=5" -A "kunming-flood-map/1.0"
```

- 查询带 **昆明 / 官渡**
- 优先 **路口、公交站、POI 在目标路上**
- 一条路有多段时，用 `viewbox` 限定官渡片

## Step 4：WGS84 → GCJ-02

参数顺序 **`wgs84ToGcj02(lng, lat)`**（与 `app.js` 一致）。高德截图/POI 坐标已是 GCJ，**原样写入**。

## Step 5：邻近点方位

| 参照 | 大致 GCJ | 用途 |
|---|---|---|
| F2 官南×福发路口 | 25.0057, 102.7216 | 福发路西端×官南大道 |
| U5 福德站 | 25.0071, 102.7302 | 春城路×福发路，在 F2 **东** ~800 m |
| U16 汇杰大厦 | 25.0058, 102.7213 | 官南大道更南 |

**偏差 >300 m 且未在 note 解释** → 禁止发布。

## Step 6：高德 marker 目视

```
https://uri.amap.com/marker?position={lng},{lat}&name={名称}
```

1. 针在**该路/路口**上，不在隔壁路、小区中心、湖？
2. 与用户截图 POI 气泡位置一致？
3. 与 Step 3 OSM 节点方位一致？

## Step 7：脚本粗检（必跑）

```powershell
node kunming-flood-map/scripts/check-coords.mjs
```

`warnings 0` 且 exit 0 才能发布。

## 实案（勿再犯）

| id | 错因 | 正确 |
|---|---|---|
| F2 官南×福发 | 102.7278 落在福发路中段；102.752 更偏东 | 用户 POI 路口 OSM 西端 **25.0057,102.7216** |
| U11 渔村南绕城 | 24.968 靠近古镇 | 高庙/渔村 **24.9279,102.7517** |
| Y1 古镇云秀路 | 西片同名路 | 古镇公交站 **24.9557,102.7585** |
| J4/L4 混团公路 | 混团村≈滇池 | 团结公路 |

## 与另两个 skill

| Skill | 职责 |
|---|---|
| **kunming-flood-coords** | 坐标系、粗框、同音错村 |
| **kunming-flood-verify** | **标注前强制检查** |
| **kunming-flood-deploy** | 检查通过后发布 |
