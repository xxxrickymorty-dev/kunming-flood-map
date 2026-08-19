---
name: kunming-flood-coords
description: >-
  Verifies and stores Kunming flood-map pin coordinates as Gaode GCJ-02.
  Use when adding or moving points in data.js, geocoding 积水/淹水路段, converting
  lat/lng, or when a pin lands in 滇池/wrong village. Trigger terms: 坐标, GCJ-02,
  高德, 经纬度, Nominatim, 百度, WGS84, BD-09, data.js 点位.
---

# 昆明积水地图 · 坐标核验

底图是高德瓦片，**GCJ-02**。`kunming-flood-map/html/js/data.js` 里的 `lat`/`lng` 必须是 GCJ，入库后不再二次加密（`POINT_CRS = "gcj"`）。

## 上次是怎么错的（禁止再犯）

7.17「混团公路」被标进滇池，因为：

1. 用村名 **混团村**（海口、滇池西岸）去近似公路，没有在高德搜路名。
2. 原文更可能是 **昆团公路 / 团结公路**（西山团结街道，棋盘山北，小河村–龙坪坝），不是湖里的点。
3. 坐标 `24.921, 102.658` 落在水面，仍写进库。

**禁止**：听地名近似、在湖/农田里拍一个点、把 OSM/百度数字直接粘进 `data.js`。

## 落点流程（必做）

1. **在高德搜完整路名或交叉口**，不要只搜同音村。用户若给了高德截图，以截图路段为准。
2. 取点来源只能是下面之一，并记下坐标系：
   - 高德搜点 / 用户高德截图 / `uri.amap.com` → **已是 GCJ，原样写入**
   - OSM / Nominatim / GPS → **WGS84**，用 `app.js` 的 `wgs84ToGcj02(lng, lat)` 转完再写（注意参数是 lng, lat）
   - 百度坐标 / 百度地图链接 → **BD-09，禁止直接用**
3. 写入前目视三问：
   - 针在**这条路上**，不在湖、农田、隔壁区？
   - 滇池在图上的相对方位对不对？（团结公路在湖**西北山地**，不在湖面）
   - 高德打开 `https://uri.amap.com/marker?position={lng},{lat}&name={名称}` 与底图重合？
4. 改完跑：

```
node kunming-flood-map/scripts/check-coords.mjs
```

脚本对滇池水面框报警则先改点，再发布。

## 昆明粗框（GCJ）

| 用途 | lat | lng |
|---|---|---|
| 主城+近郊合理范围 | 24.70–25.25 | 102.45–103.05 |
| 滇池水面（针不该在此） | 24.75–24.96 | 102.625–102.72 |

岸边真实路段（海埂等）若擦到水面框：必须用高德路名核过，并在 `note` 写清「岸上路段，非湖面」。官渡古镇约 `24.958, 102.748` 应在框外；误标混团村 `24.921, 102.658` 必须报警。

## 同音 / 错村

| 原文容易写错 | 不要当成 | 应核 |
|---|---|---|
| 混团公路 | 海口混团村 / 滇池西岸 | 高德「团结公路」或「昆团公路」 |
| 十一家具 | 随便一个家具城 | 广福路×前卫西路，奥宸财富广场 |
| 经开 | 单独一个区 | 行政区并入官渡 |

## 发布

坐标改完再按 `kunming-flood-coords` 的检查和 `kunming-flood-deploy` 上线。
