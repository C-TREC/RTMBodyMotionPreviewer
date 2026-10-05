// 圖表：五個通道（側滾、橫移、俯仰、前後、上下）的整段時間曲線、目前時間游標、事件標記與比較基準
import { t, tri } from "./i18n.js";

export const CHANNELS = [
  { key: "roll", unit: "°", scale: 1, digits: 2, color: "#5cc8ff", min: 0.1 },
  { key: "sway", unit: "cm", scale: 100, digits: 2, color: "#ffb347", min: 0.005 },
  { key: "pitch", unit: "°", scale: 1, digits: 3, color: "#b18cff", min: 0.05 },
  { key: "shift", unit: "mm", scale: 1000, digits: 1, color: "#ff7a8a", min: 0.002 },
  { key: "bounce", unit: "mm", scale: 1000, digits: 1, color: "#9be08a", min: 0.002 },
];

export class Charts {
  constructor(canvas, onSeek) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onSeek = onSeek;
    this.series = null; this.ref = null; this.markers = []; this.duration = 1; this.time = 0;
    this.visible = CHANNELS.map(() => true);
    canvas.addEventListener("mousedown", (e) => this._seek(e));
    canvas.addEventListener("mousemove", (e) => { if (e.buttons & 1) this._seek(e); });
    new ResizeObserver(() => this.draw()).observe(canvas.parentElement);
  }
  _x0() { return 108; }
  _seek(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left, w = r.width - this._x0() - 14;
    this.onSeek(Math.min(Math.max((x - this._x0()) / w, 0), 1) * this.duration);
  }
  // series：{t: Float32Array, ch: [Float32Array × 5]}
  set(series, markers, duration) { this.series = series; this.markers = markers || []; this.duration = duration; this.draw(); }
  setRef(ref) { this.ref = ref; this.draw(); }
  setTime(tm) { this.time = tm; this.draw(); }

  draw() {
    const c = this.canvas, p = c.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const W = p.clientWidth, H = p.clientHeight;
    if (!W || !H) return;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = W + "px"; c.style.height = H + "px"; }
    const g = this.ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!this.series) return;
    const chans = CHANNELS.map((ch, i) => [ch, i]).filter(([, i]) => this.visible[i]);
    const x0 = this._x0(), x1 = W - 14, top = 8, bottom = H - 20;
    const rowH = (bottom - top) / Math.max(chans.length, 1);
    const X = (tm) => x0 + (tm / this.duration) * (x1 - x0);
    // 事件標記
    g.font = "11px 'Segoe UI', 'Noto Sans TC', sans-serif";
    for (const m of this.markers) {
      const x = X(m.t);
      g.strokeStyle = "rgba(255,255,255,0.18)"; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(x, top); g.lineTo(x, bottom); g.stroke(); g.setLineDash([]);
      g.fillStyle = "rgba(255,255,255,0.6)"; g.fillText(tri(m.label), x + 3, top + 11);
    }
    // 時間軸刻度
    g.fillStyle = "rgba(255,255,255,0.4)";
    const step = this.duration > 60 ? 10 : this.duration > 20 ? 5 : 2;
    for (let s = 0; s <= this.duration + 1e-6; s += step) { const x = X(s); g.fillRect(x, bottom, 1, 4); g.fillText(s + "s", x - 6, H - 3); }
    chans.forEach(([ch, i], r) => {
      const y0 = top + r * rowH, h = rowH - 6, ym = y0 + h / 2;
      const data = this.series.ch[i], ref = this.ref && this.ref.duration === this.duration ? this.ref.ch[i] : null;
      let amax = ch.min;                 // 顯示範圍下限，避免接近 0 的通道被放大成雜訊
      for (const v of data) amax = Math.max(amax, Math.abs(v));
      if (ref) for (const v of ref) amax = Math.max(amax, Math.abs(v));
      amax = niceMax(amax * ch.scale) / ch.scale;
      g.fillStyle = "rgba(255,255,255,0.035)"; g.fillRect(x0, y0, x1 - x0, h);
      g.strokeStyle = "rgba(255,255,255,0.14)"; g.beginPath(); g.moveTo(x0, ym); g.lineTo(x1, ym); g.stroke();
      // 標籤與目前數值
      const n = data.length, idx = Math.min(n - 1, Math.max(0, Math.round((this.time / this.duration) * (n - 1))));
      g.fillStyle = ch.color; g.font = "bold 13px 'Segoe UI', 'Noto Sans TC', sans-serif";
      g.fillText(t(ch.key), 10, y0 + 15);
      g.fillStyle = "#fff"; g.font = "12px Consolas, monospace";
      const v = data[idx] * ch.scale;
      g.fillText((v >= 0 ? "+" : "") + v.toFixed(ch.digits) + " " + ch.unit, 10, y0 + 31);
      g.fillStyle = "rgba(255,255,255,0.4)"; g.font = "10px Consolas, monospace";
      g.fillText("±" + (amax * ch.scale).toPrecision(2) + ch.unit, 10, y0 + 45);
      const Y = (val) => ym - (val / amax) * (h / 2 - 2);
      const line = (arr, color, width, dash) => {
        g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash || []);
        g.beginPath();
        const m = arr.length, stepPx = Math.max(1, Math.floor(m / (x1 - x0) / 2));
        for (let k = 0; k < m; k += stepPx) { const x = x0 + (k / (m - 1)) * (x1 - x0), y = Y(arr[k]); k ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke(); g.setLineDash([]); g.lineWidth = 1;
      };
      if (ref) line(ref, "rgba(200,200,200,0.55)", 1.5, [5, 3]);
      line(data, ch.color, 1.7);
    });
    // 目前時間
    const xc = X(this.time);
    g.strokeStyle = "#fff"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(xc, top); g.lineTo(xc, bottom); g.stroke(); g.lineWidth = 1;
  }
}

function niceMax(v) {
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * e) return m * e;
  return 10 * e;
}
