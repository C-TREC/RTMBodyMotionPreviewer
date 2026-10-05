// 驗證：同一份輸入，Worker（V8）與影片製作時的 Nashorn 結果逐格比對
import fs from "node:fs";
import vm from "node:vm";
import { extractLiteral } from "../app/tuning.js";
const CACHE = process.argv[2], name = process.argv[3];
const S = "../10010型_車體晃動試作/assets/minecraft/scripts/";
const IN = JSON.parse(fs.readFileSync(`${CACHE}/in_${name}.json`, "utf8"));
const render = fs.readFileSync(S + "Render_script_10010_c-trec.js", "utf8");
const msg = { adapterSrc: fs.readFileSync("app/scripts/RTMBodyMotionAdapter.js", "utf8"), moduleSrc: fs.readFileSync("app/scripts/RTMBodyMotion.js", "utf8"),
  tuningSrc: extractLiteral(render, "MOTION_TUNING"), payload: IN };
let out = null;
const ctx = { postMessage: (m) => { out = m; }, console };
ctx.self = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("app/sim-worker.js", "utf8"), ctx);
const t0 = Date.now();
ctx.onmessage({ data: msg });
if (out.error) { console.log(out.error); process.exit(1); }
const ref = fs.readFileSync(`${CACHE}/out_${name}.csv`, "utf8").trim().split("\n").map((l) => l.split(",").map(Number));
const nc = IN.cars.length, sub = IN.sub;
let maxd = [0, 0, 0, 0, 0], n = 0;
for (const r of ref) {
  const [k, f, j] = r; const o = ((k * sub + f) * nc + j) * 5;
  for (let c = 0; c < 5; c++) maxd[c] = Math.max(maxd[c], Math.abs(out.poses[o + c] - r[3 + c]));
  n++;
}
console.log(name, "samples", n, "time", Date.now() - t0, "ms tickSource", out.tickSource);
console.log("max |diff| roll/sway/pitch/shift/bounce:", maxd.map((x) => x.toExponential(2)).join(" "));
