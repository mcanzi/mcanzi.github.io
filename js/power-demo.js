/* Interactive figures for the power analysis demo (content/demo/power.*.md), all simulated in the browser.
   Every figure is a <figure class="mlab plab" data-part="..."> filled in here (parts: sim, curve, design, posthoc).
   The effect size and sample size are shared by "sim" and "curve", so moving a slider in one moves it in both.
   Power formulas are exact: the two-sided two-sample t-test, through the noncentral t distribution. */
(() => {
  const I = JSON.parse(document.getElementById("plab-i18n").textContent);
  const TX = I.t, LOC = I.locale || "en-US";
  const NS = "http://www.w3.org/2000/svg";
  const ALPHA = 0.05;

  const pctF = new Intl.NumberFormat(LOC, { style: "percent", maximumFractionDigits: 0 });
  const pct = (v) => pctF.format(v);
  const nf = (v, d = 0) => v.toLocaleString(LOC, { minimumFractionDigits: d, maximumFractionDigits: d });
  const fill = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => (k in o ? o[k] : ""));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---------- distributions ----------
  const lgamma = (x) => {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t);
    let s = 1.000000000190015; for (const k of c) s += k / ++y;
    return -t + Math.log(2.5066282746310005 * s / x);
  };
  const betacf = (a, b, x) => {
    const FP = 1e-300, qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < FP) d = FP; d = 1 / d; let h = d;
    for (let m = 1; m <= 300; m++) {
      const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FP) d = FP; c = 1 + aa / c; if (Math.abs(c) < FP) c = FP; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FP) d = FP; c = 1 + aa / c; if (Math.abs(c) < FP) c = FP; d = 1 / d;
      const del = d * c; h *= del; if (Math.abs(del - 1) < 3e-14) break;
    }
    return h;
  };
  const ibeta = (x, a, b) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  };
  const pt = (t, df) => { const p = 0.5 * ibeta(df / (df + t * t), df / 2, 0.5); return t > 0 ? 1 - p : p; };
  const qtMemo = new Map();
  const qt = (p, df) => {
    const key = p + "|" + df; if (qtMemo.has(key)) return qtMemo.get(key);
    let lo = 0, hi = 400; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (pt(m, df) < p) lo = m; else hi = m; }
    qtMemo.set(key, (lo + hi) / 2); return (lo + hi) / 2;
  };
  const pnorm = (z0) => {
    const z = Math.abs(z0) / Math.SQRT2, t = 1 / (1 + 0.5 * z);
    const y = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
      t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return z0 >= 0 ? 1 - y / 2 : y / 2;
  };
  // P(T <= x) for the noncentral t: the normal CDF averaged over the distribution of sqrt(chi2 / df), Simpson's rule
  const pnct = (x, df, ncp) => {
    const sd = 1 / Math.sqrt(2 * df), lo = Math.max(1e-9, 1 - 14 * sd), hi = 1 + 14 * sd + 2 / df, N = 600, hs = (hi - lo) / N;
    const k = Math.log(2) + (df / 2) * Math.log(df / 2) - lgamma(df / 2);
    let s = 0;
    for (let i = 0; i <= N; i++) {
      const u = lo + i * hs;
      s += (i === 0 || i === N ? 1 : i % 2 ? 4 : 2) * Math.exp(k + (df - 1) * Math.log(u) - df * u * u / 2) * pnorm(x * u - ncp);
    }
    return s * hs / 3;
  };
  // power of the two-sided two-sample t-test with n per group, true difference d, SD sd
  const power2 = (n, d, sd = 1) => {
    if (n < 2) return ALPHA;
    const df = 2 * n - 2, tc = qt(1 - ALPHA / 2, df), ncp = (Math.abs(d) / sd) * Math.sqrt(n / 2);
    return Math.min(1, Math.max(0, 1 - pnct(tc, df, ncp) + pnct(-tc, df, ncp)));
  };
  const nFor = (target, d, sd = 1, max = 5000) => {
    if (power2(max, d, sd) < target) return null;
    let lo = 2, hi = max; while (hi - lo > 1) { const m = Math.floor((lo + hi) / 2); if (power2(m, d, sd) >= target) hi = m; else lo = m; }
    return hi;
  };
  let spare = null;
  const rnorm = () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0, v = 0; while (u === 0) u = Math.random(); v = Math.random();
    const r = Math.sqrt(-2 * Math.log(u)); spare = r * Math.sin(2 * Math.PI * v); return r * Math.cos(2 * Math.PI * v);
  };
  // a two-sample t-test (equal variances) on two arrays of summary values: mean difference and t
  const ttest = (ma, va, mb, vb, na, nb) => {
    const sp = ((na - 1) * va + (nb - 1) * vb) / (na + nb - 2);
    const est = ma - mb; return { est, t: est / Math.sqrt(sp * (1 / na + 1 / nb)) };
  };
  const meanVar = (xs) => {
    let m = 0; for (const x of xs) m += x; m /= xs.length;
    let v = 0; for (const x of xs) v += (x - m) ** 2; return [m, v / (xs.length - 1)];
  };

  // ---------- DOM and SVG helpers ----------
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e); return e;
  };
  const txt = (parent, x, y, s, attrs = {}) => { const t = el("text", { x, y, ...attrs }, parent); t.textContent = s; return t; };
  const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };
  const niceTicks = (lo, hi, n = 5) => {
    const span = hi - lo, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || mag * 10;
    const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  };
  const sizeSvg = (svg, ratio, minH = 240, maxH = 400) => {
    const W = Math.max(280, Math.round(svg.parentElement.clientWidth));
    const H = Math.round(Math.max(minH, Math.min(maxH, W * ratio)));
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("width", W); svg.setAttribute("height", H);
    clear(svg); return [W, H];
  };
  const syncers = [], renders = [];
  const renderAll = () => { syncers.forEach((f) => f()); renders.forEach((f) => f()); };

  const slider = (parent, label, min, max, step, get, set, fmt = (v) => nf(v)) => {
    const r = h("label", "filter-row plab-slider");
    r.appendChild(h("span", "filter-label mono", esc(label)));
    const inp = h("input"); inp.type = "range"; inp.min = min; inp.max = max; inp.step = step;
    const out = h("output", "mono");
    inp.addEventListener("input", () => { set(+inp.value); renderAll(); });
    r.appendChild(inp); r.appendChild(out);
    const sync = () => { inp.value = get(); out.textContent = fmt(get()); inp.setAttribute("aria-valuetext", fmt(get())); };
    syncers.push(sync); sync(); parent.appendChild(r); return inp;
  };
  const button = (parent, label, onClick) => {
    const b = h("button", "pill plab-run", esc(label)); b.type = "button";
    b.addEventListener("click", onClick); parent.appendChild(b); return b;
  };
  const scaffold = (fig, aria) => {
    const ctl = h("div", "mlab-controls"); fig.appendChild(ctl);
    const legend = h("div", "mlab-legend mono"); fig.appendChild(legend);
    const wrap = h("div", "mlab-plot"); fig.appendChild(wrap);
    const svg = el("svg", { class: "mlab-svg", role: "img", "aria-label": aria }, wrap);
    const rs = h("div", "mlab-rs mono plab-rs"); rs.setAttribute("aria-live", "polite"); fig.appendChild(rs);
    const status = h("p", "mlab-status mono"); fig.appendChild(status);
    return { ctl, legend, wrap, svg, rs, status };
  };
  const key = (shape, colour, label) => {
    const g = shape === "dash" ? `<line x1="0" y1="6" x2="16" y2="6" stroke="${colour}" stroke-width="2" stroke-dasharray="4 3"/>`
      : shape === "line" ? `<line x1="0" y1="6" x2="16" y2="6" stroke="${colour}" stroke-width="2.5"/>`
      : `<rect x="2" y="1" width="10" height="10" rx="2" fill="${colour}"/>`;
    return `<span><svg width="16" height="12" aria-hidden="true">${g}</svg> ${esc(label)}</span>`;
  };
  const yAxis = (svg, ticks, sy, L, R, fmt) => {
    for (const v of ticks) {
      el("line", { x1: L, x2: R, y1: sy(v), y2: sy(v), class: "mlab-grid" }, svg);
      txt(svg, L - 8, sy(v) + 4, fmt(v), { class: "mlab-tick", "text-anchor": "end" });
    }
  };
  const path = (pts) => pts.map(([x, y], i) => (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1)).join("");
  // run a simulation in batches, one per animation frame; a new run cancels the one before
  const runner = (total, batch, step, draw, done) => {
    let token = 0;
    return () => {
      const me = ++token; let k = 0;
      const tick = () => {
        if (me !== token) return;
        const m = Math.min(batch, total - k); for (let i = 0; i < m; i++) step(k + i); k += m;
        draw(k); if (k < total) requestAnimationFrame(tick); else if (done) done();
      };
      requestAnimationFrame(tick);
    };
  };
  const debounce = (f, ms) => { let t; return () => { clearTimeout(t); t = setTimeout(f, ms); }; };

  const S = { d: 0.3, n: 20 };
  const fmtD = (v) => nf(v, 2);

  // ---------- 1. many studies of one effect ----------
  const sim = (fig) => {
    const N = 2000;
    const ui = scaffold(fig, TX.sim_aria);
    slider(ui.ctl, TX.effect, 0.1, 1, 0.05, () => S.d, (v) => (S.d = v), fmtD);
    slider(ui.ctl, TX.per_group, 5, 150, 1, () => S.n, (v) => (S.n = v));
    const bar = h("div", "filter-row"); ui.ctl.appendChild(bar);
    ui.legend.innerHTML = key("box", "var(--c1)", TX.sig) + key("box", "var(--plab-ns)", TX.nonsig) +
      key("line", "var(--mist)", TX.true_effect) + key("dash", "var(--c2)", TX.sig_mean);
    let est = new Float64Array(N), sig = new Uint8Array(N), par = {};
    const step = (i) => {
      const n = par.n; let sa = 0, qa = 0, sb = 0, qb = 0;
      for (let j = 0; j < n; j++) { const a = rnorm() + par.d, b = rnorm(); sa += a; qa += a * a; sb += b; qb += b * b; }
      const ma = sa / n, mb = sb / n, r = ttest(ma, (qa - n * ma * ma) / (n - 1), mb, (qb - n * mb * mb) / (n - 1), n, n);
      est[i] = r.est; sig[i] = Math.abs(r.t) > par.tc ? 1 : 0;
    };
    const draw = (k) => {
      const [W, H] = sizeSvg(ui.svg, 0.5);
      const L = 52, R = W - 16, T = 18, B = H - 42;
      const se = Math.sqrt(2 / par.n), lo = Math.min(-0.25, par.d - 4.2 * se), hi = par.d + 4.2 * se;
      const nb = 44, bw = (hi - lo) / nb, cs = new Array(nb).fill(0), cn = new Array(nb).fill(0);
      let ks = 0, sumAbs = 0, wrong = 0;
      for (let i = 0; i < k; i++) {
        const b = Math.min(nb - 1, Math.max(0, Math.floor((est[i] - lo) / bw)));
        if (sig[i]) { cs[b]++; ks++; sumAbs += Math.abs(est[i]); if (est[i] < 0) wrong++; } else cn[b]++;
      }
      const peak = (N * bw) / (se * Math.sqrt(2 * Math.PI));
      const ymax = Math.max(peak * 1.12, ...cs.map((c, i) => c + cn[i]));
      const sx = (v) => L + ((v - lo) / (hi - lo)) * (R - L), sy = (v) => B - (v / ymax) * (B - T);
      yAxis(ui.svg, niceTicks(0, ymax, 4), sy, L, R, (v) => nf(v));
      const tk = niceTicks(lo, hi, 6), st = tk[1] - tk[0], dec = st >= 1 ? 0 : Math.abs(st * 10 - Math.round(st * 10)) < 1e-9 ? 1 : 2;
      for (const v of tk) txt(ui.svg, sx(v), B + 18, nf(v, dec), { class: "mlab-tick", "text-anchor": "middle" });
      txt(ui.svg, (L + R) / 2, H - 6, TX.sim_x, { class: "mlab-axis", "text-anchor": "middle" });
      txt(ui.svg, L + 6, T + 2, TX.studies_y, { class: "mlab-hint" });
      for (let b = 0; b < nb; b++) {
        const x = sx(lo + b * bw) + 0.5, w = Math.max(1, sx(lo + (b + 1) * bw) - sx(lo + b * bw) - 1);
        if (cn[b]) el("rect", { x, y: sy(cn[b]), width: w, height: B - sy(cn[b]), fill: "var(--plab-ns)" }, ui.svg);
        if (cs[b]) el("rect", { x, y: sy(cn[b] + cs[b]), width: w, height: sy(cn[b]) - sy(cn[b] + cs[b]), fill: "var(--c1)" }, ui.svg);
      }
      el("line", { x1: sx(0), x2: sx(0), y1: T, y2: B, class: "mlab-zero" }, ui.svg);
      el("line", { x1: sx(par.d), x2: sx(par.d), y1: T, y2: B, stroke: "var(--mist)", "stroke-width": 2 }, ui.svg);
      const exag = ks ? sumAbs / ks / par.d : null;
      if (ks) el("line", { x1: sx(sumAbs / ks), x2: sx(sumAbs / ks), y1: T, y2: B, stroke: "var(--c2)", "stroke-width": 2, "stroke-dasharray": "6 4" }, ui.svg);
      ui.rs.innerHTML =
        `<span>${esc(TX.power)}: <strong>${pct(ks / k)}</strong> (${esc(TX.formula)}: ${pct(par.pow)})</span>` +
        `<span>${esc(TX.type_m)}: <strong>${exag ? fill(TX.times, { x: nf(exag, 1) }) : "–"}</strong></span>` +
        `<span>${esc(TX.type_s)}: <strong>${ks ? pct(wrong / ks) : "–"}</strong></span>`;
      ui.status.textContent = fill(TX.sim_status, { k: nf(k), n: par.n, d: fmtD(par.d) });
    };
    const run = runner(N, 100, step, draw);
    const start = () => { par = { d: S.d, n: S.n, tc: qt(1 - ALPHA / 2, 2 * S.n - 2), pow: power2(S.n, S.d) }; run(); };
    button(bar, TX.again, start);
    let last = "";
    renders.push(() => { const k = S.d + "|" + S.n; if (k !== last) { last = k; start(); } else if (par.n) draw(N); });
  };

  // ---------- 2. power against sample size ----------
  const curveCache = new Map();
  const curveFor = (d) => {
    const k = d.toFixed(2); if (curveCache.has(k)) return curveCache.get(k);
    const c = []; for (let n = 2; n <= 200; n += n < 40 ? 1 : 2) c.push([n, power2(n, d)]);
    curveCache.set(k, c); return c;
  };
  const curve = (fig) => {
    const ui = scaffold(fig, TX.curve_aria);
    slider(ui.ctl, TX.effect, 0.1, 1, 0.05, () => S.d, (v) => (S.d = v), fmtD);
    slider(ui.ctl, TX.per_group, 5, 150, 1, () => S.n, (v) => (S.n = v));
    ui.legend.innerHTML = key("line", "var(--c3)", TX.your_d) + key("line", "var(--muted)", TX.ref_d) + key("dash", "var(--muted)", TX.target);
    let drag = false;
    const draw = () => {
      const [W, H] = sizeSvg(ui.svg, 0.5);
      const L = 52, R = W - 20, T = 18, B = H - 42;
      const sx = (n) => L + ((n - 2) / 198) * (R - L), sy = (p) => B - p * (B - T);
      yAxis(ui.svg, [0, 0.2, 0.4, 0.6, 0.8, 1], sy, L, R, pct);
      for (const v of [2, 25, 50, 75, 100, 125, 150, 175, 200]) txt(ui.svg, sx(v), B + 18, nf(v), { class: "mlab-tick", "text-anchor": "middle" });
      txt(ui.svg, (L + R) / 2, H - 6, TX.curve_x, { class: "mlab-axis", "text-anchor": "middle" });
      txt(ui.svg, L + 6, T + 2, TX.power_y, { class: "mlab-hint" });
      el("line", { x1: L, x2: R, y1: sy(0.8), y2: sy(0.8), stroke: "var(--muted)", "stroke-width": 1.5, "stroke-dasharray": "6 4" }, ui.svg);
      for (const d of [0.2, 0.5, 0.8]) {
        const c = curveFor(d);
        el("path", { d: path(c.map(([n, p]) => [sx(n), sy(p)])), fill: "none", stroke: "var(--muted)", "stroke-width": 1.2, opacity: 0.7 }, ui.svg);
        const lab = c.find(([n, p]) => p > 0.5 && n < 160);
        if (lab) txt(ui.svg, sx(lab[0]) + 6, sy(lab[1]) + 4, "d = " + nf(d, 1), { class: "mlab-hint" });
        else { const e = c[c.length - 1]; txt(ui.svg, sx(e[0]) - 4, sy(e[1]) - 8, "d = " + nf(d, 1), { class: "mlab-hint", "text-anchor": "end" }); }
      }
      const c = curveFor(S.d);
      el("path", { d: path(c.map(([n, p]) => [sx(n), sy(p)])), fill: "none", stroke: "var(--c3)", "stroke-width": 3 }, ui.svg);
      const p = power2(S.n, S.d), n80 = nFor(0.8, S.d);
      if (n80 && n80 <= 200) {
        el("line", { x1: sx(n80), x2: sx(n80), y1: sy(0.8), y2: B, stroke: "var(--c3)", "stroke-width": 1, "stroke-dasharray": "3 3" }, ui.svg);
        el("circle", { cx: sx(n80), cy: sy(0.8), r: 4, fill: "var(--c3)" }, ui.svg);
      }
      el("line", { x1: sx(S.n), x2: sx(S.n), y1: T, y2: B, stroke: "var(--c2)", "stroke-width": 1.5 }, ui.svg);
      el("circle", { cx: sx(S.n), cy: sy(p), r: 7, fill: "var(--c2)", stroke: "var(--understory)", "stroke-width": 2 }, ui.svg);
      const right = sx(S.n) > (L + R) / 2;
      txt(ui.svg, sx(S.n) + (right ? -12 : 12), sy(p) - 12, pct(p), { class: "mlab-cat", "text-anchor": right ? "end" : "start" });
      const hit = el("rect", { x: L, y: T, width: R - L, height: B - T, fill: "transparent", style: "cursor: ew-resize; touch-action: pan-y" }, ui.svg);
      const setN = (e) => {
        const r = ui.svg.getBoundingClientRect(), x = (e.clientX - r.left) * (W / r.width);
        S.n = Math.round(Math.min(150, Math.max(5, 2 + ((x - L) / (R - L)) * 198))); renderAll();
      };
      hit.addEventListener("pointerdown", (e) => { drag = true; hit.setPointerCapture(e.pointerId); setN(e); });
      hit.addEventListener("pointermove", (e) => { if (drag) setN(e); });
      hit.addEventListener("pointerup", () => { drag = false; });
      ui.rs.innerHTML = `<span>${esc(fill(TX.curve_now, { n: S.n, d: fmtD(S.d) }))}: <strong>${pct(p)}</strong></span>` +
        `<span>${esc(TX.n80)}: <strong>${n80 ? nf(n80) : fill(TX.over, { n: nf(5000) })}</strong></span>`;
      ui.status.textContent = TX.curve_help;
    };
    renders.push(draw);
  };

  // ---------- 3. participants or words ----------
  const D3 = { P: 30, W: 40, b: 10, sdP: 12 };
  const SIGMA = 70, FREQ_VAR = 25 / 12, SLOPE = -30;
  const slopeSd = (W) => Math.sqrt(D3.sdP ** 2 + SIGMA ** 2 / ((W - 1) * FREQ_VAR));
  const powDesign = (P, W) => power2(Math.floor(P / 2), D3.b, slopeSd(W));
  const design = (fig) => {
    const NS_ = 1000;
    const ui = scaffold(fig, TX.design_aria);
    slider(ui.ctl, TX.participants, 10, 200, 2, () => D3.P, (v) => (D3.P = v));
    slider(ui.ctl, TX.words, 10, 200, 5, () => D3.W, (v) => (D3.W = v));
    slider(ui.ctl, TX.interaction, 2, 30, 1, () => D3.b, (v) => (D3.b = v), (v) => fill(TX.ms_unit, { v: nf(v) }));
    slider(ui.ctl, TX.slope_sd, 0, 40, 1, () => D3.sdP, (v) => (D3.sdP = v), (v) => fill(TX.ms_unit, { v: nf(v) }));
    const bar = h("div", "filter-row"); ui.ctl.appendChild(bar);
    ui.legend.innerHTML = key("line", "var(--c3)", TX.more_part) + key("line", "var(--c4)", TX.more_words) + key("dash", "var(--muted)", TX.target);
    let simOut = "";
    const draw = () => {
      const [W, H] = sizeSvg(ui.svg, 0.48, 250, 380);
      const L = 52, R = W - 20, T = 18, B = H - 42;
      const sx = (v) => L + ((v - 10) / 190) * (R - L), sy = (p) => B - p * (B - T);
      yAxis(ui.svg, [0, 0.2, 0.4, 0.6, 0.8, 1], sy, L, R, pct);
      for (const v of [10, 50, 100, 150, 200]) txt(ui.svg, sx(v), B + 18, nf(v), { class: "mlab-tick", "text-anchor": "middle" });
      txt(ui.svg, (L + R) / 2, H - 6, TX.design_x, { class: "mlab-axis", "text-anchor": "middle" });
      txt(ui.svg, L + 6, T + 2, TX.power_y, { class: "mlab-hint" });
      el("line", { x1: L, x2: R, y1: sy(0.8), y2: sy(0.8), stroke: "var(--muted)", "stroke-width": 1.5, "stroke-dasharray": "6 4" }, ui.svg);
      const cp = [], cw = [];
      for (let v = 10; v <= 200; v += 4) { cp.push([sx(v), sy(powDesign(v, D3.W))]); cw.push([sx(v), sy(powDesign(D3.P, v))]); }
      el("path", { d: path(cp), fill: "none", stroke: "var(--c3)", "stroke-width": 3 }, ui.svg);
      el("path", { d: path(cw), fill: "none", stroke: "var(--c4)", "stroke-width": 3 }, ui.svg);
      const p = powDesign(D3.P, D3.W);
      el("circle", { cx: sx(D3.P), cy: sy(p), r: 7, fill: "var(--c3)", stroke: "var(--understory)", "stroke-width": 2 }, ui.svg);
      el("circle", { cx: sx(D3.W), cy: sy(p), r: 7, fill: "var(--c4)", stroke: "var(--understory)", "stroke-width": 2 }, ui.svg);
      const ceil = power2(Math.floor(D3.P / 2), D3.b, D3.sdP || 1e-6);
      ui.rs.innerHTML = `<span>${esc(fill(TX.design_now, { p: D3.P, w: D3.W }))}: <strong>${pct(p)}</strong></span>` +
        `<span>${esc(fill(TX.ceiling, { p: D3.P }))}: <strong>${pct(ceil)}</strong></span>` + simOut;
      ui.status.textContent = TX.design_help;
    };
    let par = {}, hits = 0;
    const step = () => {
      let sxx = 0, m = 0; const xs = new Float64Array(par.W);
      for (let i = 0; i < par.W; i++) { xs[i] = 1 + 5 * Math.random(); m += xs[i]; }
      m /= par.W; for (let i = 0; i < par.W; i++) sxx += (xs[i] - m) ** 2;
      const noise = SIGMA / Math.sqrt(sxx), a = [], b = [];
      for (let j = 0; j < par.P; j++) {
        const g = j % 2 ? 0.5 : -0.5;
        (g < 0 ? a : b).push(SLOPE - par.b * g + par.sdP * rnorm() + noise * rnorm());
      }
      const [ma, va] = meanVar(a), [mb, vb] = meanVar(b);
      if (Math.abs(ttest(ma, va, mb, vb, a.length, b.length).t) > par.tc) hits++;
    };
    const run = runner(NS_, 25, step, (k) => {
      const ps = hits / k, moe = 1.96 * Math.sqrt(ps * (1 - ps) / k);
      simOut = `<span>${esc(fill(TX.simulated, { k: nf(k) }))}: <strong>${pct(ps)}</strong> ± ${nf(100 * moe, 1)} ${esc(TX.pp)}</span>`;
      draw();
    });
    const btn = button(bar, fill(TX.simulate, { k: nf(NS_) }), () => {
      par = { ...D3, tc: qt(1 - ALPHA / 2, D3.P - 2) }; hits = 0; run();
    });
    btn.classList.add("plab-simulate");
    let last = "";
    renders.push(() => { const k = JSON.stringify(D3); if (k !== last) { last = k; simOut = ""; } draw(); });
  };

  // ---------- 4. post hoc power ----------
  const P4 = { d: 0.4, n: 25 };
  const posthoc = (fig) => {
    const N = 1000;
    const ui = scaffold(fig, TX.ph_aria);
    slider(ui.ctl, TX.true_effect, 0, 1, 0.05, () => P4.d, (v) => (P4.d = v), fmtD);
    slider(ui.ctl, TX.per_group, 5, 100, 1, () => P4.n, (v) => (P4.n = v));
    const bar = h("div", "filter-row"); ui.ctl.appendChild(bar);
    ui.legend.innerHTML = key("box", "var(--c3)", TX.one_study) + key("line", "var(--c1)", TX.true_power) + key("dash", "var(--muted)", "p = .05");
    const pv = new Float64Array(N), ph = new Float64Array(N); let par = {};
    const step = (i) => {
      const n = par.n; let sa = 0, qa = 0, sb = 0, qb = 0;
      for (let j = 0; j < n; j++) { const a = rnorm() + par.d, b = rnorm(); sa += a; qa += a * a; sb += b; qb += b * b; }
      const ma = sa / n, mb = sb / n, r = ttest(ma, (qa - n * ma * ma) / (n - 1), mb, (qb - n * mb * mb) / (n - 1), n, n);
      const t = Math.abs(r.t);
      pv[i] = 2 * (1 - pt(t, par.df));
      ph[i] = power2(n, t * Math.sqrt(2 / n));
    };
    const draw = (k) => {
      const [W, H] = sizeSvg(ui.svg, 0.55);
      const L = 52, R = W - 20, T = 18, B = H - 42;
      const sx = (v) => L + v * (R - L), sy = (v) => B - v * (B - T);
      yAxis(ui.svg, [0, 0.2, 0.4, 0.6, 0.8, 1], sy, L, R, pct);
      for (const v of [0, 0.2, 0.4, 0.6, 0.8, 1]) txt(ui.svg, sx(v), B + 18, nf(v, v % 1 ? 1 : 0), { class: "mlab-tick", "text-anchor": "middle" });
      txt(ui.svg, (L + R) / 2, H - 6, TX.ph_x, { class: "mlab-axis", "text-anchor": "middle" });
      txt(ui.svg, L + 6, T + 2, TX.ph_y, { class: "mlab-hint" });
      el("line", { x1: sx(0.05), x2: sx(0.05), y1: T, y2: B, stroke: "var(--muted)", "stroke-width": 1.5, "stroke-dasharray": "6 4" }, ui.svg);
      const g = el("g", { fill: "var(--c3)", "fill-opacity": 0.45 }, ui.svg);
      for (let i = 0; i < k; i++) el("circle", { cx: sx(pv[i]).toFixed(1), cy: sy(ph[i]).toFixed(1), r: 2.6 }, g);
      el("line", { x1: L, x2: R, y1: sy(par.pow), y2: sy(par.pow), stroke: "var(--c1)", "stroke-width": 2.5 }, ui.svg);
      txt(ui.svg, R - 4, sy(par.pow) + (par.pow > 0.85 ? 16 : -7), fill(TX.true_power_is, { p: pct(par.pow) }), { class: "mlab-cat", "text-anchor": "end", style: "fill: var(--c1)" });
      let lo = 1, hi = 0, sig = 0; for (let i = 0; i < k; i++) { lo = Math.min(lo, ph[i]); hi = Math.max(hi, ph[i]); if (pv[i] < ALPHA) sig++; }
      ui.rs.innerHTML = `<span>${esc(TX.true_power)}: <strong>${pct(par.pow)}</strong></span>` +
        `<span>${esc(TX.ph_range)}: <strong>${pct(lo)}–${pct(hi)}</strong></span>` +
        `<span>${esc(TX.ph_at05)}: <strong>${pct(par.at05)}</strong></span>`;
      ui.status.textContent = fill(TX.ph_status, { k: nf(k), sig: nf(sig), n: par.n, d: fmtD(par.d) });
    };
    const run = runner(N, 50, step, draw);
    const start = () => {
      const df = 2 * P4.n - 2;
      par = { ...P4, df, pow: power2(P4.n, P4.d), at05: power2(P4.n, qt(1 - ALPHA / 2, df) * Math.sqrt(2 / P4.n)) };
      run();
    };
    button(bar, TX.again, start);
    let last = "";
    const later = debounce(start, 150);
    renders.push(() => { const k = P4.d + "|" + P4.n; if (k !== last) { const first = !last; last = k; first ? start() : later(); } else if (par.n) draw(N); });
  };

  const parts = { sim, curve, design, posthoc };
  document.querySelectorAll(".plab[data-part]").forEach((fig) => { const f = parts[fig.dataset.part]; if (f) f(fig); });
  renderAll();
  let rt; let lastW = window.innerWidth;
  window.addEventListener("resize", () => { if (window.innerWidth === lastW) return; lastW = window.innerWidth; clearTimeout(rt); rt = setTimeout(renderAll, 120); });
})();
