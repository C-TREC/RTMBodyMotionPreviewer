// MQO 載入器：依 NGT MqoModel 的規則（cm→m、面頂點反序三角化、mirror_axis 鏡像、facet 平滑角）
// 回傳 {materials:[{name, tex}], meshes:[{name, groups:{mat: {pos, nrm, uv}}}]}

export function parseMqo(text) {
  const materials = [], objects = [];
  let cur = null, mode = null;
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    if (mode) {
      if (s.startsWith("}")) { mode = null; continue; }
      if (mode === "mat") {
        const name = (/^"([^"]*)"/.exec(s) || [, s.split(" ")[0]])[1];
        const tex = (/tex\("([^"]*)"\)/.exec(s) || [])[1] || null;
        const col = (/col\(([^)]*)\)/.exec(s) || [])[1];
        materials.push({ name, tex, col: col ? col.trim().split(/\s+/).map(Number) : [0.8, 0.8, 0.8, 1] });
      } else if (mode === "vert") {
        const t = s.split(/\s+/);
        if (t.length === 3) cur.verts.push(+t[0] * 0.01, +t[1] * 0.01, +t[2] * 0.01);
      } else if (mode === "face") {
        const n = parseInt(s, 10);
        if (n < 3) continue;
        const mv = /(?<![A-Z])V\(([^)]*)\)/.exec(s);
        if (!mv) continue;
        const idx = mv[1].trim().split(/\s+/).map(Number);
        const mm = /(?<![A-Z])M\(([^)]*)\)/.exec(s);
        const mu = /UV\(([^)]*)\)/.exec(s);
        let uv = null;
        if (mu) { const f = mu[1].trim().split(/\s+/).map(Number); uv = []; for (let i = 0; i < n; i++) uv.push([f[2 * i], f[2 * i + 1]]); }
        cur.faces.push({ mat: mm ? +mm[1] : 0, idx, uv });
      }
      continue;
    }
    if (s.startsWith("Material ") && !s.startsWith("MaterialEx")) mode = "mat";
    else if (/^(MaterialEx|Thumbnail |BackImage|Scene|IncludeXml)/.test(s)) mode = s.endsWith("{") ? "skip" : null;
    else if (s.startsWith("Object ")) { cur = { name: (/"([^"]*)"/.exec(s) || [, "obj"])[1], verts: [], faces: [], mirror: 0, facet: 59.5, visible: 15 }; objects.push(cur); }
    else if (cur && s.startsWith("vertex ")) mode = "vert";
    else if (cur && s.startsWith("face ")) mode = "face";
    else if (cur && s.startsWith("mirror_axis ")) cur.mirrorAxis = +s.split(/\s+/)[1];
    else if (cur && s.startsWith("mirror ")) cur.mirror = +s.split(/\s+/)[1];
    else if (cur && s.startsWith("facet ")) cur.facet = +s.split(/\s+/)[1];
    else if (cur && s.startsWith("visible ")) cur.visible = +s.split(/\s+/)[1];
    else if (cur && s.endsWith("{")) mode = "skip";
  }
  return { materials, objects };
}

function buildObject(o) {
  let P = o.verts.slice();
  const nv = P.length / 3;
  const tris = [], tuv = [], tmat = [];
  for (const f of o.faces) {
    const n = f.idx.length;
    if (f.idx.some((i) => i >= nv)) continue;
    for (let k = 0; k < n - 2; k++) {
      // NGT：index = (n - fanIndex) % n，扇形 (0, k+1, k+2) → (0, n-k-1, n-k-2)
      const c = [0, (n - (k + 1)) % n, (n - (k + 2)) % n];
      tris.push(c.map((j) => f.idx[j]));
      tuv.push(c.map((j) => (f.uv ? f.uv[j] : [0, 0])));
      tmat.push(f.mat);
    }
  }
  if (o.mirrorAxis) {
    const ax = { 1: 0, 2: 1, 4: 2 }[o.mirrorAxis] ?? 0;
    const remap = new Int32Array(nv);
    const add = [];
    for (let i = 0; i < nv; i++) {
      if (Math.abs(P[i * 3 + ax]) < 1e-6) remap[i] = i;
      else { remap[i] = nv + add.length / 3; add.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); add[add.length - 3 + ax] *= -1; }
    }
    P = P.concat(add);
    const T = tris.length;
    for (let t = 0; t < T; t++) {
      const [a, b, c] = tris[t];
      tris.push([remap[a], remap[c], remap[b]]);
      tuv.push([tuv[t][0], tuv[t][2], tuv[t][1]]);
      tmat.push(tmat[t]);
    }
  }
  // 平滑法線（facet 角以內的相鄰面平均）
  const T = tris.length;
  const fn = new Float32Array(T * 3);
  for (let t = 0; t < T; t++) {
    const [a, b, c] = tris[t];
    const ax = P[b * 3] - P[a * 3], ay = P[b * 3 + 1] - P[a * 3 + 1], az = P[b * 3 + 2] - P[a * 3 + 2];
    const bx = P[c * 3] - P[a * 3], by = P[c * 3 + 1] - P[a * 3 + 1], bz = P[c * 3 + 2] - P[a * 3 + 2];
    let x = ay * bz - az * by, y = az * bx - ax * bz, z = ax * by - ay * bx;
    const l = Math.hypot(x, y, z) || 1;
    fn[t * 3] = x / l; fn[t * 3 + 1] = y / l; fn[t * 3 + 2] = z / l;
  }
  const byVert = new Map();
  tris.forEach((tr, t) => tr.forEach((v) => { if (!byVert.has(v)) byVert.set(v, []); byVert.get(v).push(t); }));
  const cosLim = Math.cos(o.facet * Math.PI / 180) - 1e-6;
  const groups = {};
  for (let t = 0; t < T; t++) {
    const g = groups[tmat[t]] || (groups[tmat[t]] = { pos: [], nrm: [], uv: [] });
    for (let j = 0; j < 3; j++) {
      const v = tris[t][j];
      let nx = 0, ny = 0, nz = 0;
      for (const u of byVert.get(v)) {
        const d = fn[t * 3] * fn[u * 3] + fn[t * 3 + 1] * fn[u * 3 + 1] + fn[t * 3 + 2] * fn[u * 3 + 2];
        if (d >= cosLim) { nx += fn[u * 3]; ny += fn[u * 3 + 1]; nz += fn[u * 3 + 2]; }
      }
      const l = Math.hypot(nx, ny, nz) || 1;
      g.pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
      g.nrm.push(nx / l, ny / l, nz / l);
      g.uv.push(tuv[t][j][0], 1 - tuv[t][j][1]);
    }
  }
  return groups;
}

export function buildMqo(text) {
  const { materials, objects } = parseMqo(text);
  const meshes = [];
  for (const o of objects) {
    if (!o.faces.length) continue;
    meshes.push({ name: o.name, groups: buildObject(o) });
  }
  return { materials, meshes };
}
