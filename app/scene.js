// 3D 場景：軌道（含超高）、道岔分歧線、月台、車體（內建方塊車或讀入的模型）、轉向架、乘客、視角
import * as THREE from "./vendor/three.module.js";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { OBJLoader } from "./vendor/OBJLoader.js";
import { buildMqo } from "./mqo.js";

const PIVOT_Y = 1.15;          // 模組 pivotY（模型座標）
const GAUGE = 1.067;

export class Viewer {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xa9c6e8);
    this.scene.fog = new THREE.Fog(0xa9c6e8, 250, 1400);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 4000);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x4d5a3a, 1.1));
    const sun = this.sun = new THREE.DirectionalLight(0xfff3e0, 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 300;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun, sun.target);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshLambertMaterial({ color: 0x6f8f4e }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.85; ground.receiveShadow = true;
    this.scene.add(ground);
    this.trackGroup = new THREE.Group(); this.scene.add(this.trackGroup);
    this.trainGroup = new THREE.Group(); this.scene.add(this.trainGroup);
    this.peopleGroup = new THREE.Group(); this.scene.add(this.peopleGroup);
    this.camMode = "side";
    this.sideSign = 1;            // 側面攝影機在哪一側（有月台時放在另一側）
    this.follow = 0;
    this.railOffset = 1.032;
    this.exaggerate = 1;
    this.bodyModel = null;       // {object3d 模板}
    this.bogieModel = null;
    this._lastTarget = null;
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
  }

  resize() {
    const p = this.canvas.parentElement;
    const w = p.clientWidth, h = p.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ 軌道
  setTrack(routes, platform, mainRoute, sRange) {
    disposeGroup(this.trackGroup);
    const [s0, s1] = sRange;
    const ballastMat = new THREE.MeshLambertMaterial({ color: 0x8a8378 });
    const sleeperMat = new THREE.MeshLambertMaterial({ color: 0x6b6158 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0xb9b4ad, metalness: 0.7, roughness: 0.35 });
    routes.forEach((route, ri) => {
      const a = ri === 0 ? s0 : 0, b = Math.min(ri === 0 ? s1 : s1, route.length);
      if (b <= a) return;
      // 道碴：梯形斷面
      this.trackGroup.add(stripMesh(route, a, b, 2.0, [[-1.9, -0.85], [-1.25, -0.2], [1.25, -0.2], [1.9, -0.85]], ballastMat, true));
      // 鋼軌
      for (const side of [-1, 1]) {
        const c = side * (GAUGE / 2 + 0.033);
        this.trackGroup.add(stripMesh(route, a, b, 1.0, [[c - 0.033, -0.15], [c - 0.033, 0], [c + 0.033, 0], [c + 0.033, -0.15]], railMat, false));
      }
      // 枕木（InstancedMesh）
      const n = Math.floor((b - a) / 0.6);
      const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(2.0, 0.14, 0.2), sleeperMat, n);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      for (let i = 0; i < n; i++) {
        const s = a + i * 0.6 + 0.3;
        const [x, z] = route.pos(s);
        e.set(0, route.yaw(s) * Math.PI / 180, route.rollAt(s) * Math.PI / 180, "YXZ");
        q.setFromEuler(e);
        const off = new THREE.Vector3(0, -0.22, 0).applyQuaternion(q);
        m.compose(new THREE.Vector3(x + off.x, off.y, z + off.z), q, new THREE.Vector3(1, 1, 1));
        sl.setMatrixAt(i, m);
      }
      sl.receiveShadow = true;
      this.trackGroup.add(sl);
    });
    this.sideSign = platform ? -platform.side : 1;
    if (platform) {
      const side = platform.side, edge = 1.6, w = 6.0, h = 1.10;
      const mat = new THREE.MeshLambertMaterial({ color: 0xb8b4ac });
      this.trackGroup.add(stripMesh(mainRoute, platform.s0, platform.s1, 2.0,
        side > 0 ? [[edge, -0.85], [edge, h], [edge + w, h], [edge + w, -0.85]] : [[-edge - w, -0.85], [-edge - w, h], [-edge, h], [-edge, -0.85]], mat, true, true));
      const line = new THREE.MeshBasicMaterial({ color: 0xe8c21a });
      const c = side * (edge + 0.95);
      this.trackGroup.add(stripMesh(mainRoute, platform.s0, platform.s1, 2.0, [[c - 0.15, h + 0.004], [c + 0.15, h + 0.004]], line, false, true, true));
    }
  }

  // ------------------------------------------------------------ 車輛
  setTrain(cars) {
    disposeGroup(this.trainGroup, true);
    this.cars = cars.map((c, i) => {
      const body = new THREE.Group();
      body.matrixAutoUpdate = false;
      body.add(this.bodyModel ? this.bodyModel.clone() : boxCar(c, i));
      const bogies = [0, 1].map(() => {
        const g = new THREE.Group(); g.matrixAutoUpdate = false;
        g.add(this.bogieModel ? this.bogieModel.clone() : boxBogie());
        this.trainGroup.add(g);
        return g;
      });
      this.trainGroup.add(body);
      return { body, bogies };
    });
    this.trainGroup.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  // models: {body:{text, format, textures, textureModes}, bogie:{...}}
  async setModels(models) {
    this.bodyModel = models && models.body ? await buildModel(models.body) : null;
    this.bogieModel = models && models.bogie ? await buildModel(models.bogie) : null;
    return { body: this.bodyModel, bogie: this.bogieModel };
  }

  // places：本幀每節車的擺放；poses：[roll, sway, pitch, shift, bounce]
  update(places, poses, people) {
    const ex = this.exaggerate;
    this.mats = [];
    places.forEach((p, i) => {
      const c = this.cars[i]; if (!c) return;
      const ps = poses[i];
      const base = new THREE.Matrix4()
        .makeTranslation(p.x, 0, p.z)
        .multiply(rotY(p.yaw))
        .multiply(rotZ(p.roll * (p.car.rev ? -1 : 1)))
        .multiply(new THREE.Matrix4().makeTranslation(0, this.railOffset, 0));
      // RTMBodyMotion.applyPose：T(sway, bounce, shift)·T(0,pivot,0)·Rz(roll)·Rx(pitch)·T(0,-pivot,0)
      const pose = new THREE.Matrix4().makeTranslation(ps[1] * ex, ps[4] * ex, ps[3] * ex)
        .multiply(new THREE.Matrix4().makeTranslation(0, PIVOT_Y, 0))
        .multiply(rotZ(ps[0] * ex)).multiply(rotX(ps[2] * ex))
        .multiply(new THREE.Matrix4().makeTranslation(0, -PIVOT_Y, 0));
      const M = base.clone().multiply(pose);
      c.body.matrix.copy(M); c.body.matrixWorldNeedsUpdate = true;
      this.mats.push({ M, base });
      p.bogies.forEach((b, j) => {
        const B = new THREE.Matrix4().makeTranslation(b.x, 0, b.z).multiply(rotY(b.yaw)).multiply(rotZ(b.roll))
          .multiply(new THREE.Matrix4().makeTranslation(0, this.railOffset, 0));
        c.bogies[j].matrix.copy(B); c.bogies[j].matrixWorldNeedsUpdate = true;
      });
    });
    this.updatePeople(people || []);
    this.places = places;
  }

  updatePeople(list) {
    while (this.peopleGroup.children.length < list.length) this.peopleGroup.add(blockPerson(this.peopleGroup.children.length));
    this.peopleGroup.children.forEach((g, i) => {
      const it = list[i];
      g.visible = !!it;
      if (!it) return;
      g.matrixAutoUpdate = false;
      g.matrix.copy(it.matrix);
      const sw = Math.sin(it.phase) * 25 * it.walking * Math.PI / 180;
      g.userData.limbs.forEach(([o, s]) => { o.rotation.x = sw * s; });
      g.matrixWorldNeedsUpdate = true;
    });
  }

  personMatrix(inside, carIndex, lat, lon, yaw, wx, wz, routeYaw) {
    if (inside && this.mats && this.mats[carIndex]) {
      const rev = this.places[carIndex] ? this.places[carIndex].car.rev : false;
      const [mx, mz, my] = rev ? [-lat, -lon, yaw + 180] : [lat, lon, yaw];
      return this.mats[carIndex].M.clone().multiply(new THREE.Matrix4().makeTranslation(mx, 0.12, mz)).multiply(rotY(my));
    }
    return new THREE.Matrix4().makeTranslation(wx, 1.10, wz).multiply(rotY(routeYaw + yaw));
  }

  // ------------------------------------------------------------ 視角
  setCamMode(mode) {
    this.camMode = mode;
    this.controls.enabled = mode === "orbit";
    this._lastTarget = null;
  }

  placeCamera() {
    const i = Math.min(this.follow, (this.mats || []).length - 1);
    if (i < 0) return;
    const { base } = this.mats[i];
    const p = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(base);
    const cam = this.camera;
    const mode = this.camMode;
    const center = p(0, 0.6, 0);
    if (mode === "orbit") {
      // 跟著車輛移動，保留使用者的旋轉與距離
      if (this._lastTarget) { const d = center.clone().sub(this._lastTarget); cam.position.add(d); this.controls.target.add(d); }
      else { this.controls.target.copy(center); cam.position.copy(p(14, 4, -12)); }
      this._lastTarget = center.clone();
      this.controls.update();
      cam.fov = 40;
    } else if (mode === "side") {
      cam.position.copy(p(26 * this.sideSign, 2.8, 0)); cam.up.set(0, 1, 0); cam.lookAt(p(0, 1.1, 0)); cam.fov = 32;
    } else if (mode === "rear" || mode === "front") {
      // 編組兩端的車輛：後方＝最後一節車的後面往前看，正面＝第一節車的前面往後看
      const last = this.mats.length - 1, pl = this.places;
      const j = mode === "rear" ? last : 0;
      const bj = this.mats[j].base, half = pl[j].car.half;
      // 反向連結的車輛，模型 +Z 朝後
      const dir = (mode === "rear" ? -1 : 1) * (pl[j].car.rev ? -1 : 1);
      const q = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(bj);
      cam.position.copy(q(0, 1.7, dir * (half + 18))); cam.up.set(0, 1, 0); cam.lookAt(q(0, 1.3, 0)); cam.fov = 20;
    } else if (mode === "interior") {
      // 乘客視角：攝影機固定在車輛實體（不跟車體晃動），車廂在周圍晃動——與遊戲內乘車時相同
      const up = new THREE.Vector3(0, 1, 0).transformDirection(base);
      cam.position.copy(p(0.35, 1.62, -6.0)); cam.up.copy(up); cam.lookAt(p(0.0, 1.45, 6.0)); cam.fov = 66;
    } else if (mode === "track") {
      if (!this._trackEye) this._trackEye = p(9, 1.6, 30);
      cam.position.copy(this._trackEye); cam.up.set(0, 1, 0); cam.lookAt(p(0, 1.0, 0)); cam.fov = 30;
    }
    cam.updateProjectionMatrix();
    // 陰影範圍跟著觀察車輛
    this.sun.position.copy(center).add(new THREE.Vector3(-30, 60, 25));
    this.sun.target.position.copy(center);
  }

  resetTrackEye() { this._trackEye = null; }

  render() {
    if (this.mats && this.mats.length) this.placeCamera();
    this.renderer.render(this.scene, this.camera);
  }

  screenshot() { this.render(); return this.canvas.toDataURL("image/png"); }

  // 車體內建模型的顯示切換
  objectList() {
    const out = [];
    if (this.bodyModel) this.bodyModel.traverse((o) => { if (o.isMesh && o.userData.objName) out.push(o.userData.objName); });
    return [...new Set(out)];
  }
  setObjectVisible(name, vis) {
    if (this.bodyModel) this.bodyModel.traverse((o) => { if (o.isMesh && o.userData.objName === name) o.visible = vis; });
    for (const c of this.cars || []) c.body.traverse((o) => { if (o.isMesh && o.userData.objName === name) o.visible = vis; });
  }
}

// ---------------------------------------------------------------- 幾何工具
function rotY(d) { return new THREE.Matrix4().makeRotationY(d * Math.PI / 180); }
function rotZ(d) { return new THREE.Matrix4().makeRotationZ(d * Math.PI / 180); }
function rotX(d) { return new THREE.Matrix4().makeRotationX(d * Math.PI / 180); }

// 沿路線擠出斷面（profile：[[橫向, 高度], ...]，在含超高的軌道座標中）
function stripMesh(route, a, b, step, profile, mat, shadow, flat = false, open = false) {
  const n = Math.max(2, Math.ceil((b - a) / step) + 1);
  const m = profile.length;
  const pos = [];
  for (let i = 0; i < n; i++) {
    const s = a + (b - a) * i / (n - 1);
    for (const [lat, up] of profile) {
      if (flat) { const [x, z] = route.pos(s); const y = route.yaw(s) * Math.PI / 180; pos.push(x + lat * Math.cos(y), up, z - lat * Math.sin(y)); }
      else pos.push(...route.point(s, lat, up));
    }
  }
  const idx = [];
  const segs = open ? m - 1 : m - 1;
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < segs; j++) {
    const a0 = i * m + j, a1 = a0 + 1, b0 = a0 + m, b1 = b0 + 1;
    idx.push(a0, b0, a1, a1, b0, b1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mat.clone());
  mesh.material.side = THREE.DoubleSide;
  mesh.receiveShadow = shadow;
  return mesh;
}

function disposeGroup(g, keepShared) {
  for (const c of g.children.slice()) {
    g.remove(c);
    c.traverse((o) => { if (o.isMesh && !keepShared) { o.geometry.dispose(); } });
  }
}

// 內建方塊車：標出車窗、車門、車頭方向，晃動一目了然（模型座標，原點在軌面上 1.032 m）
function boxCar(c, i) {
  const g = new THREE.Group();
  const L = c.half * 2 - 0.3, W = 2.8, y0 = -1.032 + 1.12, H = 2.9;
  const white = new THREE.MeshStandardMaterial({ color: 0xe9eaec, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b3340, roughness: 0.3, metalness: 0.2 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc8202c, roughness: 0.45 });
  const roofM = new THREE.MeshStandardMaterial({ color: 0x9aa1aa, roughness: 0.7 });
  // 車殼：下半部（腰板）、窗間柱、上半部；車窗是半透明玻璃，看得到車內乘客
  const glass = new THREE.MeshStandardMaterial({ color: 0x24303d, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.32, depthWrite: false });
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
  const winLo = 1.15, winHi = 2.05, t = 0.06;
  for (const s of [-1, 1]) {
    box(t, winLo, L, white, s * (W / 2 - t / 2), y0 + winLo / 2, 0);
    box(t, H - winHi, L, white, s * (W / 2 - t / 2), y0 + (winHi + H) / 2, 0);
    box(t * 0.5, winHi - winLo, L - 0.4, glass, s * (W / 2 - t / 2), y0 + (winLo + winHi) / 2, 0);
    for (const z of [-L / 2 + 0.3, -c.half * 0.5, 0, c.half * 0.5, L / 2 - 0.3]) box(t, winHi - winLo, 0.5, white, s * (W / 2 - t / 2), y0 + (winLo + winHi) / 2, z);
  }
  for (const z of [-1, 1]) box(W, H, t, white, 0, y0 + H / 2, z * (L / 2 - t / 2));
  box(W - 0.12, 0.05, L - 0.12, new THREE.MeshStandardMaterial({ color: 0x5d6470, roughness: 0.8 }), 0, y0 + 0.025, 0);
  box(W, 0.06, L, white, 0, y0 + H - 0.03, 0);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.18, L - 0.2), roofM); roof.position.set(0, y0 + H + 0.09, 0); g.add(roof);
  // 帶狀色帶與車窗
  for (const s of [-1, 1]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, L - 0.05), red); band.position.set(s * (W / 2 + 0.01), y0 + 2.25, 0); g.add(band);
    for (const dz of [-0.75, -0.25, 0.25, 0.75]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.86, 1.3), new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.4 }));
      door.position.set(s * (W / 2 + 0.015), y0 + 0.98, dz * c.half); g.add(door);
    }
  }
  // 前端（模型 +Z）標示：深色前窗；反向連結的車輛同樣標在模型 +Z
  const front = new THREE.Mesh(new THREE.BoxGeometry(W - 0.4, 1.0, 0.03), dark); front.position.set(0, y0 + 1.75, L / 2 + 0.02); g.add(front);
  const numCanvas = document.createElement("canvas"); numCanvas.width = 128; numCanvas.height = 128;
  const ctx = numCanvas.getContext("2d"); ctx.fillStyle = "#c8202c"; ctx.fillRect(0, 0, 128, 128); ctx.fillStyle = "#fff"; ctx.font = "bold 96px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(i + 1), 64, 70);
  const tex = new THREE.CanvasTexture(numCanvas); tex.colorSpace = THREE.SRGBColorSpace;
  for (const s of [-1, 1]) {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: tex }));
    plate.position.set(s * (W / 2 + 0.03), y0 + 2.6, 0); plate.rotation.y = s * Math.PI / 2; g.add(plate);
  }
  // 地板下設備
  const under = new THREE.Mesh(new THREE.BoxGeometry(W - 0.6, 0.45, L - 6), dark); under.position.set(0, y0 - 0.2, 0); g.add(under);
  return g;
}

function boxBogie() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.6, metalness: 0.3 });
  const wm = new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 0.4, metalness: 0.6 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.35, 2.9), m); frame.position.set(0, -1.032 + 0.62, 0); g.add(frame);
  for (const z of [1.086, -1.086]) for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.12, 24), wm);
    w.rotation.z = Math.PI / 2; w.position.set(s * 0.56, -1.032 + 0.43, z); g.add(w);
  }
  return g;
}

// 方塊人（與宣傳影片相同比例：身高約 1.76 m）
const SHIRTS = [0x3b6fd8, 0xd8463b, 0xe8b630, 0x3aa35b, 0x8a4fc8, 0xf2f2f2, 0x2c2c34, 0xe07a2e];
function blockPerson(i) {
  const g = new THREE.Group();
  const k = 0.875;
  const skin = new THREE.MeshLambertMaterial({ color: [0xf0c8a0, 0xc68a5a, 0x8d5a3b][i % 3] });
  const shirt = new THREE.MeshLambertMaterial({ color: SHIRTS[i % SHIRTS.length] });
  const pants = new THREE.MeshLambertMaterial({ color: [0x2a3550, 0x3a3a3a, 0x5b4632][i % 3] });
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w * k, h * k, d * k), mat); m.position.set(x * k, y * k, z * k); m.castShadow = true; return m; };
  g.add(box(0.5, 0.5, 0.5, skin, 0, 1.75, 0));
  g.add(box(0.5, 0.75, 0.25, shirt, 0, 1.125, 0));
  const limbs = [];
  const limb = (x, yTop, len, mat, sgn) => { const piv = new THREE.Group(); piv.position.set(x * k, yTop * k, 0); const m = box(0.25, len, 0.25, mat, 0, -len / 2, 0); piv.add(m); g.add(piv); limbs.push([piv, sgn]); };
  limb(-0.375, 1.45, 0.75, shirt, 1); limb(0.375, 1.45, 0.75, shirt, -1);
  limb(-0.125, 0.75, 0.75, pants, -1); limb(0.125, 0.75, 0.75, pants, 1);
  g.userData.limbs = limbs;
  return g;
}

// ---------------------------------------------------------------- 讀入的模型
async function buildModel(m) {
  const root = new THREE.Group();
  const texCache = {};
  const loadTex = (url) => {
    if (!url) return null;
    if (!texCache[url]) {
      const t = new THREE.TextureLoader().load(url);
      t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.anisotropy = 4;
      texCache[url] = t;
    }
    return texCache[url];
  };
  if (m.format === "obj") {
    const obj = new OBJLoader().parse(m.text);
    obj.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.6 }); o.userData.objName = o.name; } });
    root.add(obj);
    return root;
  }
  const { materials, meshes } = buildMqo(m.text);
  const mats = materials.map((mt) => {
    const url = m.textures[mt.name] || (mt.tex ? m.textures["file:" + mt.tex] : null) || m.textures["default"];
    const mode = (m.textureModes || {})[mt.name] || "";
    const tex = loadTex(url);
    const mat = new THREE.MeshStandardMaterial({ color: tex ? 0xffffff : new THREE.Color(mt.col[0], mt.col[1], mt.col[2]), map: tex, roughness: 0.6, metalness: 0.05,
      side: THREE.DoubleSide, alphaTest: 0.5 });
    if (/AlphaBlend/i.test(mode)) { mat.transparent = true; mat.alphaTest = 0.02; mat.depthWrite = false; }
    return mat;
  });
  const fallback = new THREE.MeshStandardMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
  for (const me of meshes) {
    for (const [mi, gdat] of Object.entries(me.groups)) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(gdat.pos, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(gdat.nrm, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(gdat.uv, 2));
      const mesh = new THREE.Mesh(g, mats[+mi] || fallback);
      mesh.userData.objName = me.name;
      root.add(mesh);
    }
  }
  return root;
}
