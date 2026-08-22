#!/usr/bin/env node
/* 扫描 data.js 点位：昆明范围 + 滇池水面框。底图为高德 GCJ-02。 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "html/js/data.js");
const src = fs.readFileSync(file, "utf8");

const KM = { lat: [24.7, 25.25], lng: [102.45, 103.05] };
/* 收紧水面框：官渡古镇 Y1 24.9557,102.7585 不该报警；滇池里的 24.921,102.658 必须报警。 */
const DIANCHI = { lat: [24.75, 24.96], lng: [102.625, 102.72] };

const rows = [];
const re = /\{\s*id:\s*"([^"]+)"[\s\S]*?name:\s*"([^"]+)"[\s\S]*?lat:\s*([0-9.]+)[\s\S]*?lng:\s*([0-9.]+)/g;
let m;
while ((m = re.exec(src))) {
  rows.push({ id: m[1], name: m[2], lat: Number(m[3]), lng: Number(m[4]), layer: "event" });
}
const hr = /\{\s*n:\s*"(H\d+)"[\s\S]*?name:\s*"([^"]+)"[\s\S]*?(?:lat:\s*([0-9.]+)[\s\S]*?lng:\s*([0-9.]+)|ref:\s*"([^"]+)")/g;
while ((m = hr.exec(src))) {
  if (m[5]) continue;
  rows.push({ id: m[1], name: m[2], lat: Number(m[3]), lng: Number(m[4]), layer: "hist" });
}

function inBox(p, b) {
  return p.lat >= b.lat[0] && p.lat <= b.lat[1] && p.lng >= b.lng[0] && p.lng <= b.lng[1];
}

let warn = 0;
for (const p of rows) {
  const amap = `https://uri.amap.com/marker?position=${p.lng},${p.lat}&name=${encodeURIComponent(p.name)}`;
  if (!inBox(p, KM)) {
    warn += 1;
    console.error(`OUT ${p.layer} ${p.id} ${p.name} ${p.lat},${p.lng} ${amap}`);
  } else if (inBox(p, DIANCHI)) {
    warn += 1;
    console.error(`LAKE? ${p.layer} ${p.id} ${p.name} ${p.lat},${p.lng} ${amap}`);
  }
}
if (inBox({ lat: 24.9557, lng: 102.7585 }, DIANCHI)) {
  warn += 1;
  console.error("LAKE? false-positive: 官渡古镇 Y1 24.9557,102.7585 should be outside Dianchi box");
}
if (!inBox({ lat: 24.921, lng: 102.658 }, DIANCHI)) {
  warn += 1;
  console.error("LAKE? miss: 24.921,102.658 (old 混团村-in-lake) should still flag");
}
console.log(`checked ${rows.length} points with coords; warnings ${warn}`);
process.exit(warn ? 1 : 0);
