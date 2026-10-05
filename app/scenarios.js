// 預覽情境：每個情境產生路線、車速、級位、DataMap、道岔與乘客，再轉成逐 tick 的資料交給模擬執行緒。
import { Route, placeConsist, branchSegs, switchDef, frogPoint, GAUGE_MM } from "./route.js";

const T = (tc, ja, en) => ({ tc, ja, en });

// 每個參數：key、標籤、範圍、預設值、單位；choice 為下拉選單
export const SCENARIOS = [
  {
    id: "straight", name: T("直線晃動", "直線動揺", "Straight track"),
    desc: T("固定車速通過直線，可在中途改變 DataMap 倍率", "一定速度で直線を走行、途中でDataMap倍率を変更できます", "Constant speed on straight track; DataMap scale can change midway"),
    params: [
      { key: "speed", label: T("車速", "速度", "Speed"), min: 5, max: 160, step: 1, value: 90, unit: "km/h" },
      { key: "duration", label: T("長度", "長さ", "Duration"), min: 10, max: 90, step: 1, value: 24, unit: "s" },
      { key: "adj0", label: T("DataMap 增減（前半）", "DataMap増減（前半）", "DataMap adjust (first half)"), min: -1, max: 4, step: 0.1, value: 0, unit: "" },
      { key: "adj1", label: T("DataMap 增減（後半）", "DataMap増減（後半）", "DataMap adjust (second half)"), min: -1, max: 4, step: 0.1, value: 0, unit: "" },
    ],
  },
  {
    id: "curve", name: T("彎道／S 彎", "曲線／S字", "Curve / S-curve"),
    desc: T("緩和曲線＋圓曲線＋超高；車速超過均衡速度時產生超高不足", "緩和曲線＋円曲線＋カント；均衡速度を超えるとカント不足", "Transition + circular curve with cant; cant deficiency above balancing speed"),
    params: [
      { key: "speed", label: T("車速", "速度", "Speed"), min: 10, max: 160, step: 1, value: 90, unit: "km/h" },
      { key: "radius", label: T("半徑", "半径", "Radius"), min: 80, max: 2500, step: 10, value: 400, unit: "m" },
      { key: "cant", label: T("超高", "カント", "Cant"), min: 0, max: 110, step: 1, value: 80, unit: "mm" },
      { key: "trans", label: T("緩和曲線長", "緩和曲線長", "Transition length"), min: 0, max: 200, step: 5, value: 60, unit: "m" },
      { key: "arc", label: T("圓曲線長", "円曲線長", "Circular length"), min: 10, max: 800, step: 10, value: 180, unit: "m" },
      { key: "dir", label: T("方向", "方向", "Direction"), choice: [[1, T("左彎", "左カーブ", "Left")], [-1, T("右彎", "右カーブ", "Right")]], value: 1 },
      { key: "reverse", label: T("反向彎（S 形）", "反向曲線（S字）", "Reverse curve (S)"), choice: [[0, T("否", "なし", "No")], [1, T("是", "あり", "Yes")]], value: 1 },
      { key: "tangent", label: T("兩彎間直線", "曲線間直線", "Tangent between"), min: 0, max: 200, step: 5, value: 20, unit: "m" },
    ],
  },
  {
    id: "turnout", name: T("道岔", "分岐器", "Turnout"),
    desc: T("通過尖軌與轍叉；可選直進或分歧側", "トングレールとクロッシングを通過；直進か分岐側を選択", "Pass the switch toe and frog, straight or diverging"),
    params: [
      { key: "speed", label: T("車速", "速度", "Speed"), min: 5, max: 120, step: 1, value: 25, unit: "km/h" },
      { key: "path", label: T("進路", "進路", "Route"), choice: [[1, T("分歧側", "分岐側", "Diverging")], [0, T("直進", "直進", "Straight")]], value: 1 },
      { key: "side", label: T("分歧方向", "分岐方向", "Diverging side"), choice: [[1, T("往左", "左へ", "Left")], [-1, T("往右", "右へ", "Right")]], value: 1 },
      { key: "radius", label: T("分歧半徑", "分岐半径", "Diverging radius"), min: 100, max: 1000, step: 10, value: 180, unit: "m" },
      { key: "lead", label: T("道岔長", "分岐器長", "Turnout length"), min: 15, max: 60, step: 1, value: 30, unit: "m" },
    ],
  },
  {
    id: "stop", name: T("制動停車", "制動・停車", "Braking & stop"),
    desc: T("以指定級位減速到停車，觀察急制動與停車衝動", "指定ノッチで停車まで減速、急制動と停止衝動を確認", "Brake to a stop at the chosen notch; emergency and stop shock"),
    params: [
      { key: "speed", label: T("初速", "初速", "Initial speed"), min: 10, max: 130, step: 1, value: 60, unit: "km/h" },
      { key: "notch", label: T("制動級位", "ブレーキノッチ", "Brake notch"), choice: [[1, T("B1", "B1", "B1")], [2, T("B2", "B2", "B2")], [3, T("B3", "B3", "B3")], [4, T("B4", "B4", "B4")], [5, T("B5", "B5", "B5")], [6, T("B6", "B6", "B6")], [7, T("B7", "B7", "B7")], [8, T("EB", "EB", "EB")]], value: 7 },
      { key: "decel", label: T("B7 減速度", "B7減速度", "B7 deceleration"), min: 2.0, max: 5.0, step: 0.1, value: 3.6, unit: "km/h/s" },
    ],
  },
  {
    id: "load", name: T("乘客上下車", "乗客の乗降", "Passengers"),
    desc: T("停在月台：乘客從一側上車、走到另一側，再有一半下車", "ホームに停車：片側から乗車、反対側へ移動、半数が降車", "Stopped at a platform: board from one side, cross over, half alight"),
    params: [
      { key: "count", label: T("人數", "人数", "Passengers"), min: 1, max: 16, step: 1, value: 6, unit: "" },
      { key: "side", label: T("上車側", "乗車側", "Boarding side"), choice: [[1, T("左側", "左側", "Left")], [-1, T("右側", "右側", "Right")]], value: 1 },
      { key: "npc", label: T("身分", "種別", "Type"), choice: [[0, T("玩家", "プレイヤー", "Players")], [1, T("NPC", "NPC", "NPCs")]], value: 0 },
    ],
  },
];

export function defaultParams(id) {
  const sc = SCENARIOS.find((s) => s.id === id);
  const p = {};
  for (const q of sc.params) p[q.key] = q.value;
  return p;
}

// ---------------------------------------------------------------- 情境 → 路線與時間函式
const BRAKE_FRACTION = [0, 0.15, 0.29, 0.43, 0.57, 0.71, 0.86, 1.0, 1.25];   // 各級位相對 B7 的減速度

export function buildScenario(id, P, cars) {
  const consistLen = cars.length ? cars[cars.length - 1].offset + cars[0].half * 2 : 20;
  const start = consistLen + 10;         // 第一節車中心的起點（整列車都在路線上）
  const lead = start + 50;               // 曲線起點／尖軌的位置：起步後約 50 m
  const out = { id, switches: [], markers: [], platform: null, extraRoutes: [], ents: null };
  if (id === "straight") {
    const v = P.speed;
    out.duration = P.duration;
    out.route = new Route([[v / 3.6 * P.duration + consistLen + 200, 0, 0, 0, 0]]);
    out.sStart = consistLen + 20;
    out.speed = () => v;
    out.notch = () => 0;
    out.adjust = (t) => (t < P.duration / 2 ? P.adj0 : P.adj1);
    if (P.adj0 !== P.adj1) out.markers.push({ t: P.duration / 2, label: "DataMap" });
  } else if (id === "curve") {
    const k = P.dir / P.radius;
    const segs = [[lead, 0, 0, 0, 0]];
    const curve = (kk) => {
      if (P.trans > 0) segs.push([P.trans, 0, kk, 0, P.cant]);
      segs.push([P.arc, kk, kk, P.cant, P.cant]);
      if (P.trans > 0) segs.push([P.trans, kk, 0, P.cant, 0]);
    };
    curve(k);
    const marks = [[lead, "in"], [lead + 2 * P.trans + P.arc, "out"]];
    if (P.reverse) {
      segs.push([Math.max(P.tangent, 0.05), 0, 0, 0, 0]);
      const s2 = lead + 2 * P.trans + P.arc + P.tangent;
      curve(-k);
      marks.push([s2 + 2 * P.trans + P.arc, "out"]);
    }
    const total = segs.reduce((a, s) => a + s[0], 0);
    segs.push([consistLen + 400, 0, 0, 0, 0]);
    out.route = new Route(segs);
    out.sStart = start;
    const v = P.speed;
    out.duration = Math.min(240, (total - start + consistLen) / (v / 3.6) + 10);
    out.speed = () => v;
    out.notch = () => 0;
    out.adjust = () => 0;
    out.curveMarks = marks;
  } else if (id === "turnout") {
    const toe = lead;
    const main = new Route([[toe + P.lead * 2 + consistLen + 300, 0, 0, 0, 0]]);
    const [tx, tz] = main.pos(toe);
    const branch = new Route(branchSegs(P.side, P.radius, P.lead, consistLen + 300), tx, tz, main.yaw(toe));
    const sw = switchDef(main, toe, branch, P.side, P.lead);
    out.switches = [sw];
    out.frogS = frogPoint(sw, toe, P.lead);
    out.toeS = toe;
    out.route = P.path ? new Route([[toe, 0, 0, 0, 0]].concat(branchSegs(P.side, P.radius, P.lead, consistLen + 300))) : main;
    out.extraRoutes = [P.path ? main : branch];
    out.sStart = start;
    const v = P.speed;
    out.duration = Math.min(240, (toe + P.lead + consistLen + 10 - start) / (v / 3.6) + 6);
    out.speed = () => v;
    out.notch = () => 0;
    out.adjust = () => 0;
  } else if (id === "stop") {
    const v0 = P.speed / 3.6;
    const a = (P.decel / 3.6) * BRAKE_FRACTION[P.notch];
    const tb = 3.0, onset = 0.6;
    // 減速度在 0.6 秒內建立；求停車時刻
    let tStop = tb, vv = v0;
    while (vv > 0 && tStop < 300) { const acc = a * Math.min(1, (tStop - tb) / onset); vv -= acc * 0.005; tStop += 0.005; }
    out.duration = tStop + 8;
    const len = v0 * out.duration + consistLen + 200;
    out.route = new Route([[len, 0, 0, 0, 0]]);
    out.sStart = consistLen + 20;
    out.speed = (t) => {
      if (t < tb) return P.speed;
      let vv = v0, tt = tb;
      // 解析：先 0.6 秒線性建立，再等減速
      const t1 = Math.min(t, tb + onset);
      vv -= a * (t1 - tb) ** 2 / (2 * onset);
      if (t > tb + onset) vv -= a * (t - tb - onset);
      return Math.max(0, vv) * 3.6;
    };
    out.notch = (t) => (t < tb ? 0 : -P.notch);
    out.adjust = () => 0;
    out.markers.push({ t: tb, label: P.notch >= 8 ? "EB" : "B" + P.notch }, { t: tStop, label: "STOP" });
  } else if (id === "load") {
    out.duration = 34;
    out.route = new Route([[consistLen + 200, 0, 0, 0, 0]]);
    out.sStart = consistLen + 20;
    out.speed = () => 0;
    out.notch = () => -7;
    out.adjust = () => 0;
    out.platform = { side: P.side, s0: 0, s1: consistLen + 60 };
    out.passengers = makePassengers(P, cars[0]);
    out.markers.push({ t: 2, label: T("上車", "乗車", "Board") }, { t: 14, label: T("換邊", "移動", "Cross") }, { t: 24, label: T("下車", "降車", "Alight") });
  }
  return out;
}

// 乘客（第一節車）：在月台排隊 → 依序從車門上車站到車門旁 → 走到另一側 → 一半從原車門下車
function makePassengers(P, car) {
  const s = P.side, n = P.count;
  const doors = [car.half * 0.5, -car.half * 0.5];
  const people = [];
  for (let i = 0; i < n; i++) {
    const d = doors[i % 2], col = Math.floor(i / 2);
    const wait = [s * (2.6 + 0.7 * Math.floor(col / 2)), d + ((col % 2) ? 0.9 : -0.9)];
    const spot = [s * (0.55 + 0.35 * (col % 2)), d + (Math.floor(col / 2) - 1) * 0.9];
    const t0 = 2 + i * 0.8;
    const wps = [[0, wait], [t0, [s * 2.0, d]], [t0, [s * 0.9, d]], [t0, spot]];
    wps.push([14 + i * 0.3, [-spot[0], spot[1]]]);
    const alight = i % 2 === 0;
    if (alight) wps.push([24 + i * 0.4, [s * 0.9, d]], [24 + i * 0.4, [s * 2.0, d]], [24 + i * 0.4, [s * 3.2, d + (i % 4 < 2 ? 4 : -4)]]);
    people.push({ wps, npc: P.npc, alight });
  }
  return people;
}

const SPEED_WALK = 1.35;
export function personAt(p, t) {
  let [x, z] = p.wps[0][1], tt = 0, walking = false, yaw = p.wps[0][1][0] > 0 ? 270 : 90;
  for (let i = 1; i < p.wps.length; i++) {
    const [ts, [nx, nz]] = p.wps[i];
    const start = Math.max(ts, tt);
    const dist = Math.hypot(nx - x, nz - z), end = start + dist / SPEED_WALK;
    if (t >= end) { if (dist > 1e-6) yaw = Math.atan2(nx - x, nz - z) * 180 / Math.PI; x = nx; z = nz; tt = end; continue; }
    if (t >= start) { const u = (t - start) / Math.max(end - start, 1e-6); yaw = Math.atan2(nx - x, nz - z) * 180 / Math.PI; return { lat: x + (nx - x) * u, lon: z + (nz - z) * u, yaw, walking: true }; }
    break;
  }
  if (Math.abs(x) < 1.43 && Math.abs(x) >= 0.3) yaw = x > 0 ? 270 : 90;
  return { lat: x, lon: z, yaw, walking };
}

export function routeYaw(p) { return p.yaw + (p.car.rev ? 180 : 0); }
export function carToWorld(p, lat, lon) {
  const yr = routeYaw(p) * Math.PI / 180;
  return [p.x + lat * Math.cos(yr) + lon * Math.sin(yr), p.z - lat * Math.sin(yr) + lon * Math.cos(yr)];
}

// ---------------------------------------------------------------- 逐 tick 資料
export function buildPayload(sc, cars, sub) {
  const nt = Math.round(sc.duration * 20) + 2;
  // 以 1/200 秒積分車速 → 每 tick 的位置
  const dt = 0.005, perTick = 10;
  const sTick = new Float64Array(nt), vTick = new Float64Array(nt);
  let s = sc.sStart, vPrev = sc.speed(0) / 3.6;
  for (let k = 0; k < nt; k++) {
    sTick[k] = s; vTick[k] = sc.speed(k * 0.05);
    for (let j = 0; j < perTick; j++) {
      const t = (k * perTick + j + 1) * dt;
      const v = sc.speed(t) / 3.6;
      s += (vPrev + v) / 2 * dt; vPrev = v;
    }
  }
  const places = [], ticks = [], hud = [];
  const plat = sc.platform ? placeConsist(cars, sc.route, sTick[0]) : null;
  for (let k = 0; k < nt; k++) {
    const t = k * 0.05;
    const pl = placeConsist(cars, sc.route, sTick[k]);
    places.push(pl);
    const c = pl.map((p) => {
      const [b0, b1] = p.bogies;
      return [p.x, p.z, p.yaw, vTick[k] / 72.0, sc.notch(t), sc.adjust(t), b0.x, b0.z, b0.cant, b1.x, b1.z, -b1.cant];
    });
    const e = [];
    if (sc.passengers) {
      for (const person of sc.passengers) {
        const st = personAt(person, t);
        const inside = Math.abs(st.lat) < 1.43;
        const p = inside ? pl[0] : plat[0];
        const [wx, wz] = carToWorld(p, st.lat, st.lon);
        const y = inside ? st.lat * Math.sin(p.roll * Math.PI / 180) + 1.152 : 1.10;
        e.push([wx, y, wz, person.npc ? 1 : 0]);
      }
    }
    ticks.push({ c, e });
    const s0 = pl[0].s, k0 = sc.route.curvature(s0), v = vTick[k] / 3.6;
    const need = GAUGE_MM * v * v * Math.abs(k0) / 9.80665;
    const cantMm = Math.tan(sc.route.cantAt(s0) * Math.PI / 180) * GAUGE_MM;
    hud.push({ speed: vTick[k], notch: sc.notch(t), adjust: sc.adjust(t), deficiency: Math.max(0, need - cantMm) });
  }
  // 曲線與道岔的特徵點 → 第一節車中心通過的時刻
  const timeAt = (sv) => { for (let k = 1; k < nt; k++) if (sTick[k] >= sv) return (k - 1 + (sv - sTick[k - 1]) / Math.max(sTick[k] - sTick[k - 1], 1e-9)) * 0.05; return null; };
  const markers = sc.markers.slice();
  if (sc.curveMarks) for (const [sv, kind] of sc.curveMarks) { const t = timeAt(sv); if (t !== null) markers.push({ t, label: kind === "in" ? T("進彎", "曲線入口", "Curve in") : T("出彎", "曲線出口", "Curve out") }); }
  if (sc.toeS) {
    for (const [sv, lab] of [[sc.toeS, T("尖軌", "トング", "Toe")], [sc.frogS, T("轍叉", "クロッシング", "Frog")]]) {
      // 前轉向架通過的時刻
      const t = timeAt(sv - cars[0].bogies[0]); if (t !== null) markers.push({ t, label: lab });
    }
  }
  return {
    payload: { cars: cars.map((c) => ({ id: c.id, half: c.half })), sub, switches: sc.switches, ticks },
    places, sTick, hud, markers, nt,
  };
}
