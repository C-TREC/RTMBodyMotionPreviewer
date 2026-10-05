// 預覽器主程式：情境／調校／車輛／腳本 → 模擬執行緒 → 3D 與圖表播放
import { STRINGS, t, tri, setLang, getLang } from "./i18n.js";
import { makeConsist, lerpPlace } from "./route.js";
import { SCENARIOS, defaultParams, buildScenario, buildPayload, personAt, carToWorld, routeYaw } from "./scenarios.js";
import { parseDefaults, extractLiteral, evalLiteral, deepMerge, diffTuning, exportSnippet } from "./tuning.js";
import { Viewer } from "./scene.js";
import { Charts, CHANNELS } from "./charts.js";

const SUB = 12;                       // 每 tick 取 12 個 partialTick（240 Hz），慢動作也平順
const $ = (id) => document.getElementById(id);
const host = window.host || null;     // Electron 預載的檔案介面（在一般瀏覽器中開啟時為 null）

const state = {
  scripts: { module: null, adapter: null },
  meta: null, tuning: null, tuningSource: null,
  scenario: "curve", params: {},
  vehicle: { cars: 2, half: 10.225, bogieFront: 6.775, bogieRear: -7.225, railOffset: 1.032 },
  models: null, modelName: null,
  sim: null, ref: null,
  time: 0, playing: true, speed: 1, loop: true,
  trackKey: "", trainKey: "",
};
for (const s of SCENARIOS) state.params[s.id] = defaultParams(s.id);

// ---------------------------------------------------------------- 設定保存
const STORE = "rtmbm-previewer-v1";
function saveSettings() {
  try {
    localStorage.setItem(STORE, JSON.stringify({ lang: getLang(), scenario: state.scenario, params: state.params, vehicle: state.vehicle,
      tuning: state.meta ? diffTuning(state.meta.defaults, state.tuning) : null, cam: viewer.camMode, ex: viewer.exaggerate }));
  } catch (e) { /* 無法保存時略過 */ }
}
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(STORE) || "null"); } catch (e) { return null; }
}

// ---------------------------------------------------------------- 文字
function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $("tuneSearch").placeholder = t("search");
  $("chartHint").textContent = t("chartClick") + " · " + (state.ref ? t("refLegend") : "");
  $("exLabel").title = t("exaggerateNote");
  document.title = t("appTitle");
  buildScenarioList(); buildScenarioParams(); buildVehicleParams(); buildTuning(); buildCamBar(); buildFollow(); updateScriptInfo();
  $("btnRef").textContent = state.ref ? t("clearRef") : t("keepRef");
  if (charts) charts.draw();
}

function toast(msg) {
  const el = $("toast"); el.textContent = msg; el.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("show"), 2200);
}
function status(msg, err) { const el = $("status"); el.textContent = msg; el.classList.toggle("err", !!err); }

// ---------------------------------------------------------------- 情境
function buildScenarioList() {
  const box = $("scenarioList"); box.innerHTML = "";
  for (const s of SCENARIOS) {
    const b = document.createElement("button");
    b.textContent = tri(s.name);
    b.classList.toggle("active", s.id === state.scenario);
    b.onclick = () => { state.scenario = s.id; buildScenarioList(); buildScenarioParams(); viewer.resetTrackEye(); simulate(); };
    box.appendChild(b);
  }
  const sc = SCENARIOS.find((s) => s.id === state.scenario);
  $("scenarioDesc").textContent = tri(sc.desc);
}

function paramRow(container, def, value, onChange) {
  const row = document.createElement("div"); row.className = "p";
  const lab = document.createElement("label"); lab.textContent = typeof def.label === "string" ? def.label : tri(def.label);
  row.appendChild(lab);
  if (def.choice) {
    const sel = document.createElement("select");
    for (const [v, l] of def.choice) { const o = document.createElement("option"); o.value = v; o.textContent = tri(l); sel.appendChild(o); }
    sel.value = value;
    sel.onchange = () => onChange(Number(sel.value));
    row.appendChild(sel);
  } else {
    const wrap = document.createElement("span");
    const num = document.createElement("input"); num.type = "number"; num.min = def.min; num.max = def.max; num.step = def.step; num.value = value;
    const unit = document.createElement("span"); unit.className = "unit"; unit.textContent = def.unit || "";
    wrap.append(num, unit); row.appendChild(wrap);
    const rng = document.createElement("input"); rng.type = "range"; rng.min = def.min; rng.max = def.max; rng.step = def.step; rng.value = value;
    row.appendChild(rng);
    rng.oninput = () => { num.value = rng.value; onChange(Number(rng.value), true); };
    rng.onchange = () => onChange(Number(rng.value));
    num.onchange = () => { const v = Math.min(def.max, Math.max(def.min, Number(num.value))); num.value = v; rng.value = v; onChange(v); };
  }
  container.appendChild(row);
}

function buildScenarioParams() {
  const box = $("scenarioParams"); box.innerHTML = "";
  const sc = SCENARIOS.find((s) => s.id === state.scenario);
  for (const def of sc.params) {
    paramRow(box, def, state.params[sc.id][def.key], (v, live) => { state.params[sc.id][def.key] = v; scheduleSim(live ? 350 : 60); });
  }
}

// ---------------------------------------------------------------- 車輛
const VEHICLE_PARAMS = [
  { key: "cars", label: () => t("cars"), min: 1, max: 4, step: 1, unit: "" },
  { key: "half", label: () => t("halfLength"), min: 5, max: 15, step: 0.005, unit: "m" },
  { key: "bogieFront", label: () => t("bogieFront"), min: 0, max: 12, step: 0.005, unit: "m" },
  { key: "bogieRear", label: () => t("bogieRear"), min: -12, max: 0, step: 0.005, unit: "m" },
  { key: "railOffset", label: () => t("railOffset"), min: 0, max: 3, step: 0.001, unit: "m" },
];
function buildVehicleParams() {
  const box = $("vehicleParams"); box.innerHTML = "";
  for (const d of VEHICLE_PARAMS) {
    paramRow(box, { ...d, label: d.label() }, state.vehicle[d.key], (v, live) => {
      state.vehicle[d.key] = v;
      if (d.key === "railOffset") { viewer.railOffset = v; return; }
      scheduleSim(live ? 350 : 60);
    });
  }
  const note = document.createElement("p"); note.className = "muted small"; note.textContent = t("railOffsetNote"); box.appendChild(note);
}

async function loadModel(preloaded) {
  if (!host) return;
  let res = preloaded;
  if (!res) { try { res = await host.openModel(); } catch (e) { status(t("modelError") + "：" + e.message, true); return; } }
  if (!res) return;
  try {
    if (res.kind === "vehicle") {
      if (res.trainDistance) state.vehicle.half = res.trainDistance;
      if (res.bogiePos && res.bogiePos.length >= 2) { state.vehicle.bogieFront = res.bogiePos[0][2]; state.vehicle.bogieRear = res.bogiePos[1][2]; }
      state.models = { body: res.body, bogie: res.bogie };
      state.modelName = res.name;
      if (res.renderScript) applyTuningFromScript(res.renderScript.text, res.renderScript.name, true);
    } else {
      state.models = { body: res.body, bogie: state.models ? state.models.bogie : null };
      state.modelName = res.body.name;
    }
    await viewer.setModels(state.models);
    state.trainKey = "";
    buildVehicleParams(); buildObjList();
    $("modelInfo").textContent = t("modelLoaded", { name: state.modelName });
    toast(t("modelLoaded", { name: state.modelName }));
    simulate();
  } catch (e) { status(t("modelError") + "：" + e.message, true); console.error(e); }
}

function buildObjList() {
  const list = viewer.objectList(), box = $("objList");
  box.innerHTML = "";
  $("objHeader").hidden = !list.length;
  box.hidden = !list.length;
  for (const name of list) {
    const lab = document.createElement("label");
    const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = true;
    cb.onchange = () => viewer.setObjectVisible(name, cb.checked);
    lab.append(cb, document.createTextNode(name));
    box.appendChild(lab);
  }
}

// ---------------------------------------------------------------- 腳本
async function fetchText(url) { const r = await fetch(url); return r.text(); }
async function loadBundledScripts() {
  state.scripts.module = { name: "RTMBodyMotion.js", text: await fetchText("scripts/RTMBodyMotion.js"), bundled: true };
  state.scripts.adapter = { name: "RTMBodyMotionAdapter.js", text: await fetchText("scripts/RTMBodyMotionAdapter.js"), bundled: true };
}
function updateScriptInfo() {
  const box = $("scriptInfo"); box.innerHTML = "";
  for (const [k, lab] of [["module", "moduleFile"], ["adapter", "adapterFile"]]) {
    const s = state.scripts[k]; if (!s) continue;
    const a = document.createElement("div"); a.textContent = t(lab);
    const b = document.createElement("div"); b.className = "v"; b.textContent = (s.path || s.name) + (s.bundled ? "（" + t("bundled") + "）" : "");
    box.append(a, b);
  }
}
function setModuleSource(mod) {
  const meta = parseDefaults(mod.text);
  const overrides = state.meta ? diffTuning(state.meta.defaults, state.tuning) : null;
  state.meta = meta;
  state.tuning = deepMerge(meta.defaults, overrides);
  state.scripts.module = mod;
}
async function loadScripts() {
  if (!host) return;
  const files = await host.openScripts(); if (!files) return;
  const mod = files.find((f) => /RTMBodyMotion\.js$/i.test(f.name)) || files.find((f) => !/Adapter/i.test(f.name));
  const ada = files.find((f) => /RTMBodyMotionAdapter\.js$/i.test(f.name));
  try {
    if (mod) setModuleSource({ ...mod, bundled: false });
    if (ada) state.scripts.adapter = { ...ada, bundled: false };
    else toast(t("missingAdapter"));
    updateScriptInfo(); buildTuning(); simulate();
  } catch (e) { status(t("simError") + "：" + e.message, true); }
}

// ---------------------------------------------------------------- 調校
function fmtNum(v) { return Math.abs(v) >= 100 ? String(v) : String(Math.round(v * 1e6) / 1e6); }
function stepFor(v) {
  const a = Math.abs(v); if (!a) return 0.01;
  const e = Math.pow(10, Math.floor(Math.log10(a)) - 1); return Math.max(e, 0.0001);
}
function buildTuning() {
  const tree = $("tuneTree"); tree.innerHTML = "";
  if (!state.meta) return;
  const q = $("tuneSearch").value.trim().toLowerCase();
  const changedOnly = $("tuneChanged").checked, adv = $("tuneAdvanced").checked;
  const diff = diffTuning(state.meta.defaults, state.tuning);
  const nChanged = Object.values(diff).reduce((a, o) => a + Object.keys(o).length, 0);
  $("tuneInfo").textContent = t("changedCount", { n: nChanged }) + (state.tuningSource ? " · " + state.tuningSource : "");
  for (const sec of state.meta.sections) {
    const items = sec.items.filter((it) => {
      const ch = diff[sec.key] && Object.prototype.hasOwnProperty.call(diff[sec.key], it.key);
      if (changedOnly && !ch) return false;
      if (!adv && it.advanced && !ch && !q) return false;
      if (q && !(it.key.toLowerCase().includes(q) || tri(it.doc).toLowerCase().includes(q))) return false;
      return true;
    });
    if (!items.length) continue;
    const det = document.createElement("details"); det.className = "sec"; det.open = !!(q || changedOnly || sec.key !== "debug");
    const sum = document.createElement("summary");
    const nc = diff[sec.key] ? Object.keys(diff[sec.key]).length : 0;
    sum.innerHTML = "<span></span><span class='cnt'></span>";
    sum.children[0].textContent = tri(sec.title) + "  (" + sec.key + ")";
    sum.children[1].textContent = nc ? t("changedCount", { n: nc }) : "";
    det.appendChild(sum);
    if (sec.note) { const n = document.createElement("div"); n.className = "note"; n.textContent = tri(sec.note); det.appendChild(n); }
    for (const it of items) det.appendChild(tuneItem(sec, it, diff));
    tree.appendChild(det);
  }
}
function tuneItem(sec, it, diff) {
  const el = document.createElement("div"); el.className = "it";
  const cur = state.tuning[sec.key][it.key], def = it.value;
  const changed = diff[sec.key] && Object.prototype.hasOwnProperty.call(diff[sec.key], it.key);
  el.classList.toggle("changed", !!changed);
  const head = document.createElement("div"); head.className = "head";
  const key = document.createElement("span"); key.className = "key"; key.textContent = it.key;
  const ctl = document.createElement("span"); ctl.className = "ctl";
  const commit = (v) => { state.tuning[sec.key][it.key] = v; buildTuningLater(); scheduleSim(150); saveSettings(); };
  let input;
  if (typeof def === "boolean") {
    input = document.createElement("input"); input.type = "checkbox"; input.checked = cur;
    input.onchange = () => commit(input.checked);
  } else if (typeof def === "number") {
    input = document.createElement("input"); input.type = "number"; input.step = stepFor(def || cur); input.value = fmtNum(cur);
    input.onchange = () => { const v = Number(input.value); if (Number.isFinite(v)) commit(v); };
  } else {
    input = document.createElement("input"); input.type = "text"; input.value = typeof cur === "string" ? cur : JSON.stringify(cur);
    input.onchange = () => {
      if (typeof def === "string") { commit(input.value); return; }
      try { commit(JSON.parse(input.value)); input.style.borderColor = ""; } catch (e) { input.style.borderColor = "#e0303c"; }
    };
  }
  const rst = document.createElement("button"); rst.className = "rst ghost"; rst.textContent = t("reset");
  rst.onclick = () => commit(JSON.parse(JSON.stringify(def)));
  ctl.append(input, rst);
  head.append(key, ctl);
  el.appendChild(head);
  const doc = document.createElement("div"); doc.className = "doc"; doc.textContent = tri(it.doc); el.appendChild(doc);
  if (changed) { const d = document.createElement("div"); d.className = "def"; d.textContent = t("default") + "：" + (typeof def === "object" ? JSON.stringify(def) : String(def)); el.appendChild(d); }
  return el;
}
let tuneTimer = 0;
function buildTuningLater() { clearTimeout(tuneTimer); tuneTimer = setTimeout(buildTuning, 400); }

function applyTuningFromScript(text, name, quiet) {
  const lit = extractLiteral(text, "MOTION_TUNING");
  if (!lit) { if (!quiet) toast(t("tuningNotFound")); return false; }
  const ov = evalLiteral(lit);
  state.tuning = deepMerge(state.meta.defaults, ov);
  state.tuningSource = name;
  const diff = diffTuning(state.meta.defaults, state.tuning);
  const n = Object.values(diff).reduce((a, o) => a + Object.keys(o).length, 0);
  toast(t("tuningLoaded", { name, n }));
  buildTuning(); saveSettings();
  return true;
}
async function loadTuning() {
  if (!host) return;
  const f = await host.openText([{ name: "JavaScript", extensions: ["js"] }]); if (!f) return;
  try { if (applyTuningFromScript(f.text, f.name)) simulate(); } catch (e) { status(e.message, true); }
}
function showExport(onlyChanged) {
  const text = exportSnippet(state.meta, state.tuning, onlyChanged);
  $("modalTitle").textContent = onlyChanged ? t("exportChanged") : t("exportAll");
  const body = $("modalBody"); body.innerHTML = "";
  const p = document.createElement("p"); p.className = "muted"; p.textContent = t("exportHint");
  const ta = document.createElement("textarea"); ta.value = text; ta.readOnly = true;
  const row = document.createElement("div"); row.className = "row";
  const c = document.createElement("button"); c.className = "accent"; c.textContent = t("copy");
  c.onclick = async () => { await navigator.clipboard.writeText(text); toast(t("copied")); };
  const s = document.createElement("button"); s.textContent = t("save");
  s.onclick = () => host && host.saveText("MOTION_TUNING.js", text, [{ name: "JavaScript", extensions: ["js"] }]);
  row.append(c, s);
  body.append(p, ta, row);
  $("modal").hidden = false;
}

// ---------------------------------------------------------------- 模擬
let worker = null, simTimer = 0, simSeq = 0;
function scheduleSim(ms) { clearTimeout(simTimer); simTimer = setTimeout(simulate, ms); }

function simulate() {
  if (!state.meta) return;
  saveSettings();
  const V = state.vehicle;
  const cars = makeConsist(Math.round(V.cars), V.half, V.bogieFront, V.bogieRear);
  const P = state.params[state.scenario];
  let sc, built;
  try {
    sc = buildScenario(state.scenario, P, cars);
    built = buildPayload(sc, cars, SUB);
  } catch (e) { status(e.message, true); console.error(e); return; }
  if (worker) worker.terminate();
  worker = new Worker("sim-worker.js");
  const seq = ++simSeq;
  const t0 = performance.now();
  status(t("simulating"));
  worker.onmessage = (ev) => {
    if (seq !== simSeq) return;
    const m = ev.data;
    $("simLog").textContent = (m.log || []).join("\n") || "—";
    if (m.error) { status(t("simError") + "：" + m.error.split("\n")[0], true); $("simLog").textContent = m.error; return; }
    onSimResult(sc, built, cars, m.poses, performance.now() - t0);
    worker.terminate(); worker = null;
  };
  worker.onerror = (e) => { status(t("simError") + "：" + e.message, true); };
  worker.postMessage({ adapterSrc: state.scripts.adapter.text, moduleSrc: state.scripts.module.text, tuningSrc: JSON.stringify(state.tuning), payload: built.payload });
}

function onSimResult(sc, built, cars, poses, ms) {
  const nc = cars.length, frames = (built.nt - 2) * SUB;
  const duration = sc.duration;
  state.sim = { sc, built, cars, poses, nc, frames, duration };
  // 軌道與車輛只在幾何改變時重建
  const trackKey = JSON.stringify([state.scenario, state.params[state.scenario], state.vehicle.cars, state.vehicle.half]);
  if (trackKey !== state.trackKey) {
    const s0 = built.sTick[0] - cars[nc - 1].offset - cars[0].half - 40, s1 = built.sTick[built.nt - 1] + cars[0].half + 80;
    viewer.setTrack([sc.route].concat(sc.extraRoutes || []), sc.platform, sc.route, [Math.max(0, s0), s1]);
    state.trackKey = trackKey;
  }
  const trainKey = JSON.stringify([nc, state.vehicle.half, state.modelName]);
  if (trainKey !== state.trainKey) { viewer.setTrain(cars); state.trainKey = trainKey; buildFollow(); }
  if (state.time > duration) state.time = 0;
  buildSeries();
  $("timeline").max = Math.round(duration * 100);
  status(t("simDone", { n: built.nt, ms: Math.round(ms) }));
  drawFrame();
}

// 圖表用：觀察車輛的五個通道（反向連結的車輛換成行進方向的符號）
function buildSeries() {
  const S = state.sim; if (!S) return;
  const c = Math.min(viewer.follow, S.nc - 1);
  const sg = S.cars[c].rev ? -1 : 1;
  const n = S.frames;
  const ch = CHANNELS.map(() => new Float32Array(n));
  for (let i = 0; i < n; i++) {
    const k = Math.floor(i / SUB) + 1, f = i % SUB;
    const o = ((k * SUB + f) * S.nc + c) * 5;
    ch[0][i] = S.poses[o] * sg; ch[1][i] = S.poses[o + 1] * sg; ch[2][i] = S.poses[o + 2] * sg; ch[3][i] = S.poses[o + 3] * sg; ch[4][i] = S.poses[o + 4];
  }
  S.series = { ch, duration: S.duration };
  charts.set(S.series, S.built.markers, S.duration);
}

// ---------------------------------------------------------------- 播放
function frameAt(time) {
  const S = state.sim;
  const n = Math.min(Math.max(Math.round(time * 20 * SUB), 0), S.frames - 1);
  const k = Math.floor(n / SUB) + 1, f = n % SUB, a = f / SUB;
  const places = lerpPlace(S.built.places[k - 1], S.built.places[k], a);
  const poses = [];
  for (let c = 0; c < S.nc; c++) { const o = ((k * SUB + f) * S.nc + c) * 5; poses.push([S.poses[o], S.poses[o + 1], S.poses[o + 2], S.poses[o + 3], S.poses[o + 4]]); }
  return { places, poses, k, f };
}

function drawFrame() {
  const S = state.sim; if (!S) return;
  const { places, poses, k } = frameAt(state.time);
  // 乘客
  let people = [];
  if (S.sc.passengers) {
    const platPlace = S.built.places[0][0];
    viewer.update(places, poses, []);
    people = S.sc.passengers.map((p, i) => {
      const st = personAt(p, state.time);
      const inside = Math.abs(st.lat) < 1.43;
      const [wx, wz] = carToWorld(platPlace, st.lat, st.lon);
      return { matrix: viewer.personMatrix(inside, 0, st.lat, st.lon, st.yaw, wx, wz, routeYaw(platPlace)), walking: st.walking ? 1 : 0, phase: state.time * 2 * Math.PI * 1.1 + i };
    });
  }
  viewer.update(places, poses, people);
  viewer.render();
  charts.setTime(state.time);
  // 抬頭顯示
  const h = S.built.hud[Math.min(k, S.built.hud.length - 1)];
  const c = Math.min(viewer.follow, S.nc - 1), sg = S.cars[c].rev ? -1 : 1, ps = poses[c];
  const notch = h.notch > 0 ? "P" + h.notch : h.notch === 0 ? "N" : (h.notch <= -8 ? "EB" : "B" + (-h.notch));
  const row = (a, b) => `<div class="r"><span>${a}</span><b>${b}</b></div>`;
  $("hud").innerHTML = row(t("speed"), Math.round(h.speed) + " km/h") + row(t("notch"), notch) +
    (S.sc.id === "curve" ? row(t("deficiency"), Math.round(h.deficiency) + " mm") : "") +
    (S.sc.id === "straight" ? row(t("dataMap"), (h.adjust >= 0 ? "+" : "") + h.adjust.toFixed(1)) : "") +
    `<div class="sub">${t("carN", { n: c + 1 })} · ${t("roll")} ${(ps[0] * sg).toFixed(2)}° · ${t("sway")} ${(ps[1] * sg * 100).toFixed(1)} cm</div>`;
  $("timeText").textContent = state.time.toFixed(2) + " / " + S.duration.toFixed(2) + " s";
  $("timeline").value = Math.round(state.time * 100);
}

let lastTs = 0;
function loop(ts) {
  const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.1) : 0;
  lastTs = ts;
  if (state.sim) {
    if (state.playing) {
      state.time += dt * state.speed;
      if (state.time >= state.sim.duration) {
        if (state.loop) { state.time = 0; viewer.resetTrackEye(); }
        else { state.time = state.sim.duration; setPlaying(false); }
      }
    }
    drawFrame();
  }
  requestAnimationFrame(loop);
}
function setPlaying(p) { state.playing = p; $("btnPlay").textContent = p ? "⏸" : "▶"; $("btnPlay").title = p ? t("pause") : t("play"); }

// ---------------------------------------------------------------- 視角
const CAMS = [["side", "camSide"], ["rear", "camRear"], ["front", "camFront"], ["interior", "camInterior"], ["track", "camTrack"], ["orbit", "camOrbit"]];
function buildCamBar() {
  const box = $("camModes"); box.innerHTML = "";
  for (const [id, lab] of CAMS) {
    const b = document.createElement("button"); b.textContent = t(lab);
    b.classList.toggle("active", viewer.camMode === id);
    b.onclick = () => { viewer.setCamMode(id); viewer.resetTrackEye(); buildCamBar(); saveSettings(); $("hint").hidden = id !== "orbit"; };
    box.appendChild(b);
  }
  $("hint").hidden = viewer.camMode !== "orbit";
}
function buildFollow() {
  const sel = $("followCar"); sel.innerHTML = "";
  const n = state.sim ? state.sim.nc : Math.round(state.vehicle.cars);
  for (let i = 0; i < n; i++) { const o = document.createElement("option"); o.value = i; o.textContent = t("followCar") + "：" + t("carN", { n: i + 1 }); sel.appendChild(o); }
  viewer.follow = Math.min(viewer.follow, n - 1);
  sel.value = viewer.follow;
}

// ---------------------------------------------------------------- 啟動
const viewer = new Viewer($("view"));
const charts = new Charts($("charts"), (tm) => { state.time = tm; viewer.resetTrackEye(); });

async function init() {
  const saved = loadSettings();
  if (saved) {
    if (saved.lang != null) setLang(saved.lang);
    if (saved.scenario && SCENARIOS.some((s) => s.id === saved.scenario)) state.scenario = saved.scenario;
    if (saved.params) for (const id of Object.keys(state.params)) Object.assign(state.params[id], saved.params[id] || {});
    if (saved.vehicle) Object.assign(state.vehicle, saved.vehicle);
    if (saved.cam) viewer.setCamMode(saved.cam);
    if (saved.ex) viewer.exaggerate = saved.ex;
  }
  $("lang").value = getLang();
  $("exaggerate").value = viewer.exaggerate;
  viewer.railOffset = state.vehicle.railOffset;
  await loadBundledScripts();
  setModuleSource(state.scripts.module);
  if (saved && saved.tuning) state.tuning = deepMerge(state.meta.defaults, mergeDiff(saved.tuning));
  if (host) { const info = await host.info(); $("ver").textContent = "v" + info.version; }
  applyI18n();
  setPlaying(true);
  simulate();
  requestAnimationFrame(loop);
  if (host) runSelfTest();
}

// 自動測試（只有 Electron 以測試環境變數啟動時才會執行）
async function runSelfTest() {
  const ti = await host.testInfo();
  if (!ti.snapshot && !ti.model) return;
  if (ti.scenario) { state.scenario = ti.scenario; buildScenarioList(); buildScenarioParams(); }
  if (ti.model) { const res = await host.testModel(); await loadModel(res); }
  if (ti.cam) { viewer.setCamMode(ti.cam); buildCamBar(); }
  simulate();
  await new Promise((r) => setTimeout(r, 2500));
  setPlaying(false); state.time = ti.time || 8; drawFrame();
  document.querySelector('#tabs button[data-tab=tuning]').click();
  await new Promise((r) => setTimeout(r, 800));
  if (ti.snapshot) host.testDone();
}
function mergeDiff(d) { return d; }

// 事件
document.querySelectorAll("#tabs button").forEach((b) => b.onclick = () => {
  document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("active", x === b));
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x.id === "tab-" + b.dataset.tab));
});
$("lang").onchange = () => { setLang(Number($("lang").value)); applyI18n(); saveSettings(); };
$("btnPlay").onclick = () => setPlaying(!state.playing);
$("btnRestart").onclick = () => { state.time = 0; viewer.resetTrackEye(); setPlaying(true); };
$("timeline").oninput = () => { state.time = Number($("timeline").value) / 100; viewer.resetTrackEye(); };
$("playSpeed").onchange = () => { state.speed = Number($("playSpeed").value); };
$("loop").onchange = () => { state.loop = $("loop").checked; };
$("exaggerate").onchange = () => { viewer.exaggerate = Number($("exaggerate").value); saveSettings(); };
$("followCar").onchange = () => { viewer.follow = Number($("followCar").value); viewer.resetTrackEye(); buildSeries(); };
$("btnRef").onclick = () => {
  if (state.ref) state.ref = null; else if (state.sim && state.sim.series) state.ref = state.sim.series;
  charts.setRef(state.ref);
  $("btnRef").textContent = state.ref ? t("clearRef") : t("keepRef");
  $("chartHint").textContent = t("chartClick") + " · " + (state.ref ? t("refLegend") : "");
};
$("btnLoadTuning").onclick = loadTuning;
$("btnExportChanged").onclick = () => showExport(true);
$("btnExportAll").onclick = () => showExport(false);
$("btnResetAll").onclick = () => { state.tuning = deepMerge(state.meta.defaults, null); state.tuningSource = null; buildTuning(); simulate(); };
$("tuneSearch").oninput = buildTuningLater;
$("tuneChanged").onchange = buildTuning;
$("tuneAdvanced").onchange = buildTuning;
$("btnLoadModel").onclick = loadModel;
$("btnBoxCar").onclick = async () => { state.models = null; state.modelName = null; await viewer.setModels(null); state.trainKey = ""; $("modelInfo").textContent = ""; buildObjList(); simulate(); };
$("btnLoadScripts").onclick = loadScripts;
$("btnBundled").onclick = async () => { await loadBundledScripts(); setModuleSource(state.scripts.module); updateScriptInfo(); buildTuning(); simulate(); };
$("btnShot").onclick = () => { const d = viewer.screenshot(); if (host) host.savePng("BodyMotion_" + state.scenario + ".png", d); };
$("btnAbout").onclick = () => {
  $("modalTitle").textContent = t("about");
  $("modalBody").innerHTML = "";
  const p = document.createElement("p"); p.textContent = t("aboutText");
  const p2 = document.createElement("p"); p2.className = "muted small"; p2.textContent = "three.js (MIT) · Electron (MIT)";
  $("modalBody").append(p, p2);
  $("modal").hidden = false;
};
$("modalClose").onclick = () => { $("modal").hidden = true; };
$("modal").onclick = (e) => { if (e.target.id === "modal") $("modal").hidden = true; };
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
  if (e.code === "Space") { e.preventDefault(); setPlaying(!state.playing); }
  else if (e.code === "ArrowRight") { state.time = Math.min(state.time + 1 / 60, state.sim ? state.sim.duration : 0); }
  else if (e.code === "ArrowLeft") { state.time = Math.max(state.time - 1 / 60, 0); }
  else if (e.code === "Home") { state.time = 0; viewer.resetTrackEye(); }
});
if (!host) { for (const id of ["btnLoadModel", "btnLoadScripts", "btnLoadTuning", "btnShot"]) $(id).disabled = true; }

init();
