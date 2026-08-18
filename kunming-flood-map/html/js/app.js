/* 昆明积水地图 · 应用逻辑（数据在 js/data.js，window.FLOOD_DATA） */
"use strict";

/* —— 工具 —— */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function debounce(fn, ms) {
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* —— 坐标系：底图高德 GCJ-02 ——
 * 点位 lat/lng：国内地图/高德取点 → "gcj"（默认，不再二次加密）
 * 浏览器 GPS / 国际坐标 → "wgs"（做 WGS84→GCJ）
 * 若仍整体偏移，可微调 COORD_NUDGE（单位：度，约 0.001 ≈ 100m） */
const POINT_CRS = "gcj";
const COORD_NUDGE = { lat: 0, lng: 0 };

function outOfChina(lng, lat) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}
function transformLat(x, y) {
  let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  r += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
  r += (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3;
  r += (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3;
  return r;
}
function transformLng(x, y) {
  let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  r += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
  r += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3;
  r += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3;
  return r;
}
function wgs84ToGcj02(lng, lat) {
  if (outOfChina(lng, lat)) return [lng, lat];
  const a = 6378245, ee = 0.00669342162296594323;
  let dLat = transformLat(lng - 105, lat - 35);
  let dLng = transformLng(lng - 105, lat - 35);
  const radLat = lat / 180 * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
  dLng = (dLng * 180) / (a / sqrtMagic * Math.cos(radLat) * Math.PI);
  return [lng + dLng, lat + dLat];
}
function toMapLL(lat, lng, from) {
  const src = from || POINT_CRS;
  let outLat = lat, outLng = lng;
  if (src === "wgs") {
    const [gLng, gLat] = wgs84ToGcj02(lng, lat);
    outLat = gLat;
    outLng = gLng;
  }
  return [outLat + COORD_NUDGE.lat, outLng + COORD_NUDGE.lng];
}

/* —— 数据装载：hist 里 ref 的点坐标继承对应事件点 —— */
const EVENTS = window.FLOOD_DATA.events;
const HIST = window.FLOOD_DATA.hist;
{
  const byId = Object.fromEntries(EVENTS.map((p) => [p.id, p]));
  HIST.forEach((p) => {
    if (p.ref && byId[p.ref]) {
      p.lat = byId[p.ref].lat;
      p.lng = byId[p.ref].lng;
    }
  });
}

const EVT_LABEL = { "0818": "8.18", "0716": "7.16", "0802": "8.2–3" };
const KIND_LABEL = { closed: "断交/重度", mid: "中度", slow: "缓行", ctrl: "管制/未测深" };
const PIN_CLASS = { closed: "closed", mid: "mid", slow: "slow", ctrl: "ctrl" };
const RING = { closed: "#c1121f", mid: "#e85d04", slow: "#f59e0b", ctrl: "#4f46e5" };

/* 命中判定半径（米）：与地图上绘制的圈保持一致 */
const EVENT_RING_R = 110;   // 事件点圈半径（绘制与命中共用）
const EVENT_NEAR_PAD = 80;  // 事件点“邻近”余量
const HIST_NEAR_PAD = 120;  // 常年/用户点“邻近”余量
const HIST_DEFAULT_R = 200;

const DISTRICTS = ["官渡", "经开", "呈贡", "五华", "盘龙", "西山", "安宁"];

const PERIOD = {
  all: {
    title: "调研事件点 · 全部场次",
    sub: "依据 2026 汛期公开通报：昆水管网、交警、消防、机场提示。",
    banner: "<strong>全部场次</strong>：合并 7.16 / 8.2–3 / 8.18。积水高度集中在官渡东南。常年易淹请切顶部「常年易淹」分页。"
  },
  "0818": {
    title: "8.18 强降雨 · 淹水点",
    sub: "降雨主时段 17 日 23 时–18 日 6 时 · 金马凉亭站 24h 158.1 mm",
    banner: "<strong>8.18</strong>：东向官渡/经开吃紧。牛街庄、长润街、国贸路可见断交 ≥8h；长润街白天从 30 cm 加深到 50 cm；日新立交上午约 50 cm。"
  },
  "0716": {
    title: "7.16 大暴雨 · 淹水点",
    sub: "凌晨约 01:00 起 · 前卫雨量站 3 小时 80.9 mm · 昆水管网 24 处",
    banner: "<strong>7.16</strong>：重度 6 处含<strong>前卫西路与广福路交叉口</strong>（&gt;50→25 cm，至少约 7h）。雨心偏南与西：广福南片 + 海源/滇缅。国贸路当日为中度，8.18 再发。"
  },
  "0802": {
    title: "8.2–3 局部暴雨 · 淹水点",
    sub: "防汛Ⅳ级 · 官渡 / 呈贡 / 经开 · 公开水深不足",
    banner: "<strong>8.2–3</strong>：呈贡金桂街、兴呈路、昆玉路下穿临时管制；官渡小板桥/矣六局部积水。水深与清退时刻公开少，地图上易低估。"
  }
};

const CAT = {
  tunnel: "下穿立交",
  road: "低洼路",
  river: "河道老区",
  new: "城郊新区",
  ugc: "用户补点",
  safe: "相对未淹"
};
const HIST_PIN = { tunnel: "hist", road: "hist", river: "hist", new: "hist", ugc: "ugc", safe: "safe" };
const HIST_RING = { tunnel: "#1d4ed8", road: "#1d4ed8", river: "#1d4ed8", new: "#1d4ed8", ugc: "#0f766e", safe: "#15803d" };
const MORPH_LABEL = { road: "主干道低洼/交叉口", tunnel: "下穿/立交底层", culvert: "涵洞/桥洞", slow: "缓行/浅积" };
const MORPH_ORDER = ["road", "tunnel", "culvert", "slow"];

/* —— 地图初始化 —— */
const map = L.map("map", { zoomControl: true }).setView(toMapLL(25.02, 102.74), 12);
L.tileLayer("https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}", {
  subdomains: "1234",
  maxZoom: 18,
  attribution: "高德底图 · 数据来自公开通报整理，非实时官方图层"
}).addTo(map);

function pinIcon(text, cls) {
  return L.divIcon({
    className: "pin-wrap",
    html: `<div class="pin ${cls}"><span>${esc(text)}</span></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 40],
    popupAnchor: [0, -36]
  });
}
function popupHtml(title, lines, latlng) {
  const [lat, lng] = latlng;
  const body = lines.filter(Boolean).map((t) => `<p>${esc(t)}</p>`).join("");
  return `<div class="popup"><h3>${esc(title)}</h3>${body}<p><a href="https://uri.amap.com/marker?position=${lng},${lat}&name=${encodeURIComponent(title)}" target="_blank" rel="noopener">用高德打开这一点</a></p></div>`;
}

const evtLayer = {};
EVENTS.forEach((p, i) => {
  const ll = toMapLL(p.lat, p.lng);
  const label = String(typeof p.n === "number" ? p.n : i + 1);
  const marker = L.marker(ll, { icon: pinIcon(label, PIN_CLASS[p.kind]), zIndexOffset: 600 });
  marker.bindPopup(popupHtml(p.name, [
    `${EVT_LABEL[p.evt]} · ${KIND_LABEL[p.kind]} · ${p.district}`,
    `水深：${p.depth}`,
    `持续：${p.duration}`,
    p.note || "",
    `来源：${p.source}`
  ], ll));
  const ring = L.circle(ll, {
    radius: EVENT_RING_R,
    color: RING[p.kind],
    weight: 3,
    fillColor: RING[p.kind],
    fillOpacity: 0.14
  });
  evtLayer[p.id] = L.layerGroup([ring, marker]).addTo(map);
  p._marker = marker;
  p._ll = ll;
  p._label = label;
});

const histLayer = {};
HIST.forEach((p) => {
  const ll = toMapLL(p.lat, p.lng);
  const ringColor = HIST_RING[p.cat] || "#1d4ed8";
  const zone = L.circle(ll, {
    radius: p.r || HIST_DEFAULT_R,
    color: ringColor,
    weight: 3,
    dashArray: p.cat === "safe" ? "2 8" : "6 6",
    fillColor: ringColor,
    fillOpacity: p.cat === "safe" ? 0.08 : 0.12
  });
  const pinCls = HIST_PIN[p.cat] || "hist";
  const marker = L.marker(ll, { icon: pinIcon(p.n.replace("H", ""), pinCls), zIndexOffset: 200 });
  marker.bindPopup(popupHtml(p.name, [
    `${CAT[p.cat]} · ${p.district}`,
    p.depth,
    p.note
  ], ll));
  histLayer[p.n] = L.layerGroup([zone, marker]);
  p._marker = marker;
  p._ll = ll;
  p._pinCls = pinCls;
});

/* —— 视图状态 —— */
let evtF = "all", kindF = "all", histF = "all", qEvt = "", qHist = "", currentView = "all", districtF = null;

function districtKey(d) {
  const s = String(d || "");
  if (/五华|高新/.test(s)) return "五华";
  if (/经开/.test(s)) return "经开";
  if (/呈贡/.test(s)) return "呈贡";
  if (/盘龙/.test(s)) return "盘龙";
  if (/西山/.test(s)) return "西山";
  if (/安宁/.test(s)) return "安宁";
  /* 长水机场及出城走廊行政上属官渡；旧标签「机场向」并入 */
  if (/官渡|机场/.test(s)) return "官渡";
  return s;
}

let districtGeo = null;
let districtOverlay = null;
async function loadDistrictBounds() {
  try {
    const res = await fetch("districts.geojson", { cache: "no-cache" });
    if (!res.ok) return false;
    districtGeo = await res.json();
    return true;
  } catch (_) {
    return false; /* file:// 直开时无边界层，其余功能不受影响 */
  }
}
function clearDistrictOverlay() {
  if (districtOverlay) {
    map.removeLayer(districtOverlay);
    districtOverlay = null;
  }
}
function paintDistrictOverlay() {
  clearDistrictOverlay();
  if (!isDistrictView() || !districtGeo || !districtF) return;
  const feat = districtGeo.features.find((f) => f.properties && f.properties.name === districtF);
  if (!feat) return;
  const isZone = feat.properties.kind === "zone";
  districtOverlay = L.geoJSON(feat, {
    style: {
      color: "#2563eb",
      weight: 2,
      opacity: 0.95,
      fillColor: "#93c5fd",
      fillOpacity: 0.28,
      dashArray: isZone ? "6 4" : null
    },
    interactive: false
  }).addTo(map);
  if (districtOverlay.bringToBack) districtOverlay.bringToBack();
}

const isHistView = () => currentView === "hist";
const isDistrictView = () => currentView.startsWith("d-");

function showEvt(p) {
  if (isHistView()) return false;
  if (isDistrictView()) {
    if (districtKey(p.district) !== districtF) return false;
  } else if (evtF !== "all" && p.evt !== evtF) return false;
  return (kindF === "all" || p.kind === kindF)
    && (!qEvt || (p.name + p.district + p.note + p.source + p.duration + p.depth).includes(qEvt));
}
function showHist(p) {
  if (isDistrictView()) {
    if (districtKey(p.district) !== districtF) return false;
  } else if (!isHistView()) return false;
  return (histF === "all" || p.cat === histF)
    && (!qHist || (p.name + p.district + p.note + CAT[p.cat]).includes(qHist));
}

function updatePeriodCopy() {
  if (isHistView()) return;
  if (isDistrictView()) {
    const evN = EVENTS.filter((p) => districtKey(p.district) === districtF).length;
    const hiN = HIST.filter((p) => districtKey(p.district) === districtF).length;
    document.getElementById("evt-title").textContent = `分区分图 · ${districtF}`;
    document.getElementById("evt-sub").textContent = `仅显示「${districtF}」相关调研事件与常年/用户点位。`;
    const boundNote = districtF === "经开"
      ? "浅蓝虚线为经开功能区示意（非国家标准县级界）。"
      : "浅蓝为该区行政边界示意（与高德底图同 GCJ 坐标）。";
    document.getElementById("period-banner").innerHTML =
      `<strong>${esc(districtF)}</strong>：调研事件 <strong>${evN}</strong> 处 · 常年/用户图层 <strong>${hiN}</strong> 处。${boundNote}`;
    return;
  }
  const meta = PERIOD[evtF] || PERIOD.all;
  document.getElementById("evt-title").textContent = meta.title;
  document.getElementById("evt-sub").textContent = meta.sub;
  document.getElementById("period-banner").innerHTML = meta.banner;
}

function fitVisible(pad) {
  const padding = pad || [48, 48];
  if (isDistrictView() && districtOverlay) {
    const b = districtOverlay.getBounds();
    if (b && b.isValid()) {
      const maxZoom = districtF === "安宁" || districtF === "呈贡" || districtF === "官渡" ? 11 : 12;
      map.flyToBounds(b, { padding, maxZoom, duration: 0.55 });
      return;
    }
  }
  const pts = isHistView()
    ? HIST.filter(showHist).map((p) => p._ll)
    : [
        ...EVENTS.filter(showEvt).map((p) => p._ll),
        ...(isDistrictView() ? HIST.filter(showHist).map((p) => p._ll) : [])
      ];
  if (!pts.length) return;
  let maxZoom = 12;
  if (isHistView()) maxZoom = 11;
  else if (isDistrictView()) maxZoom = districtF === "安宁" || districtF === "呈贡" ? 12 : 13;
  else if (evtF === "0802") maxZoom = 12;
  else if (evtF === "0716") maxZoom = 12;
  else maxZoom = 13;
  map.flyToBounds(pts, { padding, maxZoom, duration: 0.55 });
}

function isMobile() {
  return window.matchMedia("(max-width: 960px)").matches;
}
function setSheetOpen(open) {
  const boards = document.getElementById("boards");
  const btn = document.getElementById("sheet-toggle");
  if (!boards || !btn) return;
  boards.classList.toggle("open", open);
  btn.setAttribute("aria-expanded", open ? "true" : "false");
  updateSheetLabel();
  setTimeout(() => map.invalidateSize(), 300);
}
function updateSheetLabel() {
  const label = document.getElementById("sheet-label");
  if (!label) return;
  const n = isHistView()
    ? HIST.filter(showHist).length
    : EVENTS.filter(showEvt).length + (isDistrictView() ? HIST.filter(showHist).length : 0);
  const title = isHistView() ? "常年易淹" : (isDistrictView() ? `分区·${districtF}` : "点位列表");
  const open = document.getElementById("boards")?.classList.contains("open");
  label.textContent = open ? `${title} · ${n} 处 · 点击收起` : `${title} · ${n} 处 · 点击展开`;
}

function makeListButton(html, onClick) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "item";
  el.innerHTML = html;
  el.addEventListener("click", onClick);
  return el;
}

function render() {
  updatePeriodCopy();
  const box = document.getElementById("list-evt");
  box.innerHTML = "";
  EVENTS.forEach((p) => {
    const on = showEvt(p);
    if (on) map.addLayer(evtLayer[p.id]); else map.removeLayer(evtLayer[p.id]);
    if (!on) return;
    box.appendChild(makeListButton(
      `<span class="badge ${p.kind}">${esc(p._label)}</span><div><h3>${esc(p.name)}</h3><p>${esc(`${EVT_LABEL[p.evt]} · ${p.district} · ${KIND_LABEL[p.kind]} · ${p.duration}`)}</p></div><div class="meta ${p.kind}">${esc(p.depth)}</div>`,
      () => {
        if (isMobile()) setSheetOpen(false);
        map.flyTo(p._ll, p.district === "呈贡" || p.district === "安宁" ? 14 : 15, { duration: 0.45 });
        setTimeout(() => p._marker.openPopup(), isMobile() ? 280 : 0);
      }
    ));
  });

  const hBox = document.getElementById("list-hist");
  const histTarget = isDistrictView() ? box : hBox;
  hBox.innerHTML = "";
  if (isDistrictView() && HIST.some(showHist)) {
    const sep = document.createElement("div");
    sep.className = "note";
    sep.style.padding = "10px 8px 4px";
    sep.textContent = "—— 常年 / 用户补点 ——";
    box.appendChild(sep);
  }
  HIST.forEach((p) => {
    const on = showHist(p);
    if (on) map.addLayer(histLayer[p.n]); else map.removeLayer(histLayer[p.n]);
    if (!on) return;
    const badgeCls = p.cat === "ugc" ? "badge ugc" : p.cat === "safe" ? "badge safe" : "badge sq";
    const badgeInner = p.cat === "ugc" || p.cat === "safe"
      ? esc(p.n.replace("H", ""))
      : `<span>${esc(p.n.replace("H", ""))}</span>`;
    histTarget.appendChild(makeListButton(
      `<span class="${badgeCls}">${badgeInner}</span><div><h3>${esc(p.name)}</h3><p>${esc(`${p.district} · ${CAT[p.cat]} · ${p.note}`)}</p></div><div class="meta ${p.cat === "ugc" || p.cat === "safe" ? p.cat : ""}">${esc(p.depth)}</div>`,
      () => {
        if (isMobile()) setSheetOpen(false);
        map.flyTo(p._ll, p.district === "安宁" ? 14 : 15, { duration: 0.45 });
        setTimeout(() => p._marker.openPopup(), isMobile() ? 280 : 0);
      }
    ));
  });
  updateSheetLabel();
  refreshDistrictStats();
  paintDistrictOverlay();
}

/* —— 区域分析统计（按现库实算） —— */
function paintMorphBars() {
  const el = document.getElementById("morph-bars");
  if (!el) return;
  const counts = {};
  EVENTS.forEach((p) => { counts[p.morph] = (counts[p.morph] || 0) + 1; });
  const maxM = Math.max(...MORPH_ORDER.map((k) => counts[k] || 0), 1);
  el.innerHTML = "";
  MORPH_ORDER.forEach((k) => {
    const n = counts[k] || 0;
    const hot = k === "road" || k === "tunnel";
    const row = document.createElement("div");
    row.className = "bar-row wide";
    row.innerHTML = `<span>${MORPH_LABEL[k]}</span><div class="bar-track"><div class="bar-fill${hot ? "" : " blue"}"></div></div><span>${n}</span>`;
    row.querySelector(".bar-fill").style.setProperty("--w", `${(n / maxM) * 100}%`);
    el.appendChild(row);
  });
}

function refreshDistrictStats() {
  const ev = {}, hi = {};
  DISTRICTS.forEach((k) => { ev[k] = 0; hi[k] = 0; });
  EVENTS.forEach((p) => { const k = districtKey(p.district); if (ev[k] != null) ev[k]++; });
  HIST.forEach((p) => { const k = districtKey(p.district); if (hi[k] != null) hi[k]++; });
  DISTRICTS.forEach((k) => {
    const btn = document.querySelector(`.topnav [data-view="d-${k}"]`);
    if (btn) btn.textContent = `${k} ${ev[k] + hi[k]}`;
  });
  const bar = document.getElementById("district-bars");
  if (bar) {
    const pairs = DISTRICTS.map((k) => [k, ev[k]]).filter(([, n]) => n > 0);
    const max = Math.max(...pairs.map((p) => p[1]), 1);
    bar.innerHTML = "";
    pairs.forEach(([name, n]) => {
      const row = document.createElement("div");
      row.className = "bar-row";
      row.innerHTML = `<span>${esc(name)}</span><div class="bar-track"><div class="bar-fill"></div></div><span>${n}</span>`;
      row.querySelector(".bar-fill").style.setProperty("--w", `${(n / max) * 100}%`);
      bar.appendChild(row);
    });
  }
  const tbl = document.getElementById("district-table-body");
  if (tbl) {
    const roles = {
      官渡: "主战场（含机场走廊）",
      经开: "东延涵洞带",
      呈贡: "新区过程雨",
      五华: "西翼+北城",
      盘龙: "轻触+河道老区",
      西山: "永昌低洼+前卫广福",
      安宁: "城郊历史点"
    };
    const notes = {
      官渡: "三场暴雨均有；东二环、国贸、牛街庄、广福南片集中；机场向金瓦路等管制点已并入（长水机场行政属官渡）",
      经开: "贵昆路/涵洞早报点；与官渡东廊衔接；分图边界为功能区示意",
      呈贡: "8.2–3 临时管制为主；水深公开不足",
      五华: "海源–滇缅正式通报 + 用户补点（金泰/戛纳/海源北/龙泉路）",
      盘龙: "道路名单少；金汁河/盘龙江沿岸老社区在常年层",
      西山: "华昌×采莲、永昌/云纺、豆腐营低洼带；前卫西路×广福路（十一家具城）7.16 重度",
      安宁: "万辉星城、玉龙湾等历史纪录（常年层）"
    };
    tbl.innerHTML = DISTRICTS.filter((k) => ev[k] + hi[k] > 0).map((k) => {
      const total = ev[k] + hi[k];
      const share = Math.round((ev[k] / Math.max(EVENTS.length, 1)) * 100);
      return `<tr class="${k === "官渡" ? "hot" : ""}"><td>${esc(k)}</td><td>事件 ${ev[k]} · 图层 ${hi[k]} · 合计 ${total}</td><td>${esc(roles[k] || "")}</td><td>${esc(notes[k] || "")}（事件约占命名点 ${share}%）</td></tr>`;
    }).join("");
  }
  const lead = document.getElementById("report-district-lead");
  if (lead) {
    lead.textContent = `调研事件命名点 ${EVENTS.length} 处（按现库统计）。「机场向」已并入官渡。分区分图显示浅蓝行政边界；条形图仅计事件点。`;
  }
  paintMorphBars();
}

/* —— 视图切换 + hash 路由（可分享 #v=0818 / #v=d-西山 等） —— */
const VALID_VIEWS = new Set(
  [...document.querySelectorAll(".topnav [data-view]")].map((b) => b.dataset.view)
);
function viewFromHash() {
  const m = location.hash.match(/^#v=(.+)$/);
  if (!m) return null;
  try {
    const v = decodeURIComponent(m[1]);
    return VALID_VIEWS.has(v) ? v : null;
  } catch (_) {
    return null;
  }
}

function setView(view, { fit = true, push = true } = {}) {
  if (!VALID_VIEWS.has(view)) view = "all";
  currentView = view;
  const isReport = view === "report";
  const histMode = view === "hist";
  const districtMode = view.startsWith("d-");
  districtF = districtMode ? view.slice(2) : null;

  document.getElementById("view-map").classList.toggle("hidden", isReport);
  document.getElementById("view-report").classList.toggle("hidden", !isReport);
  document.getElementById("map-tools").classList.toggle("hidden", isReport);
  document.getElementById("place-search").classList.toggle("hidden", isReport);
  document.getElementById("legend").classList.toggle("hidden", isReport);

  document.querySelectorAll(".topnav [data-view]").forEach((b) => {
    b.classList.toggle("on", b.dataset.view === view);
  });

  if (push) {
    const target = `#v=${encodeURIComponent(view)}`;
    if (location.hash !== target) history.replaceState(null, "", target);
  }

  if (isReport) {
    clearDistrictOverlay();
    refreshDistrictStats();
    return;
  }

  document.getElementById("panel-evt").classList.toggle("show", !histMode);
  document.getElementById("panel-hist").classList.toggle("show", histMode);
  document.getElementById("legend-evt").classList.toggle("hidden", histMode && !districtMode);
  document.getElementById("legend-hist").classList.toggle("hidden", !histMode && !districtMode);
  if (districtMode) {
    document.getElementById("legend-evt").classList.remove("hidden");
    document.getElementById("legend-hist").classList.remove("hidden");
  }

  if (!histMode && !districtMode) evtF = view;
  if (districtMode) { evtF = "all"; histF = "all"; }
  if (!districtMode) clearDistrictOverlay();
  if (isMobile()) setSheetOpen(false);
  render();
  requestAnimationFrame(() => {
    map.invalidateSize();
    if (fit) fitVisible();
  });
}

window.addEventListener("hashchange", () => {
  const v = viewFromHash();
  if (v && v !== currentView) setView(v, { push: false });
});

/* —— 事件绑定 —— */
document.getElementById("sheet-toggle").onclick = () => {
  const boards = document.getElementById("boards");
  setSheetOpen(!boards.classList.contains("open"));
};
window.addEventListener("resize", debounce(() => {
  map.invalidateSize();
  updateSheetLabel();
}, 150));

document.querySelectorAll(".topnav [data-view]").forEach((btn) => {
  btn.onclick = () => setView(btn.dataset.view);
});
document.querySelectorAll(".jump-map").forEach((btn) => {
  btn.onclick = () => setView(btn.dataset.jump);
});
document.querySelectorAll("[data-kind]").forEach((btn) => {
  btn.onclick = () => {
    kindF = btn.dataset.kind;
    document.querySelectorAll("[data-kind]").forEach((b) => b.classList.toggle("on", b === btn));
    render();
  };
});
document.querySelectorAll("[data-hist]").forEach((btn) => {
  btn.onclick = () => {
    histF = btn.dataset.hist;
    document.querySelectorAll("[data-hist]").forEach((b) => b.classList.toggle("on", b === btn));
    render();
  };
});
document.getElementById("q-evt").addEventListener("input", debounce((e) => {
  qEvt = e.target.value.trim();
  render();
}, 120));
document.getElementById("q-hist").addEventListener("input", debounce((e) => {
  qHist = e.target.value.trim();
  render();
}, 120));

/* —— 地点搜索：定位小区/路段，判断与淹水圈是否重叠 —— */
const placeSuggestEl = document.getElementById("place-suggest");
const placeResultEl = document.getElementById("place-result");
const placeQEl = document.getElementById("place-q");
const placeGoBtn = document.getElementById("place-go");
let placeLayer = null;
let placeTimer = null;
let placeReqId = 0;
let lastGeocodeAt = 0;
let locateMarker = null;

function showPlaceMessage(title, text) {
  hidePlaceUi();
  placeResultEl.classList.remove("hidden");
  placeResultEl.innerHTML = `<h3>${esc(title)}</h3><p>${esc(text)}</p>`;
}

document.getElementById("btn-locate").onclick = () => {
  if (!navigator.geolocation) {
    showPlaceMessage("无法定位", "当前浏览器不支持定位，可改用顶部搜索小区/路段。");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const ll = toMapLL(pos.coords.latitude, pos.coords.longitude, "wgs");
      if (locateMarker) map.removeLayer(locateMarker);
      locateMarker = L.circleMarker(ll, {
        radius: 8, color: "#fff", weight: 2, fillColor: "#b42318", fillOpacity: 1
      }).addTo(map).bindPopup("你大概在这里");
      locateMarker.openPopup();
      map.flyTo(ll, 15);
    },
    () => {
      showPlaceMessage("定位失败", "浏览器未授权或定位超时。可改用顶部搜索框查小区/路段是否近淹水区。");
    },
    { timeout: 10000, maximumAge: 60000 }
  );
};
document.getElementById("btn-fit").onclick = () => fitVisible([40, 40]);

function haversineM(aLat, aLng, bLat, bLng) {
  const R = 6371000;
  const toR = (d) => d * Math.PI / 180;
  const dLat = toR(bLat - aLat);
  const dLng = toR(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function clearPlaceLayer() {
  if (placeLayer) {
    map.removeLayer(placeLayer);
    placeLayer = null;
  }
}

function hidePlaceUi() {
  placeSuggestEl.classList.add("hidden");
  placeSuggestEl.innerHTML = "";
}

function localPlaceHits(q) {
  const needle = q.trim().toLowerCase();
  if (needle.length < 1) return [];
  const out = [];
  EVENTS.forEach((p) => {
    const blob = `${p.name} ${p.district} ${p.note || ""} ${p.source || ""}`.toLowerCase();
    if (blob.includes(needle)) {
      out.push({
        source: "库内事件",
        name: p.name,
        detail: `${EVT_LABEL[p.evt]} · ${p.district} · ${KIND_LABEL[p.kind]}`,
        lat: p._ll[0],
        lng: p._ll[1],
        crs: "gcj",
        ref: p
      });
    }
  });
  HIST.forEach((p) => {
    const blob = `${p.name} ${p.district} ${p.note || ""}`.toLowerCase();
    if (blob.includes(needle)) {
      out.push({
        source: "常年/用户层",
        name: p.name,
        detail: `${p.district} · ${CAT[p.cat]} · ${p.depth}`,
        lat: p._ll[0],
        lng: p._ll[1],
        crs: "gcj",
        ref: p
      });
    }
  });
  return out.slice(0, 8);
}

async function geocodeKunming(q) {
  const query = /昆明|云南/.test(q) ? q : `昆明 ${q}`;
  const url = "https://nominatim.openstreetmap.org/search?"
    + new URLSearchParams({
      q: query,
      format: "json",
      limit: "6",
      countrycodes: "cn",
      "accept-language": "zh-CN",
      viewbox: "102.45,25.25,103.05,24.75",
      bounded: "0"
    });
  const res = await fetch(url, {
    headers: { Accept: "application/json" }
  });
  if (!res.ok) throw new Error("geocode " + res.status);
  const rows = await res.json();
  return (rows || []).map((r) => ({
    source: "地图检索",
    name: (r.namedetails && (r.namedetails.name || r.namedetails["name:zh"]))
      || (r.display_name || "").split(",")[0]
      || q,
    detail: r.display_name || "",
    lat: Number(r.lat),
    lng: Number(r.lon),
    crs: "wgs",
    ref: null
  })).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

function scoreOverlap(ll) {
  const [lat, lng] = ll;
  const hits = [];
  EVENTS.forEach((p) => {
    const d = haversineM(lat, lng, p._ll[0], p._ll[1]);
    if (d <= EVENT_RING_R + EVENT_NEAR_PAD) {
      hits.push({
        kind: "event",
        level: d <= EVENT_RING_R ? "hit" : "near",
        dist: Math.round(d),
        title: p.name,
        sub: `${EVT_LABEL[p.evt]} · ${KIND_LABEL[p.kind]} · ${p.depth}`,
        point: p
      });
    }
  });
  HIST.forEach((p) => {
    const radius = p.r || HIST_DEFAULT_R;
    const d = haversineM(lat, lng, p._ll[0], p._ll[1]);
    if (d <= radius + HIST_NEAR_PAD) {
      hits.push({
        kind: "hist",
        level: d <= radius ? "hit" : "near",
        dist: Math.round(d),
        title: p.name,
        sub: `${CAT[p.cat]} · ${p.depth}`,
        point: p
      });
    }
  });
  hits.sort((a, b) => a.dist - b.dist);
  const best = hits[0];
  let verdict = "clear";
  let label = "库内未见直接重叠";
  let tip = "不等于绝对安全：公开点位是路口近似，小区内部低洼仍可能积水。";
  if (best && best.level === "hit") {
    verdict = "hit";
    label = best.kind === "hist" && best.point.cat === "safe"
      ? "落在「相对未淹」反馈片区内"
      : "与淹水/易淹范围重叠或极近";
    tip = best.point.cat === "safe"
      ? "该片有用户反馈本次未淹，仍建议关注最新气象与现场路况。"
      : "落点落在已标积水圈或常年易淹范围内，出行请绕行并关注最新通报。";
  } else if (best && best.level === "near") {
    verdict = "near";
    label = "邻近淹水点（未完全落入圈内）";
    tip = "周边有公开积水记录，暴雨时仍建议提前改道。";
  }
  return { verdict, label, tip, hits: hits.slice(0, 5) };
}

function ensurePlaceVisible(hits) {
  /* 切到全部视图，便于同时看到事件与常年圈 */
  if (currentView !== "all") setView("all", { fit: false });
  hits.forEach((h) => {
    if (h.kind === "event" && evtLayer[h.point.id]) map.addLayer(evtLayer[h.point.id]);
    if (h.kind === "hist" && histLayer[h.point.n]) map.addLayer(histLayer[h.point.n]);
  });
}

function focusPlace(item) {
  hidePlaceUi();
  const ll = item.crs === "wgs" ? toMapLL(item.lat, item.lng, "wgs") : [item.lat, item.lng];
  const scored = scoreOverlap(ll);
  ensurePlaceVisible(scored.hits);
  clearPlaceLayer();
  const probe = L.circle(ll, {
    radius: 90,
    color: "#0f172a",
    weight: 2,
    fillColor: "#f8fafc",
    fillOpacity: 0.35,
    dashArray: "4 4"
  });
  const marker = L.marker(ll, {
    icon: L.divIcon({
      className: "pin-wrap",
      html: '<div class="pin probe"><span>搜</span></div>',
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    }),
    zIndexOffset: 1200
  });
  marker.bindPopup(popupHtml(item.name, [
    item.detail || "",
    scored.label,
    scored.tip
  ], ll));
  placeLayer = L.layerGroup([probe, marker]).addTo(map);
  map.flyTo(ll, 15, { duration: 0.55 });
  setTimeout(() => marker.openPopup(), 400);

  const maxScope = Math.max(EVENT_RING_R + EVENT_NEAR_PAD, ...HIST.map((p) => (p.r || HIST_DEFAULT_R) + HIST_NEAR_PAD));
  const list = scored.hits.length
    ? `<ul>${scored.hits.map((h) =>
      `<li><strong>${esc(h.title)}</strong> · ${esc(h.sub)} · 约 ${h.dist} m</li>`
    ).join("")}</ul>`
    : `<p>落点周边 ${Math.round(maxScope / 10) * 10} m 内暂无库内标点。</p>`;

  placeResultEl.classList.remove("hidden");
  placeResultEl.innerHTML = `
    <h3>${esc(item.name)}</h3>
    <span class="verdict ${scored.verdict}">${esc(scored.label)}</span>
    <p>${esc(scored.tip)}</p>
    <p style="font-size:12px;color:#78716c">${esc(item.source)}${item.detail ? " · " + esc(item.detail) : ""}</p>
    ${list}
    <div class="place-actions">
      <button type="button" id="place-clear">清除定位</button>
      <a href="https://uri.amap.com/marker?position=${ll[1]},${ll[0]}&name=${encodeURIComponent(item.name)}" target="_blank" rel="noopener" style="font-size:12px;align-self:center">高德打开</a>
    </div>`;
  document.getElementById("place-clear").onclick = () => {
    clearPlaceLayer();
    placeResultEl.classList.add("hidden");
    placeResultEl.innerHTML = "";
  };
  if (isMobile()) setSheetOpen(false);
}

function renderSuggest(items) {
  if (!items.length) {
    hidePlaceUi();
    return;
  }
  placeSuggestEl.classList.remove("hidden");
  placeSuggestEl.innerHTML = items.map((it, i) =>
    `<button type="button" role="option" data-i="${i}"><strong>${esc(it.name)}</strong><span>${esc(it.source)} · ${esc(it.detail)}</span></button>`
  ).join("");
  placeSuggestEl.querySelectorAll("button").forEach((btn) => {
    btn.onclick = () => focusPlace(items[Number(btn.dataset.i)]);
  });
}

async function runPlaceSearch(q, { autoFocus = false } = {}) {
  const query = q.trim();
  if (!query) return;
  const req = ++placeReqId;
  placeGoBtn.disabled = true;
  placeGoBtn.textContent = "检索中";
  placeResultEl.classList.add("hidden");
  try {
    const local = localPlaceHits(query);
    let remote = [];
    /* Nominatim 公共接口限速 ≤1 次/秒；间隔不足时只用库内结果 */
    if (Date.now() - lastGeocodeAt >= 1100) {
      lastGeocodeAt = Date.now();
      try {
        remote = await geocodeKunming(query);
      } catch (_) {
        /* 外网检索失败时仍可用库内匹配 */
      }
    }
    if (req !== placeReqId) return;
    const merged = [];
    const seen = new Set();
    [...local, ...remote].forEach((it) => {
      const key = `${it.name}|${it.lat.toFixed(4)}|${it.lng.toFixed(4)}`;
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(it);
    });
    if (!merged.length) {
      hidePlaceUi();
      placeResultEl.classList.remove("hidden");
      placeResultEl.innerHTML = `
        <h3>未找到「${esc(query)}」</h3>
        <span class="verdict unknown">暂无定位结果</span>
        <p>可换正式小区名、道路名，或加方位词（如「华润润府 官渡」）。库内路段名也可直接搜。</p>`;
      return;
    }
    renderSuggest(merged);
    if (autoFocus) focusPlace(merged[0]);
  } finally {
    if (req === placeReqId) {
      placeGoBtn.disabled = false;
      placeGoBtn.textContent = "查淹水";
    }
  }
}

document.getElementById("place-search-form").addEventListener("submit", (e) => {
  e.preventDefault();
  runPlaceSearch(placeQEl.value, { autoFocus: true });
});
placeQEl.addEventListener("input", () => {
  const q = placeQEl.value.trim();
  clearTimeout(placeTimer);
  if (q.length < 2) {
    hidePlaceUi();
    return;
  }
  const local = localPlaceHits(q);
  if (local.length) renderSuggest(local);
  placeTimer = setTimeout(() => runPlaceSearch(q, { autoFocus: false }), 450);
});
document.addEventListener("click", (e) => {
  if (!document.getElementById("place-search").contains(e.target)) hidePlaceUi();
});

/* —— 启动 —— */
window.__flood = { map, EVENTS, HIST }; /* 调试句柄 */
loadDistrictBounds().then(() => {
  setView(viewFromHash() || "all", { fit: false, push: false });
});
