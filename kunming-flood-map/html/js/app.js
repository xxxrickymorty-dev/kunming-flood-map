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
      if (!p.source) p.source = byId[p.ref].source;
      if (!p.evt) p.evt = byId[p.ref].evt;
    }
  });
}

const EVT_LABEL = { "0818": "8.18", "0810": "8.10", "0802": "8.2–3", "0727": "7.27", "0717": "7.17", "0716": "7.16" };
const KIND_LABEL = { closed: "断交/重度", mid: "中度", slow: "缓行", ctrl: "管制/未测深" };
const PIN_CLASS = { closed: "closed", mid: "mid", slow: "slow", ctrl: "ctrl" };
const RING = { closed: "#c1121f", mid: "#e85d04", slow: "#f59e0b", ctrl: "#4f46e5" };

/* 命中判定半径（米）：与地图上绘制的圈保持一致 */
const EVENT_RING_R = 110;   // 事件点圈半径（绘制与命中共用）
const EVENT_NEAR_PAD = 80;  // 事件点“邻近”余量
const HIST_NEAR_PAD = 120;  // 常年/用户点“邻近”余量
const HIST_DEFAULT_R = 200;
const PLACE_NEAR_SCAN_M = 3500; // 目的地检索：展示周边最近积水点的半径
const PLACE_FOCUS_RADIUS_M = 420; // 搜索定位时视野半径（约占半屏）

/* 叠点合并：同场 150 m 内只保留一枚图钉；跨场次仅 60 m 内合并（避免 J3/U24 等刻意错针被并掉） */
const OVERLAP_DEDUP_SAME_EVT_M = 150;
const OVERLAP_DEDUP_CROSS_EVT_M = 60;

function haversineM(aLat, aLng, bLat, bLng) {
  const R = 6371000;
  const toR = (d) => d * Math.PI / 180;
  const dLat = toR(bLat - aLat);
  const dLng = toR(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function sourceRank(source) {
  const s = String(source || "");
  if (/昆明交警|昆明消防|昆水管网|昆明信息港|昆明日报/.test(s)) return 100;
  if (/本地宝|澎湃|长水机场|都市时报|云南网/.test(s)) return 80;
  if (/水务局/.test(s)) return 65;
  if (/用户反馈/.test(s)) return 35;
  if (/小红书/.test(s)) return 40;
  return 50;
}

const KIND_RANK = { closed: 4, ctrl: 3, mid: 2, slow: 1 };

function pickOverlapPrimary(a, b) {
  const ra = sourceRank(a.source);
  const rb = sourceRank(b.source);
  if (ra !== rb) return ra > rb ? a : b;
  const ka = KIND_RANK[a.kind] || 0;
  const kb = KIND_RANK[b.kind] || 0;
  if (ka !== kb) return ka > kb ? a : b;
  const na = typeof a.n === "number" ? a.n : 999;
  const nb = typeof b.n === "number" ? b.n : 999;
  return na <= nb ? a : b;
}

function shouldMergeOverlap(a, b, distM) {
  if (a.evt === b.evt) return distM <= OVERLAP_DEDUP_SAME_EVT_M;
  return distM <= OVERLAP_DEDUP_CROSS_EVT_M;
}

function dedupeEventClusters(events) {
  const n = events.length;
  const parent = events.map((_, i) => i);
  function find(i) {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  function unite(i, j) {
    parent[find(i)] = find(j);
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = haversineM(events[i].lat, events[i].lng, events[j].lat, events[j].lng);
      if (shouldMergeOverlap(events[i], events[j], d)) unite(i, j);
    }
  }
  const clusters = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!clusters.has(r)) clusters.set(r, []);
    clusters.get(r).push(events[i]);
  }
  events.forEach((p) => {
    p._mergedInto = null;
    p._mergedFrom = [];
  });
  for (const group of clusters.values()) {
    if (group.length < 2) continue;
    let primary = group[0];
    for (let k = 1; k < group.length; k++) primary = pickOverlapPrimary(primary, group[k]);
    primary._mergedFrom = group.filter((p) => p.id !== primary.id);
    for (const sec of primary._mergedFrom) sec._mergedInto = primary.id;
  }
}

function mergedNoteLines(p) {
  if (!p._mergedFrom?.length) return [];
  return p._mergedFrom.map((m) => {
    const label = String(typeof m.n === "number" ? m.n : m.id);
    return `同位置另有：${m.name}（编号 ${label} · ${KIND_LABEL[m.kind]} · ${m.depth}）`;
  });
}

function resolveEventPrimary(p) {
  let cur = p;
  while (cur._mergedInto) {
    cur = EVENTS.find((x) => x.id === cur._mergedInto) || cur;
  }
  return cur;
}

/* 昆明市县级行政区（国标代码，与用户提供的 2025 区划一致）。经开/高新/度假区不是县级区。 */
const ADMIN = [
  { key: "五华", code: "530102", full: "五华区", units: "10 街道", streets: "护国、华山、大观、龙翔、莲华、丰宁、红云、普吉、黑林铺、西翥" },
  { key: "盘龙", code: "530103", full: "盘龙区", units: "12 街道", streets: "拓东、鼓楼、东华、联盟、金辰、茨坝、龙泉、青云、双龙、松华、滇源、阿子营" },
  { key: "官渡", code: "530111", full: "官渡区", units: "12 街道", streets: "吴井、太和、关上、金马、官渡、小板桥、大板桥、六甲、矣六、阿拉、小哨、长水" },
  { key: "西山", code: "530112", full: "西山区", units: "10 街道", streets: "马街、金碧、永昌、前卫、福海、棕树营、西苑、碧鸡、海口、团结" },
  { key: "东川", code: "530113", full: "东川区", units: "3 街道 · 6 镇", streets: "铜都、碧谷、集义；阿旺、乌龙、红土地、汤丹、拖布卡、因民" },
  { key: "呈贡", code: "530114", full: "呈贡区", units: "10 街道", streets: "龙城、洛羊、斗南、吴家营、马金铺、七甸、大渔、洛龙、雨花、乌龙" },
  { key: "晋宁", code: "530115", full: "晋宁区", units: "3 街道 · 3 镇 · 2 乡", streets: "昆阳、宝峰、晋城；二街、上蒜、六街；双河、夕阳" },
  { key: "富民", code: "530124", full: "富民县", units: "2 街道 · 5 镇", streets: "永定、大营；东村、款庄、赤鹫、散旦、罗免" },
  { key: "宜良", code: "530125", full: "宜良县", units: "3 街道 · 4 镇 · 2 乡", streets: "匡远、汤池、南羊；狗街、北古城、马街、竹山；耿家营、九乡" },
  { key: "石林", code: "530126", full: "石林彝族自治县", units: "3 街道 · 3 镇 · 1 乡", streets: "鹿阜、石林、板桥；西街口、长湖、圭山；大可" },
  { key: "嵩明", code: "530127", full: "嵩明县", units: "2 街道 · 3 镇", streets: "嵩阳、杨桥；杨林、小街、牛栏江" },
  { key: "禄劝", code: "530128", full: "禄劝彝族苗族自治县", units: "2 街道 · 9 镇 · 6 乡", streets: "屏山、崇德；撒营盘、转龙、茂山、翠华、团街、皎平渡、中屏、乌东德、九龙；云龙、则黑、乌蒙、雪山、汤朗、马鹿塘" },
  { key: "寻甸", code: "530129", full: "寻甸回族彝族自治县", units: "3 街道 · 9 镇 · 4 乡", streets: "仁德、塘子、金所；羊街、倘甸、柯渡、功山、七星、河口、先锋、鸡街、凤合；甸沙、金源、六哨、联合" },
  { key: "安宁", code: "530181", full: "安宁市", units: "9 街道", streets: "连然、金方、太平新城、温泉、青龙、草铺、禄脿、八街、县街" }
];
const DISTRICTS = ADMIN.map((a) => a.key);
const ADMIN_BY_KEY = Object.fromEntries(ADMIN.map((a) => [a.key, a]));

const PERIOD = {
  all: {
    title: "调研事件点 · 全部场次",
    sub: "依据 2026 汛期公开通报：昆水管网、交警、消防、机场提示。",
    banner: "<strong>全部场次</strong>：合并 7.16 / 7.17 / 7.27 / 8.2–3 / 8.10 / 8.18。积水高度集中在官渡东南，西翼海源–滇缅跨场复发。常年易淹请切顶部「常年易淹」分页。"
  },
  "0818": {
    title: "8.18 强降雨 · 淹水点",
    sub: "降雨主时段 17 日 23 时–18 日 6 时 · 金马凉亭站 24h 158.1 mm",
    banner: "<strong>8.18</strong>：交警分时断交以官渡为主；10:15 原文见信息港。消防另点万象城、福发路（官南大道口用户视频严重）、彩虹华谊、中医二附院等。小红书/水务局转述补点见「用户反馈」。长润街白天 30→50 cm。"
  },
  "0810": {
    title: "8.10 晨雨 · 淹水点",
    sub: "管网 6 处 · 6:30 戒备 · 10:35 全部处置完毕",
    banner: "<strong>8.10</strong>：昆水管网 6 处，文中未写断交。含林家围、中林建材城、广福路广卫立交–星耀路、迎海路×观景路；海源中路、广福云秀–昌宏为跨场复发。"
  },
  "0716": {
    title: "7.16 大暴雨 · 淹水点",
    sub: "凌晨约 01:00 起 · 前卫雨量站 3 小时 80.9 mm · 昆水管网 24 处",
    banner: "<strong>7.16</strong>：重度 6 处含<strong>前卫西路与广福路交叉口</strong>（&gt;50→25 cm，至少约 7h）。雨心偏南与西：广福南片 + 海源/滇缅。国贸路当日为中度，8.18 再发。"
  },
  "0717": {
    title: "7.17 分散暴雨 · 淹水点",
    sub: "21:15 起雨 · 安宁摆渡 442 人 · 五华最大约 40 cm",
    banner: "<strong>7.17</strong>：雨心偏安宁太平新城与西山团结公路（小河村–龙坪坝）；五华滇缅/海源/昌源北与 7.16 同片复发。玉龙湾景区次日关闭。"
  },
  "0727": {
    title: "7.27 官渡古镇 · 淹水点",
    sub: "短时暴雨 · 云秀路近百米 · 非交警断交名单",
    banner: "<strong>7.27</strong>：官渡古镇云秀路十余分钟起淹，最深过膝，夜里约 2 点退。社区抽排，不是交警主名单。"
  },
  "0802": {
    title: "8.2–3 局部暴雨 · 淹水点",
    sub: "防汛Ⅳ级 · 官渡 / 呈贡 / 经开 · 公开水深不足",
    banner: "<strong>8.2–3</strong>：呈贡金桂街、兴呈路、昆玉路下穿临时管制；官渡小板桥/矣六、云秀康园外围、杜家营垂钓园；用户补：8.3 珥季路广福–如意中双向管制、广福路世纪城西南门东向西限道。水深与清退时刻公开少。"
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
const NEWS = {
  昆水管网: "https://www.kunming.cn/news/c/2026-07-17/14059480.shtml",
  昆明信息港: "https://www.kunming.cn/news/c/2026-07-17/14059480.shtml",
  信息港0717: "https://www.kunming.cn/news/c/2026-07-18/14059759.shtml",
  信息港0727: "https://www.kunming.cn/video/c/2026-07-29/14062436.shtml",
  转载0727: "https://c.m.163.com/news/a/L2V0NPKS0552SO56.html",
  昆明日报: "https://c.m.163.com/news/a/L3FPSGEN05346936.html",
  人民网0802: "http://yn.people.com.cn/n2/2026/0804/c372456-41658327.html",
  都市时报: "https://www.jinantimes.com.cn/news-107-10844375.html",
  云南网0810: "https://kunming.yunnan.cn/system/2026/08/11/034118653.shtml",
  昆明交警: "https://www.kunming.cn/news/c/2026-08-18/14067262.shtml",
  信息港0818: "https://www.kunming.cn/news/c/2026-08-18/14067262.shtml",
  信息港0818午: "https://www.kunming.cn/news/c/2026-08-18/14067266.shtml",
  本地宝: "http://km.bendibao.com/news/2026818/106761.shtm",
  本地宝早报: "http://km.bendibao.com/news/2026818/106761.shtm",
  澎湃: "https://www.163.com/dy/article/L4K84UA50514R9P4.html",
  长水机场: "https://www.163.com/dy/article/L4K84UA50514R9P4.html",
  昆明消防: "https://www.kunming.cn/news/c/2026-08-18/14067231.shtml"
};

function sourceLinksFor(p) {
  const out = [];
  const seen = new Set();
  const add = (name, url) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ name, url });
  };
  if (Array.isArray(p.links) && p.links.length) {
    p.links.forEach((l) => add(l.name, l.url));
    return out;
  }
  if (p.evt === "0716") {
    add("昆水管网 / 信息港", NEWS.昆水管网);
    return out;
  }
  if (p.evt === "0717") {
    add("昆明信息港", NEWS.信息港0717);
    return out;
  }
  if (p.evt === "0727") {
    add("信息港视频", NEWS.信息港0727);
    add("8099999 转载", NEWS.转载0727);
    return out;
  }
  if (p.evt === "0810") {
    add("云南网 / 昆水管网", NEWS.云南网0810);
    return out;
  }
  if (p.evt === "0802") {
    if (/都市时报/.test(p.source || "")) add("都市时报", NEWS.都市时报);
    add("人民网云南", NEWS.人民网0802);
    add("昆明日报转载", NEWS.昆明日报);
    return out;
  }
  if (p.evt === "0818" && /消防/.test(p.source || "")) {
    add("昆明消防（信息港）", NEWS.昆明消防);
    return out;
  }
  const s = String(p.source || "");
  for (const name of ["本地宝早报", "长水机场", "昆水管网", "昆明信息港", "昆明日报", "昆明交警", "本地宝", "澎湃", "昆明消防"]) {
    if (!s.includes(name)) continue;
    add(name === "昆明交警" ? "昆明交警（信息港）" : name, NEWS[name] || NEWS.信息港0818);
  }
  if (p.evt === "0818" && !out.length) {
    add("昆明交警（信息港 10:15）", NEWS.信息港0818);
    add("信息港 13:00", NEWS.信息港0818午);
    add("本地宝分时", NEWS.本地宝);
  } else if (p.evt === "0818") {
    add("信息港 13:00", NEWS.信息港0818午);
    add("本地宝分时", NEWS.本地宝);
  }
  return out;
}

function amapHref(lat, lng, name) {
  return `https://uri.amap.com/marker?position=${lng},${lat}&name=${encodeURIComponent(name)}`;
}
function sourceLinksHtml(p) {
  const links = sourceLinksFor(p);
  if (links.length) {
    return `<span class="links">${links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)}</a>`).join("")}</span>`;
  }
  if (p.cat === "ugc") return "用户反馈（已交叉核实）";
  return esc(p.source || "常年图层");
}

const EVT_WHEN = { "0818": "2026-08-18", "0810": "2026-08-10", "0802": "2026-08-02～03", "0727": "2026-07-27", "0717": "2026-07-17", "0716": "2026-07-16" };
let catalogF = "all", catalogQ = "";

function catalogRecords() {
  const rows = [];
  EVENTS.forEach((p) => {
    const layerKeys = [p.evt];
    if (p.id.startsWith("U") || (Array.isArray(p.links) && p.links.some((l) => /xiaohongshu/.test(l.url || "")))) {
      layerKeys.push("feedback");
    }
    const primary = resolveEventPrimary(p);
    const mergedTag = p._mergedInto ? ` 已并入 ${primary.id}` : "";
    const mergedHay = primary._mergedFrom?.length
      ? primary._mergedFrom.map((m) => `${m.id} ${m.name}`).join(" ")
      : "";
    rows.push({
      id: p.id,
      layer: p.id.startsWith("U") ? "用户反馈" : "调研事件",
      layerKey: p.evt,
      layerKeys,
      name: p._mergedInto ? `${p.name}${mergedTag}` : p.name,
      district: districtKey(p.district),
      when: `${EVT_LABEL[p.evt]} · ${EVT_WHEN[p.evt]}`,
      depth: p.depth,
      impact: KIND_LABEL[p.kind],
      duration: p._mergedInto ? `→ ${primary.id}（#${primary._label}）` : p.duration,
      morph: MORPH_LABEL[p.morph] || p.morph,
      hay: `${p.id} ${p.name} ${p.district} ${p.depth} ${p.source} ${p.duration} ${p.note}${mergedTag} ${mergedHay}`,
      p: p._mergedInto ? primary : p
    });
  });
  HIST.forEach((p) => {
    const ugc = p.cat === "ugc";
    rows.push({
      id: p.n,
      layer: ugc ? "用户补点" : "常年易淹",
      layerKey: ugc ? "ugc" : "hist",
      layerKeys: ugc ? ["ugc"] : ["hist"],
      name: p.name,
      district: districtKey(p.district),
      when: ugc ? "用户补点" : (p.evt ? `常年 · 兼 ${EVT_LABEL[p.evt]}` : "常年易淹"),
      depth: p.depth,
      impact: ugc ? "用户易淹" : (CAT[p.cat] || "常年"),
      duration: p.ref ? `同址 ${p.ref}` : "—",
      morph: CAT[p.cat] || p.cat,
      hay: `${p.n} ${p.name} ${p.district} ${p.depth} ${p.note} ${p.source || ""}`,
      p
    });
  });
  return rows;
}

function paintCatalogTable() {
  const body = document.getElementById("catalog-body");
  const cap = document.getElementById("catalog-caption");
  if (!body) return;
  const all = catalogRecords();
  const rows = all.filter((r) => {
    const keys = r.layerKeys || [r.layerKey];
    if (catalogF !== "all" && !keys.includes(catalogF)) return false;
    if (catalogQ && !r.hay.includes(catalogQ)) return false;
    return true;
  });
  body.innerHTML = rows.map((r) => {
    const ll = r.p._ll || toMapLL(r.p.lat, r.p.lng);
    const [lat, lng] = ll;
    return `<tr>
      <td>${esc(r.id)}</td>
      <td>${esc(r.layer)}</td>
      <td class="place"><button type="button" class="catalog-goto" data-goto="${esc(r.id)}">${esc(r.name)}</button></td>
      <td>${esc(r.district)}</td>
      <td>${esc(r.when)}</td>
      <td>${esc(r.depth)}</td>
      <td>${esc(r.impact)}</td>
      <td>${esc(r.duration)}</td>
      <td>${esc(r.morph)}</td>
      <td>${sourceLinksHtml(r.p)}</td>
      <td class="amap"><a href="${esc(amapHref(lat, lng, r.name))}" target="_blank" rel="noopener">高德</a></td>
    </tr>`;
  }).join("");
  if (cap) {
    cap.textContent = `地图库全量 ${all.length} 条，当前筛选 ${rows.length} 条（调研事件 ${EVENTS.length} + 常年/用户 ${HIST.length}）。坐标为高德 GCJ-02。来源、高德链接与地图弹窗一致。`;
  }
}

function paintFeedbackTable() {
  const body = document.getElementById("feedback-body");
  if (!body) return;
  const rows = window.FLOOD_DATA.feedback || [];
  const inMap = (s) => s === "已入库" || s === "已有点（细化）";
  body.innerHTML = rows.map((r) => {
    const place = r.pin
      ? `<button type="button" class="catalog-goto" data-goto="${esc(r.pin)}">${esc(r.place)}</button>`
      : esc(r.place);
    const pinCell = r.pin
      ? `<button type="button" class="catalog-goto" data-goto="${esc(r.pin)}">${esc(r.pin)}</button>`
      : "—";
    const stClass = r.status === "已入库" ? "ok"
      : r.status === "已有点（细化）" ? "mid"
      : r.status === "负例不入库" ? "neg"
      : "maybe";
    return `<tr>
      <td>${esc(r.user)}</td>
      <td class="place">${place}</td>
      <td><span class="fb-st ${stClass}">${esc(r.status)}</span></td>
      <td>${inMap(r.status) ? "是" : "否"}</td>
      <td>${pinCell}</td>
      <td>${esc(r.district || "")}</td>
      <td class="amap"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.noteTitle || "小红书笔记")}</a></td>
    </tr>`;
  }).join("");
}

function gotoPoint(id) {
  let ev = EVENTS.find((p) => p.id === id);
  if (ev) {
    ev = resolveEventPrimary(ev);
    setView(ev.evt, { fit: false });
    map.flyTo(ev._ll, 15, { duration: 0.45 });
    setTimeout(() => ev._marker?.openPopup(), 320);
    return;
  }
  const hi = HIST.find((p) => p.n === id);
  if (hi) {
    setView("hist", { fit: false });
    if (histLayer[hi.n]) map.addLayer(histLayer[hi.n]);
    map.flyTo(hi._ll, 15, { duration: 0.45 });
    setTimeout(() => hi._marker.openPopup(), 320);
  }
}

function popupHtml(title, lines, latlng, links) {
  const [lat, lng] = latlng;
  const body = lines.filter(Boolean).map((t) => `<p>${esc(t)}</p>`).join("");
  const src = (links && links.length)
    ? `<p>来源：${links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)}</a>`).join(" · ")}</p>`
    : "";
  return `<div class="popup"><h3>${esc(title)}</h3>${body}${src}<p><a href="https://uri.amap.com/marker?position=${lng},${lat}&name=${encodeURIComponent(title)}" target="_blank" rel="noopener">用高德打开这一点</a></p></div>`;
}

dedupeEventClusters(EVENTS);

const evtLayer = {};
EVENTS.forEach((p, i) => {
  const ll = toMapLL(p.lat, p.lng);
  const label = String(typeof p.n === "number" ? p.n : i + 1);
  p._ll = ll;
  p._label = label;
  if (p._mergedInto) {
    p._marker = null;
    return;
  }
  const marker = L.marker(ll, { icon: pinIcon(label, PIN_CLASS[p.kind]), zIndexOffset: 600 });
  marker.bindPopup(popupHtml(p.name, [
    `${EVT_LABEL[p.evt]} · ${KIND_LABEL[p.kind]} · ${p.district}`,
    `水深：${p.depth}`,
    `持续：${p.duration}`,
    p.note || "",
    ...mergedNoteLines(p)
  ], ll, sourceLinksFor(p)));
  const ring = L.circle(ll, {
    radius: EVENT_RING_R,
    color: RING[p.kind],
    weight: 3,
    fillColor: RING[p.kind],
    fillOpacity: 0.14
  });
  evtLayer[p.id] = L.layerGroup([ring, marker]).addTo(map);
  p._marker = marker;
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
  ], ll, sourceLinksFor(p)));
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
  if (/盘龙/.test(s)) return "盘龙";
  if (/西山|度假/.test(s)) return "西山";
  if (/东川/.test(s)) return "东川";
  if (/呈贡/.test(s)) return "呈贡";
  if (/晋宁/.test(s)) return "晋宁";
  if (/富民/.test(s)) return "富民";
  if (/宜良/.test(s)) return "宜良";
  if (/石林/.test(s)) return "石林";
  if (/嵩明/.test(s)) return "嵩明";
  if (/禄劝/.test(s)) return "禄劝";
  if (/寻甸/.test(s)) return "寻甸";
  if (/安宁/.test(s)) return "安宁";
  /* 经开、长水机场行政上属官渡；旧标签「机场向」并入 */
  if (/官渡|经开|机场/.test(s)) return "官渡";
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
  if (p._mergedInto) return false;
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
    const admin = ADMIN_BY_KEY[districtF];
    const unitLine = admin ? `${admin.code} ${admin.full} · ${admin.units}` : "";
    const hasBound = !!(districtGeo && districtGeo.features.some((f) => f.properties && f.properties.name === districtF && f.properties.kind !== "zone"));
    let boundNote = hasBound
      ? "浅蓝为该区行政边界示意（与高德底图同 GCJ 坐标）。"
      : "本库暂无该区边界图层。";
    if (districtF === "官渡") {
      boundNote = `${unitLine}（${admin.streets}）。早报写「经开」的涵洞点已按行政区并入本区。`
        + "地图编号 26 是用户补点万象城（吴井环城南路1号）。浅蓝为行政示意。";
    } else if (admin && evN + hiN === 0) {
      boundNote = `${unitLine}。本库暂无 2026 汛期公开点名积水（六场通报未列本区），不是没有这个区。`;
    } else if (admin) {
      boundNote = `${unitLine}。${boundNote}`;
    }
    document.getElementById("period-banner").innerHTML =
      `<strong>${esc(districtF)}</strong>：调研事件 <strong>${evN}</strong> 处 · 常年/用户图层 <strong>${hiN}</strong> 处。${boundNote}`
      + ` <button type="button" class="jump-map" data-jump="report">← 区域分析</button>`;
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
  else if (evtF === "0717") maxZoom = 11;
  else if (evtF === "0802" || evtF === "0716" || evtF === "0810") maxZoom = 12;
  else maxZoom = 13;
  map.flyToBounds(pts, { padding, maxZoom, duration: 0.55 });
}

function isMobile() {
  return window.matchMedia("(max-width: 960px)").matches;
}

/* 阻止手机端整页横向滑移（保留地图拖拽与局部横向滚动） */
(function preventMobileHorizontalPan() {
  let startX = 0;
  let startY = 0;
  const scrollable = "#map, .leaflet-container, .list, .topnav .tabs, .catalog-wrap, .place-suggest, .report, .boards .bar, .place-search-form input, .map-overlay-top";
  document.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (!isMobile() || e.touches.length !== 1) return;
    if (e.target.closest(scrollable)) return;
    const dx = Math.abs(e.touches[0].clientX - startX);
    const dy = Math.abs(e.touches[0].clientY - startY);
    if (dx > dy && dx > 8) e.preventDefault();
  }, { passive: false });
})();
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
    if (p._mergedInto) return;
    const on = showEvt(p);
    if (on && evtLayer[p.id]) map.addLayer(evtLayer[p.id]);
    else if (evtLayer[p.id]) map.removeLayer(evtLayer[p.id]);
    if (!on) return;
    const mergeHint = p._mergedFrom?.length
      ? ` · 已合并 ${p._mergedFrom.map((m) => `#${m._label}`).join("、")}`
      : "";
    box.appendChild(makeListButton(
      `<span class="badge ${p.kind}">${esc(p._label)}</span><div><h3>${esc(p.name)}</h3><p>${esc(`${EVT_LABEL[p.evt]} · ${p.district} · ${KIND_LABEL[p.kind]} · ${p.duration}${mergeHint}`)}</p></div><div class="meta ${p.kind}">${esc(p.depth)}</div>`,
      () => {
        if (isMobile()) setSheetOpen(false);
        map.flyTo(p._ll, p.district === "呈贡" || p.district === "安宁" ? 14 : 15, { duration: 0.45 });
        setTimeout(() => p._marker?.openPopup(), isMobile() ? 280 : 0);
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

function paintDistrictTierList(ev, hi) {
  const el = document.getElementById("district-tier-list");
  if (!el) return;
  const total = (k) => (ev[k] || 0) + (hi[k] || 0);
  const tiers = [
    { cls: "tier-hang", label: "夯", keys: ["官渡"] },
    { cls: "tier-top", label: "顶级", keys: [] },
    { cls: "tier-elite", label: "人上人", keys: [] },
    { cls: "tier-npc", label: "NPC", keys: [] },
    { cls: "tier-bottom", label: "拉完了", keys: [] }
  ];
  const ranked = DISTRICTS.filter((k) => k !== "官渡" && total(k) > 0)
    .sort((a, b) => total(b) - total(a) || ev[b] - ev[a]);
  if (ranked[0]) tiers[1].keys.push(ranked[0]);
  if (ranked[1]) tiers[1].keys.push(ranked[1]);
  if (ranked[2]) tiers[2].keys.push(ranked[2]);
  if (ranked[3]) tiers[2].keys.push(ranked[3]);
  ranked.slice(4).forEach((k) => tiers[3].keys.push(k));
  DISTRICTS.filter((k) => total(k) === 0).forEach((k) => tiers[4].keys.push(k));
  el.innerHTML = tiers.map((t) => {
    const items = t.keys.map((k) => {
      const a = ADMIN_BY_KEY[k];
      const n = total(k);
      const name = a ? a.full : k;
      const jump = n > 0 ? ` data-jump="d-${esc(k)}"` : "";
      const count = n > 0 ? `<span class="n">${n}</span>` : "";
      return `<button type="button" class="tier-chip"${jump}>${esc(name)}${count}</button>`;
    }).join("");
    return `<div class="tier-row ${t.cls}">`
      + `<div class="tier-label">${esc(t.label)}</div>`
      + `<div class="tier-items">${items || '<span class="tier-empty">（本档暂空）</span>'}</div>`
      + `</div>`;
  }).join("");
}

function refreshDistrictStats() {
  const ev = {}, hi = {};
  DISTRICTS.forEach((k) => { ev[k] = 0; hi[k] = 0; });
  EVENTS.forEach((p) => { const k = districtKey(p.district); if (ev[k] != null) ev[k]++; });
  HIST.forEach((p) => { const k = districtKey(p.district); if (hi[k] != null) hi[k]++; });
  const shown = DISTRICTS.filter((k) => ev[k] + hi[k] > 0);
  paintDistrictTierList(ev, hi);
  const taglines = {
    官渡: "一骑绝尘 · 水城威尼斯",
    呈贡: "水深保密 · 管制不保密",
    五华: "海源–滇缅三进宫",
    盘龙: "名单隐身 · 河道不隐身",
    西山: "十一家具 · 大雨必淹",
    安宁: "皮划艇摆渡 442 人"
  };
  const board = document.getElementById("district-board");
  if (board) {
    board.innerHTML = shown.map((k) => {
      const a = ADMIN_BY_KEY[k];
      const total = ev[k] + hi[k];
      const hot = k === "官渡" ? " hot" : "";
      const tag = taglines[k] ? `<span class="tagline">${esc(taglines[k])}</span>` : "";
      return `<button type="button" class="district-card${hot}" data-jump="d-${esc(k)}">`
        + `<span class="name">${esc(a.full)}</span>`
        + `<span class="code">${esc(a.code)} · ${esc(a.units)}</span>`
        + `<span class="num">${total}</span>`
        + `<span class="split">事件 ${ev[k]} · 图层 ${hi[k]}</span>`
        + tag
        + `<span class="go">打开分图 →</span>`
        + `</button>`;
    }).join("");
  }
  const tbl = document.getElementById("district-table-body");
  if (tbl) {
    const notes = {
      官渡: "让我们恭喜官渡区一骑绝尘，拿下「水城威尼斯」称号。六场暴雨场场有戏，东二环到广福南片，针密得像筛子。7.27 古镇、8.10 管网、8.18 消防/小红书补点亦在本区。金马、吴井、长水机场属本区；早报「经开」涵洞已并入。",
      呈贡: "新区也要交进城学费：8.2–3 临时管制为主，水深公开不足，但名单从不缺席。",
      五华: "海源–滇缅跨 7.16 / 7.17 / 8.10 三进宫；黄土坡立交是常年 C 位。高新并入后，用户补点比部分官方还勤快。",
      盘龙: "交警名单里存在感偏低，金汁河/盘龙江老社区在蓝色图层里默默发光；青龙村 8.18 用户视频补点。",
      西山: "十一家具城：用户与官方一致认为「大雨必淹」。7.17 团结公路在山上淹，不在滇池里淹（已改正）。",
      安宁: "7.17 太平新城官方点名，皮划艇摆渡 442 人——主城看积水，安宁看渡船。"
    };
    tbl.innerHTML = ADMIN.filter((a) => ev[a.key] + hi[a.key] > 0).map((a) => {
      const k = a.key;
      const total = ev[k] + hi[k];
      const share = ev[k] ? `（事件约占命名点 ${Math.round((ev[k] / Math.max(EVENTS.length, 1)) * 100)}%）` : "";
      const note = notes[k] || "";
      return `<tr class="${k === "官渡" ? "hot" : ""}"><td>${esc(a.code)}</td><td title="${esc(a.streets)}"><button type="button" class="jump-map" data-jump="d-${esc(k)}">${esc(a.full)}</button></td><td>${esc(a.units)}</td><td>事件 ${ev[k]} · 图层 ${hi[k]} · 合计 ${total}</td><td>${esc(note)}${esc(share)}</td></tr>`;
    }).join("");
  }
  const lead = document.getElementById("report-district-lead");
  if (lead) {
    lead.textContent = `调研事件 ${EVENTS.length} 处、常年/用户图层 ${HIST.length} 处。下面这张分区分榜，仅供绕行避险——不是「昆明威尼斯」旅游指南。`;
  }
  paintMorphBars();
  paintCatalogTable();
}

/* —— 视图切换 + hash 路由（可分享 #v=0818 / #v=d-西山 等） —— */
const VALID_VIEWS = new Set([
  ...[...document.querySelectorAll(".topnav [data-view]")].map((b) => b.dataset.view),
  ...DISTRICTS.map((k) => `d-${k}`)
]);
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
  if (view === "d-经开") view = "d-官渡";
  if (!VALID_VIEWS.has(view)) view = "all";
  currentView = view;
  const isReport = view === "report";
  const isUgcPage = view === "ugc";
  const isPage = isReport || isUgcPage;
  const histMode = view === "hist";
  const districtMode = view.startsWith("d-");
  districtF = districtMode ? view.slice(2) : null;

  document.getElementById("view-map").classList.toggle("hidden", isPage);
  document.getElementById("view-report").classList.toggle("hidden", !isReport);
  const ugcEl = document.getElementById("view-ugc");
  if (ugcEl) ugcEl.classList.toggle("hidden", !isUgcPage);
  document.getElementById("map-overlay-top")?.classList.toggle("hidden", isPage);
  document.getElementById("map-tools").classList.toggle("hidden", isPage);
  document.getElementById("place-search").classList.toggle("hidden", isPage);
  document.getElementById("legend").classList.toggle("hidden", isPage);

  document.querySelectorAll(".topnav [data-view]").forEach((b) => {
    b.classList.toggle("on", b.dataset.view === view || (districtMode && b.dataset.view === "report"));
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
  if (isUgcPage) {
    clearDistrictOverlay();
    paintFeedbackTable();
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

document.querySelector(".topnav").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-view]");
  if (btn && e.currentTarget.contains(btn)) setView(btn.dataset.view);
});
document.addEventListener("click", (e) => {
  const go = e.target.closest("[data-goto]");
  if (go) {
    gotoPoint(go.dataset.goto);
    return;
  }
  const btn = e.target.closest("[data-jump]");
  if (btn) setView(btn.dataset.jump);
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
document.getElementById("q-hist").addEventListener("input", debounce((e) => {
  qHist = e.target.value.trim();
  render();
}, 120));
const catalogBar = document.getElementById("catalog-bar");
if (catalogBar) {
  catalogBar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-catalog]");
    if (!b) return;
    catalogF = b.dataset.catalog;
    catalogBar.querySelectorAll("[data-catalog]").forEach((x) => x.classList.toggle("on", x === b));
    paintCatalogTable();
  });
}
const catalogQEl = document.getElementById("catalog-q");
if (catalogQEl) {
  catalogQEl.addEventListener("input", debounce((e) => {
    catalogQ = e.target.value.trim();
    paintCatalogTable();
  }, 120));
}

/* —— 地点搜索：定位小区/路段，判断与淹水圈是否重叠 —— */
const placeSuggestEl = document.getElementById("place-suggest");
const placeResultEl = document.getElementById("place-result");
const placeResultModalEl = document.getElementById("place-result-modal");
const placeResultBackdropEl = document.getElementById("place-result-backdrop");
const placeQEl = document.getElementById("place-q");
const placeGoBtn = document.getElementById("place-go");
let placeLayer = null;
let placeTimer = null;
let placeReqId = 0;
let locateMarker = null;

function bindPlaceResultActions() {
  document.getElementById("place-result-close")?.addEventListener("click", () => closePlaceResult());
  document.getElementById("place-clear")?.addEventListener("click", () => closePlaceResult({ clear: true }));
}

function openPlaceResult(html) {
  hidePlaceUi();
  placeResultEl.innerHTML = html;
  placeResultEl.classList.remove("hidden");
  placeResultModalEl.classList.remove("hidden");
  placeResultModalEl.setAttribute("aria-hidden", "false");
  bindPlaceResultActions();
}

function closePlaceResult({ clear = false } = {}) {
  if (clear) clearPlaceLayer();
  placeResultEl.classList.add("hidden");
  placeResultEl.innerHTML = "";
  placeResultModalEl.classList.add("hidden");
  placeResultModalEl.setAttribute("aria-hidden", "true");
}

function showPlaceMessage(title, text) {
  openPlaceResult(`
    <div class="place-result-head">
      <h3>${esc(title)}</h3>
      <button type="button" class="place-result-close" id="place-result-close" aria-label="关闭">×</button>
    </div>
    <p>${esc(text)}</p>`);
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !placeResultModalEl.classList.contains("hidden")) {
    closePlaceResult();
  }
});
placeResultBackdropEl.addEventListener("click", () => closePlaceResult());

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

function parseAmapLoc(location) {
  if (!location) return null;
  const [lng, lat] = String(location).split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function amapItem(source, name, detail, lat, lng) {
  return {
    source,
    name,
    detail,
    lat,
    lng,
    crs: "gcj",
    ref: null,
    pending: !Number.isFinite(lat) || !Number.isFinite(lng)
  };
}

async function fetchAmapJson(path, params) {
  const qs = new URLSearchParams({ city: "昆明", citylimit: "true", ...params });
  const res = await fetch(`/api/amap/${path}?${qs}`);
  if (!res.ok) throw new Error("amap_http_" + res.status);
  const data = await res.json();
  if (data.status !== "1") {
    if (data.infocode === "10001" || /INVALID_USER_KEY|USERKEY/i.test(data.info || "")) {
      throw new Error("amap_key");
    }
    if (data.info === "DAILY_QUERY_OVER_LIMIT") throw new Error("amap_quota");
    return [];
  }
  return data;
}

async function searchAmapPlace(q, { limit = 8 } = {}) {
  const data = await fetchAmapJson("place", {
    keywords: q,
    offset: String(limit),
    extensions: "base"
  });
  return (data.pois || []).map((poi) => {
    const loc = parseAmapLoc(poi.location);
    return amapItem(
      "高德检索",
      poi.name,
      [poi.adname, poi.address].filter(Boolean).join(" · "),
      loc?.lat,
      loc?.lng
    );
  }).filter((it) => !it.pending);
}

async function searchAmapTips(q, { limit = 8 } = {}) {
  const data = await fetchAmapJson("tips", { keywords: q });
  return (data.tips || []).slice(0, limit).map((tip) => {
    const loc = parseAmapLoc(tip.location);
    return amapItem(
      "高德提示",
      tip.name,
      [tip.district, tip.address].filter(Boolean).join(" · "),
      loc?.lat,
      loc?.lng
    );
  });
}

async function resolvePlaceItem(item) {
  if (!item.pending && Number.isFinite(item.lat) && Number.isFinite(item.lng)) return item;
  const hits = await searchAmapPlace(item.name, { limit: 1 });
  return hits[0] || null;
}

function showAmapConfigError() {
  openPlaceResult(`
    <div class="place-result-head">
      <h3>地点检索暂不可用</h3>
      <button type="button" class="place-result-close" id="place-result-close" aria-label="关闭">×</button>
    </div>
    <span class="verdict unknown">未配置高德 Key</span>
    <p>需在服务器 <code>/workspace/kunming-flood-map/.env</code> 写入 <code>AMAP_WEB_KEY=你的Web服务Key</code> 后重启容器。Key 在<a href="https://console.amap.com/dev/key/app" target="_blank" rel="noopener">高德开放平台</a>申请，类型选「Web 服务」。</p>`);
}

function localPlaceHits(q) {
  const needle = q.trim().toLowerCase();
  if (needle.length < 1) return [];
  const out = [];
  EVENTS.forEach((p) => {
    if (p._mergedInto) return;
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

function mergePlaceHits(local, remote) {
  const merged = [];
  const seen = new Set();
  [...local, ...remote].forEach((it) => {
    const latKey = Number.isFinite(it.lat) ? it.lat.toFixed(4) : "?";
    const lngKey = Number.isFinite(it.lng) ? it.lng.toFixed(4) : "?";
    const key = `${it.name}|${latKey}|${lngKey}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(it);
  });
  return merged;
}

function findNearestHits(lat, lng, maxDistM = PLACE_NEAR_SCAN_M, limit = 6) {
  const hits = [];
  EVENTS.forEach((p) => {
    if (p._mergedInto) return;
    const d = haversineM(lat, lng, p._ll[0], p._ll[1]);
    if (d <= maxDistM) {
      hits.push({
        kind: "event",
        level: "scan",
        dist: Math.round(d),
        title: p.name,
        sub: `${EVT_LABEL[p.evt]} · ${KIND_LABEL[p.kind]} · ${p.depth}`,
        point: p
      });
    }
  });
  HIST.forEach((p) => {
    const d = haversineM(lat, lng, p._ll[0], p._ll[1]);
    if (d <= maxDistM) {
      hits.push({
        kind: "hist",
        level: "scan",
        dist: Math.round(d),
        title: p.name,
        sub: `${CAT[p.cat]} · ${p.depth}`,
        point: p
      });
    }
  });
  hits.sort((a, b) => a.dist - b.dist);
  return hits.slice(0, limit);
}

function scoreOverlap(ll) {
  const [lat, lng] = ll;
  const hits = [];
  EVENTS.forEach((p) => {
    if (p._mergedInto) return;
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
  let tip = "已定位到该处；下方列出周边最近积水标点（如有）。不等于绝对安全。";
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

function boundsAroundMeters(lat, lng, radiusM) {
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.cos(lat * Math.PI / 180));
  return L.latLngBounds([lat - dLat, lng - dLng], [lat + dLat, lng + dLng]);
}

function placeFocusPadding() {
  const sz = map.getSize();
  return [
    Math.round(sz.y * 0.26),
    Math.round(sz.x * 0.12),
    Math.round(isMobile() ? sz.y * 0.24 : sz.y * 0.14),
    Math.round(sz.x * 0.12)
  ];
}

function fitPlaceView(ll, overlapHits) {
  const pad = placeFocusPadding();
  const focusBounds = boundsAroundMeters(ll[0], ll[1], PLACE_FOCUS_RADIUS_M);
  const tight = overlapHits.filter((h) => h.level === "hit" || (h.level === "near" && h.dist <= 450));
  if (tight.length) {
    const bounds = L.latLngBounds([ll]);
    tight.slice(0, 4).forEach((h) => bounds.extend(h.point._ll));
    map.flyToBounds(bounds.pad(0.04), { padding: pad, duration: 0.55, maxZoom: 17 });
    return;
  }
  map.flyToBounds(focusBounds, { padding: pad, duration: 0.55, maxZoom: 17 });
}

function focusPlace(item) {
  hidePlaceUi();
  const run = async () => {
    let place = item;
    if (place.pending || !Number.isFinite(place.lat)) {
      placeGoBtn.disabled = true;
      placeGoBtn.textContent = "定位中";
      try {
        place = await resolvePlaceItem(item);
      } catch (e) {
        if (e.message === "amap_key") {
          showAmapConfigError();
          return;
        }
        showPlaceMessage("定位失败", "未能解析该地点坐标，请换更完整的地名重试。");
        return;
      } finally {
        placeGoBtn.disabled = false;
        placeGoBtn.textContent = "查附近";
      }
      if (!place) {
        showPlaceMessage("定位失败", `未能解析「${item.name}」的坐标，请换更完整的地名。`);
        return;
      }
    }
    paintFocusPlace(place);
  };
  run();
}

function paintFocusPlace(item) {
  const ll = item.crs === "wgs" ? toMapLL(item.lat, item.lng, "wgs") : [item.lat, item.lng];
  const scored = scoreOverlap(ll);
  const nearest = scored.hits.length ? [] : findNearestHits(ll[0], ll[1]);
  const visibleHits = scored.hits.length ? scored.hits : nearest;
  ensurePlaceVisible(visibleHits);
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
  fitPlaceView(ll, scored.hits);

  let listHtml;
  if (scored.hits.length) {
    listHtml = `<ul>${scored.hits.map((h) =>
      `<li><strong>${esc(h.title)}</strong> · ${esc(h.sub)} · 约 ${h.dist} m</li>`
    ).join("")}</ul>`;
  } else if (nearest.length) {
    listHtml = `<p>落点本身库内未见积水圈；周边 ${(PLACE_NEAR_SCAN_M / 1000).toFixed(1)} km 内最近标点：</p><ul>${nearest.map((h) =>
      `<li><strong>${esc(h.title)}</strong> · ${esc(h.sub)} · 约 ${h.dist} m</li>`
    ).join("")}</ul>`;
  } else {
    listHtml = `<p>周边 ${Math.round(PLACE_NEAR_SCAN_M / 100) * 100} m 内暂无库内标点；地图已定位到此处，可手动拖动查看更远区域。</p>`;
  }

  openPlaceResult(`
    <div class="place-result-head">
      <h3>${esc(item.name)}</h3>
      <button type="button" class="place-result-close" id="place-result-close" aria-label="关闭">×</button>
    </div>
    <span class="verdict ${scored.verdict}">${esc(scored.label)}</span>
    <p>${esc(scored.tip)}</p>
    <p style="font-size:12px;color:#78716c">${esc(item.source)}${item.detail ? " · " + esc(item.detail) : ""}</p>
    ${listHtml}
    <div class="place-actions">
      <button type="button" id="place-clear">清除定位</button>
      <a href="https://uri.amap.com/marker?position=${ll[1]},${ll[0]}&name=${encodeURIComponent(item.name)}" target="_blank" rel="noopener" style="font-size:12px;align-self:center">高德打开</a>
    </div>`);
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

async function runPlaceSearch(q, { autoFocus = false, useTips = false } = {}) {
  const query = q.trim();
  if (!query) return;
  const req = ++placeReqId;
  placeGoBtn.disabled = true;
  placeGoBtn.textContent = "检索中";
  closePlaceResult();
  try {
    const local = localPlaceHits(query);
    let remote = [];
    try {
      remote = useTips
        ? await searchAmapTips(query)
        : await searchAmapPlace(query);
    } catch (e) {
      if (e.message === "amap_key") {
        if (!local.length) showAmapConfigError();
        else renderSuggest(local);
        return;
      }
    }
    if (req !== placeReqId) return;
    const merged = mergePlaceHits(local, remote);
    if (!merged.length) {
      hidePlaceUi();
      openPlaceResult(`
        <div class="place-result-head">
          <h3>未找到「${esc(query)}」</h3>
          <button type="button" class="place-result-close" id="place-result-close" aria-label="关闭">×</button>
        </div>
        <span class="verdict unknown">暂无定位结果</span>
        <p>可换正式地名或加区县（如「某某小区 官渡」）。</p>`);
      return;
    }
    renderSuggest(merged);
    if (autoFocus) focusPlace(merged.find((it) => !it.pending) || merged[0]);
  } finally {
    if (req === placeReqId) {
      placeGoBtn.disabled = false;
      placeGoBtn.textContent = "查附近";
    }
  }
}

document.getElementById("place-search-form").addEventListener("submit", (e) => {
  e.preventDefault();
  runPlaceSearch(placeQEl.value, { autoFocus: true, useTips: false });
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
  placeTimer = setTimeout(() => runPlaceSearch(q, { autoFocus: false, useTips: true }), 350);
});
document.addEventListener("click", (e) => {
  if (!document.getElementById("place-search").contains(e.target)) hidePlaceUi();
});

function countVisibleEvtMatches(q) {
  if (!q) return 1;
  const needle = q.toLowerCase();
  return EVENTS.filter((p) => {
    if (evtF !== "all" && p.evt !== evtF) return false;
    if (kindF !== "all" && p.kind !== kindF) return false;
    return (p.name + p.district + p.note + p.source + p.duration + p.depth).toLowerCase().includes(needle);
  }).length;
}

function locateDestination(q) {
  const query = String(q || "").trim();
  if (query.length < 2) return;
  placeQEl.value = query;
  if (isMobile()) setSheetOpen(false);
  runPlaceSearch(query, { autoFocus: true, useTips: false });
}

document.getElementById("q-evt").addEventListener("input", debounce((e) => {
  qEvt = e.target.value.trim();
  render();
  if (qEvt.length >= 2 && countVisibleEvtMatches(qEvt) === 0) {
    locateDestination(qEvt);
  }
}, 400));
document.getElementById("q-evt").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    locateDestination(e.target.value);
  }
});

/* —— 启动 —— */
window.__flood = { map, EVENTS, HIST }; /* 调试句柄 */
loadDistrictBounds().then(() => {
  setView(viewFromHash() || "all", { fit: false, push: false });
});
