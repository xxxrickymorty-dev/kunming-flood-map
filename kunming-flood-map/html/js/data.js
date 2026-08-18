/* 昆明积水地图 · 点位数据（唯一事实源）
 * 维护方式：改点位只改这里。hist 中带 ref 的点坐标引用 events 同名点，避免两处维护漂移。
 * morph 形态分类：road 主干道低洼/交叉口 | tunnel 下穿/立交底层 | culvert 涵洞/桥洞 | slow 缓行/浅积
 */
window.FLOOD_DATA = {
  events: [
    { id: "E1", evt: "0818", kind: "closed", morph: "tunnel", n: 1, district: "官渡", name: "贵昆路牛街庄隧道", depth: "约 30 cm", duration: "09:20–17:00 仍断交（可见 ≥8 小时）", note: "降雨主时段 17 日 23 时–18 日 6 时。金马凉亭站 24h 雨量 158.1 mm。", source: "昆明交警（本地宝）", lat: 25.0128, lng: 102.7668 },
    { id: "E2", evt: "0818", kind: "closed", morph: "tunnel", n: 2, district: "官渡", name: "民航路长润街下穿", depth: "30→50 cm", duration: "09:20 约 30 cm；11:00–17:00 约 50 cm 仍断交", note: "下穿持续恶化型。", source: "昆明交警（本地宝）", lat: 25.0221, lng: 102.7362 },
    { id: "E3", evt: "0818", kind: "closed", morph: "road", n: 3, district: "官渡", name: "国贸路 · 金汁路至官渡广场", depth: "40→30 cm", duration: "09:20–13:00 约 40 cm；17:00 约 30 cm 仍断交", note: "7.16 曾为中度点，8.18 再次断交。", source: "昆明交警（本地宝）", lat: 25.0155, lng: 102.74 },
    { id: "E4", evt: "0818", kind: "closed", morph: "tunnel", n: 4, district: "官渡", name: "春城路日新立交转盘", depth: "50→40 cm", duration: "10:15 约 50 cm；13:00 约 40 cm；17:00 退出（约 4–7 小时）", note: "当日最深之一。", source: "昆明交警 / 澎湃", lat: 25.00324, lng: 102.73207 },
    { id: "E5", evt: "0818", kind: "closed", morph: "tunnel", n: 5, district: "官渡", name: "二环东路下层 · 南屏苑", depth: "约 40 cm", duration: "09:20–13:00 断交；17:00 消退正清淤", note: "东二环下层。", source: "昆明交警（本地宝）", lat: 25.03175, lng: 102.74328 },
    { id: "E6", evt: "0818", kind: "closed", morph: "tunnel", n: 6, district: "官渡", name: "二环东路石虎关立交底层", depth: "约 40 cm", duration: "09:20–13:00 断交；17:00 北向南主道消退清淤", note: "", source: "昆明交警（本地宝）", lat: 25.02015, lng: 102.74378 },
    { id: "E7", evt: "0818", kind: "closed", morph: "road", n: 7, district: "官渡", name: "民航路官渡广场", depth: "30→20 cm", duration: "10:15 约 30 cm；13:00–17:00 约 20 cm 仍断交", note: "", source: "昆明交警 / 澎湃", lat: 25.01165, lng: 102.74392 },
    { id: "E8", evt: "0818", kind: "closed", morph: "road", n: 8, district: "官渡", name: "东风东路与曙光路交叉口", depth: "40→20 cm", duration: "09:20–11:00 断交；13:00 缓行约 20 cm", note: "昙华灯具市场附近。", source: "昆明交警（本地宝）", lat: 25.0408, lng: 102.7356 },
    { id: "E9", evt: "0818", kind: "closed", morph: "tunnel", n: 9, district: "官渡", name: "二环东路下层 · 锦都酒店", depth: "40→20 cm", duration: "10:15–11:00 断交；13:00 缓行约 20 cm", note: "", source: "昆明交警 / 澎湃", lat: 25.0278, lng: 102.7408 },
    { id: "E10", evt: "0818", kind: "closed", morph: "tunnel", n: 10, district: "官渡", name: "东郊路菊华立交下层", depth: "约 30 cm", duration: "09:20–11:00 断交；13:00 退出", note: "", source: "昆明交警（本地宝）", lat: 25.0436, lng: 102.7532 },
    { id: "E11", evt: "0818", kind: "closed", morph: "road", n: 11, district: "官渡", name: "彩云北路与昌宏路交叉口", depth: "约 30 cm", duration: "09:20–10:15 断交；约 11:00 前退出", note: "", source: "昆明交警（本地宝）", lat: 24.99473, lng: 102.76368 },
    { id: "E12", evt: "0818", kind: "closed", morph: "road", n: 12, district: "官渡", name: "彩云北路与经桥路辅道", depth: "约 30 cm", duration: "早间断交；约 11:00 前退出", note: "", source: "昆明交警（本地宝）", lat: 24.9916, lng: 102.7554 },
    { id: "E13", evt: "0818", kind: "closed", morph: "road", n: 13, district: "官渡", name: "昌宏路与雨龙路交叉口", depth: "约 30 cm", duration: "09:20–10:15 断交；11:00 退出", note: "", source: "昆明交警（本地宝）", lat: 24.9898, lng: 102.7612 },
    { id: "E14", evt: "0818", kind: "closed", morph: "tunnel", n: 14, district: "官渡", name: "二环东路下层 · 昙华寺", depth: "30→20 cm", duration: "10:15 在名单；13:00 退出", note: "", source: "昆明交警 / 澎湃", lat: 25.0472, lng: 102.739 },
    { id: "E15", evt: "0818", kind: "closed", morph: "road", n: 15, district: "经开", name: "经东路锅炉厂路段", depth: "约 30 cm", duration: "早报断交；10:15 官渡主名单未再列", note: "与交警分时快照不完全同步。", source: "本地宝早报", lat: 25.0042, lng: 102.7724 },
    { id: "E16", evt: "0818", kind: "closed", morph: "culvert", n: 16, district: "经开", name: "河岸村涵洞", depth: "约 30 cm", duration: "早报断交；清退时刻不详", note: "", source: "本地宝早报", lat: 25.0062, lng: 102.7816 },
    { id: "E17", evt: "0818", kind: "closed", morph: "culvert", n: 17, district: "经开", name: "贵昆路金马村涵洞", depth: "约 40 cm", duration: "早报断交；清退时刻不详", note: "", source: "本地宝早报", lat: 25.0264, lng: 102.7558 },
    { id: "E18", evt: "0818", kind: "closed", morph: "culvert", n: 18, district: "经开", name: "云大西路昆玉桥洞", depth: "约 30 cm", duration: "早报断交；清退时刻不详", note: "", source: "本地宝早报", lat: 24.9812, lng: 102.7838 },
    { id: "E19", evt: "0818", kind: "closed", morph: "road", n: 19, district: "盘龙", name: "景润路 · 花之城路段", depth: "约 30 cm", duration: "早报有；后续主名单以官渡为主", note: "", source: "本地宝早报", lat: 25.0518, lng: 102.7784 },
    { id: "E20", evt: "0818", kind: "slow", morph: "slow", n: 20, district: "官渡", name: "珥季路大澡堂段", depth: "约 15 cm", duration: "09:20–13:00 缓行；17:00 退出", note: "电驴不建议涉水。", source: "昆明交警（本地宝）", lat: 24.9885, lng: 102.7488 },
    { id: "E21", evt: "0818", kind: "slow", morph: "slow", n: 21, district: "盘龙", name: "人民东路与中营路交叉口", depth: "15–20 cm", duration: "早间缓行；13:00 退出", note: "", source: "昆明交警（本地宝）", lat: 25.0516, lng: 102.7438 },
    { id: "E22", evt: "0818", kind: "slow", morph: "slow", n: 22, district: "官渡", name: "云秀路与珥瑞路交叉口", depth: "约 20 cm", duration: "09:20 缓行名单有", note: "", source: "昆明交警（本地宝）", lat: 24.9992, lng: 102.7286 },
    { id: "E23", evt: "0818", kind: "ctrl", morph: "road", n: 23, district: "官渡", name: "金瓦路 / 虹苏路 / 照青路 / 虹桥立交 / 大树营（机场向）", depth: "未公开", duration: "机场 07:17 提示管制", note: "长水机场出城走廊；行政区属官渡（原「机场向」已并入）。建议地铁 6 号线或绕城。", source: "长水机场（澎湃）", lat: 25.048, lng: 102.785 },

    { id: "J1", evt: "0716", kind: "closed", morph: "road", n: "7", district: "西山", name: "前卫西路与广福路交叉口（十一家具城）", depth: ">50→25 cm", duration: "约 01:00 起淹；08:00 仍在处置、已降至 25 cm（至少约 7 小时）", note: "重度曾断交；前卫雨量站 3 小时 80.9 mm。十一家具城即奥宸财富广场（广福路×前卫西路，省公安厅旁），用户确认该路口大雨必淹。", source: "昆水管网 / 昆明信息港", lat: 24.9866, lng: 102.6893 },
    { id: "J2", evt: "0716", kind: "closed", morph: "tunnel", n: "7", district: "官渡", name: "二环东路 · 昆河铁路下穿", depth: ">50 cm", duration: "约 01:00 起；08:00 多数点已处置完毕", note: "重度 6 处之一。", source: "昆水管网 / 昆明信息港", lat: 25.0355, lng: 102.7455 },
    { id: "J3", evt: "0716", kind: "closed", morph: "tunnel", n: "7", district: "官渡", name: "二环东路 · 金马立交至大树营", depth: ">50 cm", duration: "同场；08:00 基本处置完毕", note: "", source: "昆水管网 / 昆明信息港", lat: 25.038, lng: 102.744 },
    { id: "J4", evt: "0716", kind: "closed", morph: "road", n: "7", district: "五华", name: "滇缅大道 · 海源中路至黄土坡立交西口", depth: ">50 cm", duration: "同场；08:00 基本处置完毕", note: "", source: "昆水管网 / 昆明信息港", lat: 25.0665, lng: 102.668 },
    { id: "J5", evt: "0716", kind: "closed", morph: "road", n: "7", district: "五华", name: "海源中路 · 滇缅大道至人民西路", depth: ">50 cm", duration: "同场；08:00 基本处置完毕", note: "", source: "昆水管网 / 昆明信息港", lat: 25.055, lng: 102.675 },
    { id: "J6", evt: "0716", kind: "closed", morph: "road", n: "7", district: "西山", name: "希望路与广福路交叉口", depth: ">50 cm", duration: "同场；08:00 基本处置完毕", note: "西山前卫、大商汇南；新希望观澜汇/希望汇门口。路口即广福路上的华晨路口一带。", source: "昆水管网 / 昆明信息港", lat: 24.9795, lng: 102.7125 },
    { id: "J7", evt: "0716", kind: "mid", morph: "road", n: "7", district: "官渡", name: "广福路 · 云秀路至昌宏路", depth: "30–50 cm", duration: "同场；08:00 基本处置完毕", note: "中度未断交。", source: "昆水管网 / 昆明信息港", lat: 24.991, lng: 102.748 },
    { id: "J8", evt: "0716", kind: "mid", morph: "road", n: "7", district: "官渡", name: "昌宏西路林家围段", depth: "30–50 cm", duration: "同场；08:00 基本处置完毕", note: "", source: "昆水管网 / 昆明信息港", lat: 24.996, lng: 102.752 },
    { id: "J9", evt: "0716", kind: "mid", morph: "road", n: "7", district: "官渡", name: "雨龙路 · 米兰春天", depth: "30–50 cm", duration: "同场；08:00 基本处置完毕", note: "8.18 消防仍赴该片排涝。", source: "昆水管网 / 昆明信息港", lat: 24.988, lng: 102.758 },
    { id: "J10", evt: "0716", kind: "mid", morph: "road", n: "7", district: "西山", name: "华昌路与采莲路交叉口", depth: "30–50 cm", duration: "同场；08:00 基本处置完毕", note: "永昌片（环城南路南、华昌路侧）路口；采莲河沿线低洼。", source: "昆水管网 / 昆明信息港", lat: 25.0156, lng: 102.7049 },
    { id: "J11", evt: "0716", kind: "mid", morph: "road", n: "7", district: "官渡", name: "国贸路与金汁路交叉口", depth: "30–50 cm", duration: "同场；08:00 基本处置完毕", note: "8.18 再次断交。", source: "昆水管网 / 昆明信息港", lat: 25.0164, lng: 102.7378 },

    { id: "A1", evt: "0802", kind: "ctrl", morph: "road", n: "8", district: "呈贡", name: "金桂街靠环湖东路段", depth: "未公开", duration: "凌晨降雨起；连夜排涝后称运行平稳", note: "临时交通管制。", source: "昆明日报", lat: 24.9015, lng: 102.7915 },
    { id: "A2", evt: "0802", kind: "ctrl", morph: "road", n: "8", district: "呈贡", name: "兴呈路小古城段", depth: "未公开", duration: "同场", note: "积水影响出行。", source: "昆明日报", lat: 24.8903, lng: 102.7957 },
    { id: "A3", evt: "0802", kind: "ctrl", morph: "culvert", n: "8", district: "呈贡", name: "昆玉路下穿涵洞", depth: "未公开", duration: "同场", note: "临时交通管制；下穿高风险。", source: "昆明日报", lat: 24.912, lng: 102.812 },
    { id: "A4", evt: "0802", kind: "ctrl", morph: "road", n: "8", district: "官渡", name: "官渡 / 小板桥 / 矣六部分道路", depth: "未公开", duration: "持续性暴雨；无逐点清退时刻", note: "防汛Ⅳ级；矣六另有住户被困转移。", source: "昆明日报", lat: 24.96, lng: 102.78 }
  ],

  /* 常年/用户图层。带 ref 的点坐标取自对应事件点（同一物理位置，勿重复维护坐标）。 */
  hist: [
    { n: "H1", cat: "tunnel", district: "官渡", name: "牛街庄隧道", depth: "历史最深约 2 m+", note: "下穿贵昆铁路。东白沙河倒灌，逢雨高风险。", ref: "E1", r: 220 },
    { n: "H2", cat: "tunnel", district: "官渡", name: "民航路长润街下穿", depth: "高频易淹", note: "下穿隧道，断交常发。", ref: "E2", r: 180 },
    { n: "H3", cat: "tunnel", district: "官渡", name: "菊华立交下层", depth: "高频易淹", note: "东三环桥下低洼。", ref: "E10", r: 200 },
    { n: "H4", cat: "tunnel", district: "官渡", name: "石虎关立交底层", depth: "高频易淹", note: "东二环桥下。", ref: "E6", r: 200 },
    { n: "H5", cat: "tunnel", district: "官渡", name: "日新立交转盘", depth: "高频易淹", note: "春城路转盘，今年再次约 50 cm。", ref: "E4", r: 200 },
    { n: "H6", cat: "road", district: "官渡", name: "二环东路下层走廊", depth: "30–50 cm 常发", note: "南屏苑、锦都酒店、昙华寺辅道。", lat: 25.033, lng: 102.742, r: 420 },
    { n: "H7", cat: "road", district: "官渡", name: "二环东路 · 锦都酒店段", depth: "常发", note: "石虎关至南屏苑之间下层。", ref: "E9", r: 150 },
    { n: "H8", cat: "road", district: "官渡", name: "二环东路 · 昙华寺辅道", depth: "常发", note: "昙华寺一侧二环下层。", ref: "E14", r: 160 },
    { n: "H9", cat: "road", district: "官渡", name: "国贸路 · 金汁路至官渡广场", depth: "30–50 cm 常发", note: "关上低洼主干道。", ref: "E3", r: 320 },
    { n: "H10", cat: "road", district: "官渡", name: "春城路低洼段", depth: "常发", note: "含日新立交一带。", lat: 25.0088, lng: 102.7225, r: 280 },
    { n: "H11", cat: "road", district: "官渡", name: "东风东路 · 曙光路口", depth: "30–50 cm 常发", note: "昙华灯具市场交叉口。", ref: "E8", r: 160 },
    { n: "H12", cat: "road", district: "西山", name: "前卫西路 · 广福路口一带", depth: "2026-07-16 重度", note: "十一家具城段；调研确认上个月淹过。", ref: "J1", r: 280 },
    { n: "H13", cat: "river", district: "盘龙", name: "金汁河沿线 · 东华小区", depth: "楼栋低洼", note: "河道沿线老旧小区。", lat: 25.0495, lng: 102.7298, r: 240 },
    { n: "H14", cat: "river", district: "盘龙", name: "金汁河沿线 · 新迎小区", depth: "楼栋低洼", note: "部分低洼楼栋易进水。", lat: 25.0548, lng: 102.7365, r: 260 },
    { n: "H15", cat: "river", district: "西山", name: "豆腐营（海埂路一带）", depth: "老社区", note: "环城南路南侧、海埂路/云兴路一带老社区，采莲河沿线低洼。", lat: 25.0174, lng: 102.7072, r: 250 },
    { n: "H16", cat: "river", district: "盘龙", name: "盘龙江沿岸 · 凤凰村", depth: "老社区", note: "盘龙江东、白塔一带。", lat: 25.0412, lng: 102.7215, r: 250 },
    { n: "H17", cat: "river", district: "西山", name: "永昌片区", depth: "历史最深 1.1 m", note: "环城南路816号一带（五华体育馆东、云纺西）。地势低洼 + 采莲河行洪不足；与用户补点永昌小区同址。", lat: 25.0172, lng: 102.7056, r: 380 },
    { n: "H18", cat: "new", district: "官渡", name: "珥季路大澡堂段", depth: "城郊结合部", note: "短时暴雨易积。", ref: "E20", r: 180 },
    { n: "H19", cat: "new", district: "官渡", name: "彩云北路 × 广福路 / 昌宏路", depth: "交叉口低洼", note: "彩云北路南段交叉带。", lat: 24.991, lng: 102.748, r: 380 },
    { n: "H20", cat: "new", district: "安宁", name: "太平新城 · 万辉星城", depth: "车辆被困纪录", note: "在安宁，不在主城东边。", lat: 24.9512, lng: 102.5455, r: 350 },
    { n: "H21", cat: "new", district: "安宁", name: "玉龙湾隧道", depth: "车辆被困纪录", note: "安宁玉龙湾方向。", lat: 24.965, lng: 102.528, r: 220 },
    /* —— 用户反馈补点（不写反馈人昵称）—— */
    { n: "H22", cat: "ugc", district: "五华高新", name: "金泰国际一带", depth: "用户：非常容易淹", note: "楼盘在黄土坡立交旁滇缅大道×西二环。官方雨污分流改造名单含金泰国际；同片滇缅大道 2026-07-16 曾 >50cm 断交。", lat: 25.0634, lng: 102.6734, r: 280 },
    { n: "H23", cat: "ugc", district: "五华高新", name: "戛纳小镇一带", depth: "用户：非常容易淹", note: "海源中路 1629 号一带。高新西区雨污分流改造名单含戛纳小镇；海源北路–海源中路有淹水点改造工程。", lat: 25.0624, lng: 102.664, r: 280 },
    { n: "H24", cat: "ugc", district: "五华高新", name: "海源北路", depth: "用户：易淹", note: "公开报道多次写海源北路至海源中路雨季淹水及下穿昆石铁路排水改造。", lat: 25.0749, lng: 102.6543, r: 320 },
    { n: "H25", cat: "ugc", district: "五华高新", name: "上高架路口（黄土坡立交向）", depth: "用户：非常容易淹", note: "西边上高架路口。按黄土坡立交/滇缅大道上桥一带落点；具体岔口名待再确认。", lat: 25.068, lng: 102.667, r: 220 },
    { n: "H26", cat: "ugc", district: "官渡", name: "万象城 · 环城南路一带", depth: "用户：路面积水深（配图）", note: "公开笔记配图可见主干道深积水、消防车涉水；落点取官渡环城南路万象城商圈（地铁岔街站一带）。不等于商场室内进水。", lat: 25.0292, lng: 102.7337, r: 320 },
    { n: "H27", cat: "ugc", district: "西山", name: "永昌小区（环城南路816号）", depth: "用户：小腿深，整片爱淹", note: "环城南路南侧、五华体育馆东、华昌路—云兴路一带；云纺商圈对面。与历史永昌片区、华昌×采莲同片低洼。", lat: 25.0172, lng: 102.7056, r: 280 },
    { n: "H28", cat: "ugc", district: "五华", name: "龙泉路 · 红云 / 高教小区一带", depth: "用户：深水路况照片；历史断交", note: "龙泉路红云片为长虫山山洪下泄区；龙泉路高教小区/昆八中段有断交通报、常年淹水改造记录。坐标取龙泉路昆八中段近似。", lat: 25.0944, lng: 102.7199, r: 380 }
  ]
};
