// 路線與編組幾何：直線／緩和曲線／圓曲線＋超高、道岔分歧線，以及每節車的車體與轉向架位置。
// 慣例與 RTM 相同：yaw 0 朝 +Z，曲率 > 0 時往 +X 側轉（yaw 增加）。
export const GAUGE_MM = 1067.0;

export class Route {
  // segs: [[長度 m, 曲率起, 曲率終, 超高 mm 起, 超高 mm 終], ...]
  constructor(segs, x0 = 0, z0 = 0, yaw0Deg = 0, ds = 0.05) {
    const ks = [], cs = [];
    for (const [L, k0, k1, c0, c1] of segs) {
      const n = Math.max(1, Math.round(L / ds));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        ks.push(k0 + (k1 - k0) * t);
        cs.push(c0 + (c1 - c0) * t);
      }
    }
    const n = ks.length;
    this.ds = ds;
    this.n = n + 1;
    this.x = new Float64Array(n + 1); this.z = new Float64Array(n + 1); this.yawr = new Float64Array(n + 1);
    this.k = new Float64Array(n + 1); this.cantDeg = new Float64Array(n + 1); this.roll = new Float64Array(n + 1);
    this.x[0] = x0; this.z[0] = z0; this.yawr[0] = yaw0Deg * Math.PI / 180;
    for (let i = 0; i < n; i++) {
      this.yawr[i + 1] = this.yawr[i] + ks[i] * ds;
      const ym = (this.yawr[i] + this.yawr[i + 1]) / 2;
      this.x[i + 1] = this.x[i] + Math.sin(ym) * ds;
      this.z[i + 1] = this.z[i] + Math.cos(ym) * ds;
    }
    for (let i = 0; i <= n; i++) {
      const kk = ks[Math.min(i, n - 1)], cc = cs[Math.min(i, n - 1)];
      this.k[i] = kk;
      this.cantDeg[i] = Math.atan(cc / GAUGE_MM) * 180 / Math.PI;
      // 描畫用：彎心側較低（RTM 的 glRotatef(roll,0,0,1) 正值使上方倒向 -X）
      this.roll[i] = -Math.sign(kk) * this.cantDeg[i];
    }
    this.length = n * ds;
  }
  _i(s) {
    const f = Math.min(Math.max(s / this.ds, 0), this.n - 1.0001);
    const i = Math.floor(f);
    return [i, f - i];
  }
  _lerp(arr, s) { const [i, a] = this._i(s); return arr[i] * (1 - a) + arr[i + 1] * a; }
  pos(s) { return [this._lerp(this.x, s), this._lerp(this.z, s)]; }
  yaw(s) { return this._lerp(this.yawr, s) * 180 / Math.PI; }
  rollAt(s) { return this._lerp(this.roll, s); }
  cantAt(s) { return this._lerp(this.cantDeg, s); }
  curvature(s) { return this._lerp(this.k, s); }
  // 路線座標 (s, 橫向, 高度) → 世界座標（含超高）
  point(s, lateral, up = 0) {
    const [x, z] = this.pos(s);
    const y = this.yaw(s) * Math.PI / 180, r = this.rollAt(s) * Math.PI / 180;
    // rot_y(yaw) · rot_z(roll) · (lateral, up, 0)
    const lx = lateral * Math.cos(r) - up * Math.sin(r);
    const ly = lateral * Math.sin(r) + up * Math.cos(r);
    return [x + lx * Math.cos(y), ly, z - lx * Math.sin(y)];
  }
}

// 編組：cars = [{half, bogies:[zb0, zb1], rev}]，第一節車在前
export function makeConsist(n, half, bogieFront, bogieRear) {
  const cars = [];
  let off = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) off += half * 2;
    cars.push({ id: 101 + i, half, bogies: [bogieFront, bogieRear], rev: i === n - 1 && n > 1, offset: off });
  }
  return cars;
}

// s_head：第一節車中心沿路線的位置
export function placeConsist(cars, route, sHead) {
  return cars.map((c) => {
    const sc = sHead - c.offset;
    const d = c.rev ? -1 : 1;
    const [zb0, zb1] = c.bogies;
    const s0 = sc + d * zb0, s1 = sc + d * zb1;
    const [x0, z0] = route.pos(s0), [x1, z1] = route.pos(s1);
    const dx = x0 - x1, dz = z0 - z1;
    const yaw = Math.atan2(dx, dz) * 180 / Math.PI;      // 模型 +Z 指向轉向架 0
    const frac = (0 - zb1) / (zb0 - zb1);
    const r0 = route.rollAt(s0), r1 = route.rollAt(s1);
    return {
      car: c, s: sc, x: x1 + dx * frac, z: z1 + dz * frac, yaw, roll: (r0 + r1) / 2,
      bogies: [
        { s: s0, x: x0, z: z0, yaw: route.yaw(s0) + (c.rev ? 180 : 0), roll: r0 * d, cant: route.cantAt(s0) },
        { s: s1, x: x1, z: z1, yaw: route.yaw(s1) + (c.rev ? 180 : 0), roll: r1 * d, cant: route.cantAt(s1) },
      ],
    };
  });
}

function lerpAngle(u, v, a) { const d = ((v - u + 540) % 360) - 180; return u + d * a; }

export function lerpPlace(pa, pb, a) {
  const L = (u, v) => u + (v - u) * a;
  return pa.map((A, i) => {
    const B = pb[i];
    return {
      car: A.car, s: L(A.s, B.s), x: L(A.x, B.x), z: L(A.z, B.z), yaw: lerpAngle(A.yaw, B.yaw, a), roll: L(A.roll, B.roll),
      bogies: A.bogies.map((x, j) => {
        const y = B.bogies[j];
        return { s: L(x.s, y.s), x: L(x.x, y.x), z: L(x.z, y.z), yaw: lerpAngle(x.yaw, y.yaw, a), roll: L(x.roll, y.roll), cant: L(x.cant, y.cant) };
      }),
    };
  });
}

// ---------------------------------------------------------------- 道岔
// 分歧線：自尖軌起以半徑 R 的圓弧分出 lead 公尺，再以反向圓弧回到平行
export function branchSegs(side, radius, lead, length) {
  const k = 1 / radius;
  return [[lead, side * k, side * k, 0, 0], [lead, -side * k, -side * k, 0, 0], [length, 0, 0, 0, 0]];
}

// 供模組讀取的道岔資料（與 RTM RailMap 介面相同的取樣格式 [z, x, rotation]）
export function switchDef(main, toeS, branch, branchId, lead) {
  const mainPts = [], brPts = [];
  for (let i = 0; i < 97; i++) {
    const s = lead * i / 96;
    let [x, z] = main.pos(toeS + s);
    mainPts.push([z, x, main.yaw(toeS + s)]);
    [x, z] = branch.pos(s);
    brPts.push([z, x, branch.yaw(s)]);
  }
  const xs = mainPts.concat(brPts).map((p) => p[1]), zs = mainPts.concat(brPts).map((p) => p[0]);
  const [cx, cz] = main.pos(toeS + lead / 2), [rx, rz] = main.pos(toeS);
  return {
    core: [cx, cz], root: [rx, rz], main: mainPts, branch: brPts, branchId,
    mainDirIsPositive: true, branchDirIsPositive: true,
    box: [Math.min(...xs) - 6, Math.min(...zs) - 6, Math.max(...xs) + 6, Math.max(...zs) + 6],
  };
}

// 與模組相同的方法求轍叉：兩條交叉鋼軌的最近點，回傳本線座標 s
export function frogPoint(sw, toeS, lead) {
  const hg = GAUGE_MM / 2000;
  const vm = sw.branchId === 1 ? hg : -hg, vb = -vm;
  let best = [1e18, 0];
  sw.main.forEach(([zm, xm, rm], i) => {
    const a = rm * Math.PI / 180;
    const mx = xm + vm * Math.cos(a), mz = zm - vm * Math.sin(a);
    for (const [zb, xb, rb] of sw.branch) {
      const b = rb * Math.PI / 180;
      const bx = xb + vb * Math.cos(b), bz = zb - vb * Math.sin(b);
      const d = (mx - bx) ** 2 + (mz - bz) ** 2;
      if (d < best[0]) best = [d, i];
    }
  });
  return toeS + lead * best[1] / 96;
}
