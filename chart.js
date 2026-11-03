/* Hand-drawn canvas charts. No chart library. devicePixelRatio aware. */
(function () {
  const RM = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const C = { green: "#00d35a", red: "#ff453a", blue: "#0a84ff", orange: "#ff9f0a", sec: "rgba(235,235,245,0.6)",
    ter: "rgba(235,235,245,0.3)", sep: "rgba(84,84,88,0.55)" };
  const FONT = '600 12px -apple-system, "SF Pro Text", system-ui, sans-serif';

  function setup(cv) {
    const dpr = window.devicePixelRatio || 1, r = cv.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    return { g, w, h };
  }
  function dashed(g, x0, x1, y, color, dash) {
    g.save(); g.strokeStyle = color; g.lineWidth = 1; g.setLineDash(dash || [4, 4]);
    g.beginPath(); g.moveTo(x0, Math.round(y) + .5); g.lineTo(x1, Math.round(y) + .5); g.stroke(); g.restore();
  }

  /* opts: points [[ts,value]], start (number), marks [{ts,value,text,color,key}] */
  function line(cv, opts) {
    const st = cv._st || (cv._st = { lastTs: null, seen: new Set(), raf: 0 });
    const pts = (opts.points || []).slice();
    const prevLast = st.lastTs, newLast = pts.length ? pts[pts.length - 1][0] : null;
    const grow = !RM() && prevLast != null && newLast != null && newLast > prevLast && pts.length > 2;
    st.lastTs = newLast;
    const fresh = (opts.marks || []).filter(m => !st.seen.has(m.key));
    (opts.marks || []).forEach(m => st.seen.add(m.key));
    const t0 = performance.now();
    cancelAnimationFrame(st.raf);
    const frame = now => {
      const p = grow ? Math.min(1, (now - t0) / 250) : 1;
      const a = RM() ? 1 : Math.min(1, (now - t0) / 200);
      drawLine(cv, pts, opts, p, a, new Set(fresh.map(m => m.key)));
      if (p < 1 || a < 1) st.raf = requestAnimationFrame(frame);
    };
    frame(t0 + (RM() ? 1e6 : 0));
    if (!RM()) st.raf = requestAnimationFrame(frame);
  }

  function drawLine(cv, pts, opts, p, alpha, freshKeys) {
    const { g, w, h } = setup(cv);
    const top = 64, bot = h - 12, start = opts.start;
    if (pts.length < 2) { if (start != null || opts.empty) dashed(g, 0, w, (top + bot) / 2, C.ter, [5, 5]); return; }
    let vs = pts.map(q => q[1]).concat(start != null ? [start] : []);
    (opts.marks || []).forEach(m => vs.push(m.value));
    let lo = Math.min(...vs), hi = Math.max(...vs);
    if (hi - lo < 1e-9) { hi += Math.abs(hi) * 0.01 + 1; lo -= Math.abs(lo) * 0.01 + 1; }
    const t0 = pts[0][0];
    let t1 = pts[pts.length - 1][0];
    // slide: interpolate time axis end from previous last point to the new one
    const tPrev = pts[pts.length - 2][0];
    const tEnd = tPrev + (t1 - tPrev) * p;
    const X = t => (t - t0) / Math.max(1e-9, tEnd - t0) * (w - 2) + 1;
    const Y = v => bot - (v - lo) / (hi - lo) * (bot - top);
    const shown = pts.slice(0, -1).concat([[tEnd, pts[pts.length - 2][1] + (pts[pts.length - 1][1] - pts[pts.length - 2][1]) * p]]);
    if (start != null) dashed(g, 0, w, Y(start), C.ter, [4, 4]);
    // fill
    const grd = g.createLinearGradient(0, top, 0, bot);
    grd.addColorStop(0, "rgba(0,211,90,0.28)"); grd.addColorStop(1, "rgba(0,211,90,0)");
    g.beginPath(); shown.forEach((q, i) => i ? g.lineTo(X(q[0]), Y(q[1])) : g.moveTo(X(q[0]), Y(q[1])));
    g.lineTo(X(shown[shown.length - 1][0]), bot); g.lineTo(X(shown[0][0]), bot); g.closePath(); g.fillStyle = grd; g.fill();
    g.beginPath(); shown.forEach((q, i) => i ? g.lineTo(X(q[0]), Y(q[1])) : g.moveTo(X(q[0]), Y(q[1])));
    g.strokeStyle = C.green; g.lineWidth = 2; g.lineJoin = "round"; g.lineCap = "round"; g.stroke();
    const lp = shown[shown.length - 1];
    g.beginPath(); g.arc(X(lp[0]), Y(lp[1]), 4, 0, 7); g.fillStyle = C.green; g.fill();
    // marks: above the line, never overlap; a later mark moves up a row
    g.font = FONT; g.textBaseline = "alphabetic";
    const placed = [], RH = 18;
    (opts.marks || []).filter(m => m.ts >= t0 && m.ts <= tEnd).sort((a, b) => a.ts - b.ts).forEach(m => {
      const x = X(m.ts), y = Y(m.value), tw = g.measureText(m.text).width;
      let lx = Math.min(Math.max(2, x - tw / 2), w - tw - 2), row = 0, ly;
      for (;;) {
        ly = Math.max(14, y - 10) - row * RH;
        const box = [lx - 3, ly - 12, lx + tw + 3, ly + 3];
        if (!placed.some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) { placed.push(box); break; }
        row++; if (row > 12) break;
      }
      g.save(); g.globalAlpha = freshKeys.has(m.key) ? alpha : 1;
      g.fillStyle = m.color; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill();
      g.strokeStyle = m.color; g.globalAlpha *= .5; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x, ly + 4); g.stroke();
      g.globalAlpha = freshKeys.has(m.key) ? alpha : 1; g.fillText(m.text, lx, ly); g.restore();
    });
  }

  /* candles [[t,o,h,l,c,v]], lines [{value,color,label}] */
  function candles(cv, opts) {
    const { g, w, h } = setup(cv);
    const cs = opts.candles || [], ph = h * 0.74, vt = h * 0.80, vb = h - 2;
    if (!cs.length) return;
    let lo = Math.min(...cs.map(c => c[3])), hi = Math.max(...cs.map(c => c[2]));
    (opts.lines || []).forEach(l => { if (l.value != null) { lo = Math.min(lo, l.value); hi = Math.max(hi, l.value); } });
    if (hi - lo <= 0) { hi *= 1.01; lo *= 0.99; }
    const pad = (hi - lo) * 0.08; hi += pad; lo -= pad;
    const Y = v => 8 + (hi - v) / (hi - lo) * (ph - 8);
    const n = Math.max(cs.length, 20), cw = (w - 8) / n, bw = Math.max(1, cw * 0.62);
    const vmax = Math.max(1e-9, ...cs.map(c => c[5] || 0));
    cs.forEach((c, i) => {
      const x = 4 + (n - cs.length + i) * cw + cw / 2, up = c[4] >= c[1], col = up ? C.green : C.red;
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1;
      g.beginPath(); g.moveTo(Math.round(x) + .5, Y(c[2])); g.lineTo(Math.round(x) + .5, Y(c[3])); g.stroke();
      const y0 = Y(Math.max(c[1], c[4])), y1 = Y(Math.min(c[1], c[4]));
      g.fillRect(x - bw / 2, y0, bw, Math.max(1, y1 - y0));
      const vh = (c[5] || 0) / vmax * (vb - vt);
      g.globalAlpha = .45; g.fillRect(x - bw / 2, vb - vh, bw, vh); g.globalAlpha = 1;
    });
    g.font = FONT;
    (opts.lines || []).forEach(l => {
      if (l.value == null) return;
      const y = Y(l.value); dashed(g, 0, w, y, l.color, [6, 4]);
      if (l.label) { g.fillStyle = l.color; g.fillText(l.label, 6, y - 5); }
    });
  }

  function ring(cv, score, min) {
    const { g, w, h } = setup(cv), r = Math.min(w, h) / 2 - 6, cx = w / 2, cy = h / 2;
    g.lineWidth = 8; g.lineCap = "round"; g.strokeStyle = "#2c2c2e";
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    if (score == null) return;
    g.strokeStyle = score >= (min || 70) ? C.green : (score >= 40 ? "#ffd60a" : C.red);
    g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(100, score)) / 100); g.stroke();
    g.fillStyle = "#fff"; g.font = '600 26px -apple-system, "SF Pro Display", system-ui'; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(String(Math.round(score)), cx, cy + 1);
  }
  window.Charts = { line, candles, ring, C };
})();
