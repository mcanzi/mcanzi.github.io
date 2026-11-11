/* Interactive figures for the face-mask demo (content/demo/masks.*.md).
   Data: data/maskstudy.json (made by tools/make_maskstudy.py), embedded by the mask-lab shortcode.
   Every figure is a <figure class="mlab" data-part="..."> filled in here; the listener and device
   filters are shared, so changing them in one figure changes them in all. */
(() => {
  const D = JSON.parse(document.getElementById("mlab-data").textContent);
  const I = JSON.parse(document.getElementById("mlab-i18n").textContent);
  const TX = I.t, LOC = I.locale || "en-US";
  const NS = "http://www.w3.org/2000/svg";
  const FR = ["f", "t", "s", "h"], RESP = ["f", "t", "s", "h", "x"];
  const IPA = { f: "/f/", t: "/θ/", s: "/s/", h: "/ʃ/", x: TX.none };
  const EG = { f: "fie", t: "thigh", s: "sigh", h: "shy" };
  const COL = { f: "var(--pandan)", t: "var(--hornbill)", s: "var(--kingfisher)", h: "var(--orchid)" };
  const C = ["nm", "wm"];
  const RT_MIN = 150, RT_MAX = 5000;
  const S = { lis: "all", dev: "all" };
  const syncers = [], renders = [];
  const items = D.items, people = D.people;

  const pctF = new Intl.NumberFormat(LOC, { style: "percent", maximumFractionDigits: 0 });
  const pct1F = new Intl.NumberFormat(LOC, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const pct = (v) => pctF.format(v);
  const pct1 = (v) => pct1F.format(v);
  const nf = (v, d = 0) => v.toLocaleString(LOC, { minimumFractionDigits: d, maximumFractionDigits: d });
  const signed = (v, d = 1) => (v > 0 ? "+" : v < 0 ? "−" : "±") + nf(Math.abs(v), d);
  const fill = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => (k in o ? o[k] : ""));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---------- data helpers ----------
  const keepPerson = (p) => (S.lis === "all" || (S.lis === "th") === (p.th === 1)) && (S.dev === "all" || p.dev === S.dev);
  const chosen = () => people.map((p, i) => i).filter((i) => keepPerson(people[i]));
  const itemPred = (st) => (it) =>
    (!st.pos || st.pos === "all" || it.pos === st.pos) && (!st.comp || st.comp === "all" || String(it.comp) === st.comp);
  const idxOf = (pred) => items.map((it, i) => i).filter((i) => pred(items[i]));

  const accPerson = (p, c, ii) => {
    if (!ii.length) return null;
    const s = D.resp[c][p]; let k = 0;
    for (const i of ii) if (s[i] === items[i].t) k++;
    return k / ii.length;
  };
  const rtPerson = (p, c, ii) => {
    const s = D.resp[c][p], r = D.rt[c][p]; let sum = 0, n = 0;
    for (const i of ii) if (s[i] === items[i].t && r[i] >= RT_MIN && r[i] <= RT_MAX) { sum += Math.log(r[i]); n++; }
    return n ? Math.exp(sum / n) : null;
  };
  const summary = (vals) => {
    const v = vals.filter((x) => x !== null);
    const n = v.length; if (!n) return null;
    const m = v.reduce((a, b) => a + b, 0) / n;
    const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)) : 0;
    return { m, se: sd / Math.sqrt(n), n, v };
  };
  const itemAcc = (i, c, ps) => { let k = 0; for (const p of ps) if (D.resp[c][p][i] === items[i].t) k++; return ps.length ? k / ps.length : null; };
  const itemRt = (i, c, ps) => {
    let s = 0, n = 0;
    for (const p of ps) { const r = D.rt[c][p][i]; if (D.resp[c][p][i] === items[i].t && r >= RT_MIN && r <= RT_MAX) { s += Math.log(r); n++; } }
    return n ? Math.exp(s / n) : null;
  };
  const ols = (pts) => {
    const n = pts.length; if (n < 3) return null;
    const mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
    let sxx = 0, sxy = 0, syy = 0;
    for (const [x, y] of pts) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); syy += (y - my) ** 2; }
    if (!sxx) return null;
    const b = sxy / sxx;
    return { a: my - b * mx, b, r: syy ? sxy / Math.sqrt(sxx * syy) : 0 };
  };

  // ---------- DOM helpers ----------
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
  const sizeSvg = (svg, ratio, minH = 260, maxH = 440) => {
    const W = Math.max(280, Math.round(svg.parentElement.clientWidth));
    const H = Math.round(Math.max(minH, Math.min(maxH, W * ratio)));
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("width", W); svg.setAttribute("height", H);
    clear(svg); return [W, H];
  };

  const renderAll = () => { syncers.forEach((f) => f()); renders.forEach((f) => f()); };

  const row = (parent, label, opts, get, set) => {
    const r = h("div", "filter-row");
    r.appendChild(h("span", "filter-label mono", esc(label)));
    for (const [v, t] of opts) {
      const b = h("button", "pill", esc(t)); b.type = "button"; b.dataset.value = v;
      b.addEventListener("click", () => { set(v); renderAll(); });
      r.appendChild(b);
    }
    const sync = () => r.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(String(get()) === b.dataset.value)));
    syncers.push(sync); sync(); parent.appendChild(r); return r;
  };
  const sharedRows = (parent) => {
    row(parent, TX.listeners, [["all", TX.lis_all], ["th", TX.lis_th], ["other", TX.lis_other]], () => S.lis, (v) => (S.lis = v));
    row(parent, TX.device, [["all", TX.dev_all], ["c", TX.dev_c], ["m", TX.dev_m]], () => S.dev, (v) => (S.dev = v));
  };
  const scaffold = (fig) => {
    const ctl = h("div", "mlab-controls"); fig.appendChild(ctl);
    const legend = h("div", "mlab-legend mono"); fig.appendChild(legend);
    const wrap = h("div", "mlab-plot"); fig.appendChild(wrap);
    const svg = el("svg", { class: "mlab-svg", role: "img" }, wrap);
    const status = h("p", "mlab-status mono"); status.setAttribute("aria-live", "polite"); fig.appendChild(status);
    const tip = h("div", "mlab-tip"); tip.hidden = true; wrap.appendChild(tip);
    return { ctl, legend, wrap, svg, status, tip };
  };
  const showTip = (ui, evt, html) => {
    const r = ui.wrap.getBoundingClientRect();
    ui.tip.innerHTML = html; ui.tip.hidden = false;
    const tw = ui.tip.offsetWidth, th = ui.tip.offsetHeight;
    let x = evt.clientX - r.left + 14, y = evt.clientY - r.top - th - 10;
    if (x + tw > r.width) x = Math.max(0, evt.clientX - r.left - tw - 14);
    if (y < 0) y = evt.clientY - r.top + 16;
    ui.tip.style.left = x + "px"; ui.tip.style.top = y + "px";
  };
  const hideTip = (ui) => { ui.tip.hidden = true; };
  const hover = (node, ui, html) => {
    node.addEventListener("pointerenter", (e) => showTip(ui, e, html()));
    node.addEventListener("pointermove", (e) => showTip(ui, e, html()));
    node.addEventListener("pointerleave", () => hideTip(ui));
    node.addEventListener("click", (e) => showTip(ui, e, html()));
  };
  const legendCond = (colour = "var(--mist)") =>
    `<span><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="var(--understory)" stroke="${colour}" stroke-width="2"/></svg> ${esc(TX.nomask)}</span>` +
    `<span><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="${colour}"/></svg> ${esc(TX.mask)}</span>`;
  const legendFr = (set) => FR.filter((f) => !set || set.has(f)).map((f) =>
    `<span><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="${COL[f]}"/></svg> ${IPA[f]}</span>`).join("");
  const yAxis = (svg, ticks, sy, L, W, R, fmt) => {
    for (const v of ticks) {
      el("line", { x1: L, x2: W - R, y1: sy(v), y2: sy(v), class: "mlab-grid" }, svg);
      txt(svg, L - 8, sy(v) + 4, fmt(v), { class: "mlab-tick", "text-anchor": "end" });
    }
  };

  // ---------- 1. guess ----------
  const guess = (fig) => {
    let pick = null;
    fig.appendChild(h("p", "mlab-q", esc(TX.guess_q)));
    const btns = h("div", "mlab-guess");
    for (const f of FR) {
      const b = h("button", "pill mlab-guess-btn", `<span class="mlab-ipa">${IPA[f]}</span> <span class="mlab-eg">${TX.as_in} <em>${EG[f]}</em></span>`);
      b.type = "button"; b.style.setProperty("--c", COL[f]);
      b.addEventListener("click", () => { pick = f; render(); });
      btns.appendChild(b);
    }
    fig.appendChild(btns);
    const out = h("div", "mlab-guess-out"); fig.appendChild(out);
    const render = () => {
      btns.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", String(FR[i] === pick)));
      if (!pick) { out.hidden = true; return; }
      out.hidden = false;
      const ps = people.map((p, i) => i);
      const res = FR.map((f) => {
        const ii = idxOf((it) => it.t === f);
        const a = summary(ps.map((p) => accPerson(p, "nm", ii))).m, b = summary(ps.map((p) => accPerson(p, "wm", ii))).m;
        return { f, a, b, d: (b - a) * 100 };
      });
      const best = res.reduce((x, y) => (y.d < x.d ? y : x));
      const mine = res.find((r) => r.f === pick);
      const maxD = Math.max(...res.map((r) => Math.abs(r.d)));
      let html = '<div class="mlab-bars">';
      for (const r of res) {
        html += `<div class="mlab-bar${r.f === pick ? " picked" : ""}"><span class="mlab-ipa">${IPA[r.f]}</span>` +
          `<span class="mlab-bar-track"><span style="width:${(Math.abs(r.d) / maxD) * 100}%;background:${COL[r.f]}"></span></span>` +
          `<span class="mono">${signed(r.d)} ${TX.pp}</span></div>`;
      }
      html += "</div>";
      const o = { best: IPA[best.f], a: pct(best.a), b: pct(best.b), pick: IPA[pick], pa: pct(mine.a), pb: pct(mine.b) };
      html += `<p>${fill(pick === best.f ? TX.guess_right : TX.guess_wrong, o)} ${esc(TX.guess_after)}</p>`;
      out.innerHTML = html;
    };
    render();
  };

  // ---------- 2. accuracy and reaction times ----------
  const accuracy = (fig) => {
    const st = { m: "acc", pos: "all", comp: "all", dots: "off" };
    const ui = scaffold(fig);
    row(ui.ctl, TX.measure, [["acc", TX.m_acc], ["rt", TX.m_rt]], () => st.m, (v) => (st.m = v));
    row(ui.ctl, TX.position, [["all", TX.pos_all], ["onset", TX.pos_onset], ["coda", TX.pos_coda]], () => st.pos, (v) => (st.pos = v));
    row(ui.ctl, TX.competitor, [["all", TX.comp_all], ["1", TX.comp_yes], ["0", TX.comp_no]], () => st.comp, (v) => (st.comp = v));
    sharedRows(ui.ctl);
    row(ui.ctl, TX.show, [["off", TX.means], ["on", TX.dots]], () => st.dots, (v) => (st.dots = v));
    ui.svg.setAttribute("aria-label", TX.acc_aria);
    renders.push(() => {
      ui.legend.innerHTML = legendCond() + `<span>${esc(TX.ci_note)}</span>`;
      const ps = chosen(), pred = itemPred(st);
      const f1 = st.m === "acc" ? accPerson : rtPerson;
      const res = FR.map((f) => {
        const ii = idxOf((it) => it.t === f && pred(it));
        return { f, ii, s: C.map((c) => summary(ps.map((p) => f1(p, c, ii)))) };
      });
      const [W, H] = sizeSvg(ui.svg, 0.55, 300, 420);
      const L = st.m === "acc" ? 56 : 72, R = 12, T = 14, B = 52, PW = W - L - R, PH = H - T - B;
      let lo, hi;
      const all = res.flatMap((r) => r.s.filter(Boolean).flatMap((s) => (st.dots === "on" ? s.v : [s.m - 2 * s.se, s.m + 2 * s.se])));
      if (st.m === "acc") { hi = 1; lo = all.length ? Math.max(0, Math.floor((Math.min(...all) - 0.02) * 10) / 10) : 0; }
      else { lo = all.length ? Math.floor((Math.min(...all) - 20) / 50) * 50 : 0; hi = all.length ? Math.ceil((Math.max(...all) + 20) / 50) * 50 : 1000; }
      const sy = (v) => T + (hi - v) / (hi - lo) * PH;
      const fmt = st.m === "acc" ? (v) => pct(v) : (v) => nf(v) + " ms";
      yAxis(ui.svg, niceTicks(lo, hi, 5), sy, L, W, R, fmt);
      const cw = PW / 4, dx = Math.min(26, cw * 0.18);
      res.forEach((r, k) => {
        const cx = L + cw * (k + 0.5), col = COL[r.f];
        txt(ui.svg, cx, H - 28, IPA[r.f], { class: "mlab-cat", "text-anchor": "middle" });
        txt(ui.svg, cx, H - 12, cw < 110 ? EG[r.f] : TX.as_in + " " + EG[r.f], { class: "mlab-tick", "text-anchor": "middle", "font-style": cw < 110 ? "italic" : "normal" });
        if (!r.s[0] || !r.s[1]) return;
        if (st.dots === "on") {
          C.forEach((c, j) => r.s[j].v.forEach((v, n) => {
            const jit = ((n * 37) % 17) / 17 - 0.5;
            el("circle", { cx: cx + (j ? dx : -dx) + jit * dx * 1.1, cy: sy(v), r: 2.2, fill: col, opacity: 0.35 }, ui.svg);
          }));
        }
        const ya = sy(r.s[0].m), yb = sy(r.s[1].m);
        el("line", { x1: cx - dx, y1: ya, x2: cx + dx, y2: yb, stroke: col, "stroke-width": 2.5 }, ui.svg);
        C.forEach((c, j) => {
          const s = r.s[j], x = cx + (j ? dx : -dx);
          el("line", { x1: x, x2: x, y1: sy(s.m - 1.96 * s.se), y2: sy(s.m + 1.96 * s.se), stroke: col, "stroke-width": 1.5, opacity: 0.8 }, ui.svg);
          el("circle", { cx: x, cy: sy(s.m), r: 6, fill: j ? col : "var(--understory)", stroke: col, "stroke-width": 2.5 }, ui.svg);
        });
        const d = st.m === "acc" ? (r.s[1].m - r.s[0].m) * 100 : r.s[1].m - r.s[0].m;
        const top = Math.min(sy(r.s[0].m + 1.96 * r.s[0].se), sy(r.s[1].m + 1.96 * r.s[1].se)), bot = Math.max(sy(r.s[0].m - 1.96 * r.s[0].se), sy(r.s[1].m - 1.96 * r.s[1].se));
        txt(ui.svg, cx, top - 10 < T + 6 ? bot + 18 : top - 10,
          signed(d, st.m === "acc" ? 1 : 0) + (cw < 90 ? "" : " " + (st.m === "acc" ? TX.pp : "ms")), { class: "mlab-diff", fill: col, "text-anchor": "middle" });
        const hit = el("rect", { x: L + cw * k, y: T, width: cw, height: PH, fill: "transparent" }, ui.svg);
        hover(hit, ui, () => `<strong>${IPA[r.f]}</strong> · ${fill(TX.n_words, { n: r.ii.length })}<br>` +
          `${esc(TX.nomask)}: ${fmt(r.s[0].m)}<br>${esc(TX.mask)}: ${fmt(r.s[1].m)}<br>` +
          `${esc(TX.diff)}: ${signed(d, st.m === "acc" ? 1 : 0)} ${st.m === "acc" ? TX.pp : "ms"}`);
      });
      ui.status.textContent = fill(TX.acc_status, { n: ps.length, w: idxOf(pred).length });
    });
  };

  // ---------- 3. confusion matrix ----------
  const confusion = (fig) => {
    const st = { view: "wm", pos: "all", sel: ["t", "f"] };
    const ui = scaffold(fig);
    row(ui.ctl, TX.show, [["nm", TX.nomask], ["wm", TX.mask], ["diff", TX.diff_short]], () => st.view, (v) => (st.view = v));
    row(ui.ctl, TX.position, [["all", TX.pos_all], ["onset", TX.pos_onset], ["coda", TX.pos_coda]], () => st.pos, (v) => (st.pos = v));
    sharedRows(ui.ctl);
    ui.svg.setAttribute("aria-label", TX.conf_aria);
    const words = h("div", "mlab-words"); fig.insertBefore(words, ui.status.nextSibling);
    const count = (ps, ii, c) => {
      const m = {}; for (const f of FR) { m[f] = { n: 0 }; for (const r of RESP) m[f][r] = 0; }
      for (const p of ps) { const s = D.resp[c][p]; for (const i of ii) { const t = items[i].t; m[t].n++; m[t][s[i]]++; } }
      return m;
    };
    const describe = (ps, ii, f, r) => {
      const sub = ii.filter((i) => items[i].t === f);
      const rate = (i, c) => ps.length ? ps.filter((p) => D.resp[c][p][i] === r).length / ps.length : 0;
      const key = st.view === "diff" ? (i) => rate(i, "wm") - rate(i, "nm") : (i) => rate(i, st.view);
      const list = sub.map((i) => ({ i, v: key(i) })).sort((a, b) => (r === f ? a.v - b.v : b.v - a.v)).slice(0, 4);
      const lab = r === f ? TX.conf_hard : TX.conf_words;
      return `<span class="mono">${esc(lab)}</span> ` + list.map((o) =>
        `<em>${items[o.i].w}</em> <span class="mono">${st.view === "diff" ? signed(o.v * 100, 0) + " " + TX.pp : pct(o.v)}</span>`).join(" · ");
    };
    renders.push(() => {
      ui.legend.innerHTML = `<span>${esc(TX.conf_rows)}</span>`;
      const ps = chosen(), ii = idxOf(itemPred(st));
      const M = { nm: count(ps, ii, "nm"), wm: count(ps, ii, "wm") };
      const [W] = sizeSvg(ui.svg, 0, 0, 0);
      const L = 92, T = 44, cw = Math.max(46, (W - L - 4) / 5), ch = 46, H = T + ch * 4 + 6;
      ui.svg.setAttribute("viewBox", `0 0 ${W} ${H}`); ui.svg.setAttribute("height", H);
      txt(ui.svg, L + cw * 2.5, 14, TX.heard_as, { class: "mlab-axis", "text-anchor": "middle" });
      RESP.forEach((r, j) => txt(ui.svg, L + cw * (j + 0.5), T - 10, r === "x" ? TX.none_short : IPA[r], { class: "mlab-cat", "text-anchor": "middle" }));
      const val = (f, r) => {
        const a = M.nm[f].n ? M.nm[f][r] / M.nm[f].n : 0, b = M.wm[f].n ? M.wm[f][r] / M.wm[f].n : 0;
        return st.view === "nm" ? a : st.view === "wm" ? b : b - a;
      };
      const maxAbs = Math.max(0.01, ...FR.flatMap((f) => RESP.filter((r) => r !== f).map((r) => Math.abs(val(f, r)))));
      FR.forEach((f, i) => {
        const y = T + ch * i;
        txt(ui.svg, L - 12, y + ch / 2 + 5, IPA[f], { class: "mlab-cat", "text-anchor": "end", fill: COL[f] });
        RESP.forEach((r, j) => {
          const x = L + cw * j, v = val(f, r), diag = r === f;
          let colour, op;
          if (st.view === "diff") { colour = v >= 0 ? "var(--pandan)" : "var(--kingfisher)"; op = Math.min(1, Math.abs(v) / maxAbs) * 0.85; }
          else { colour = COL[f]; op = diag ? 0.18 + 0.5 * v : Math.min(1, Math.sqrt(v / maxAbs)) * 0.85; }
          const g = el("g", { class: "mlab-cell" + (st.sel && st.sel[0] === f && st.sel[1] === r ? " on" : "") }, ui.svg);
          el("rect", { x: x + 2, y: y + 2, width: cw - 4, height: ch - 4, rx: 6, fill: "var(--raised)" }, g);
          el("rect", { x: x + 2, y: y + 2, width: cw - 4, height: ch - 4, rx: 6, fill: colour, opacity: op.toFixed(3), class: "mlab-cell-fill" }, g);
          if (diag) el("rect", { x: x + 2.5, y: y + 2.5, width: cw - 5, height: ch - 5, rx: 6, fill: "none", stroke: COL[f], "stroke-width": 1.5 }, g);
          const label = st.view === "diff" ? signed(v * 100, 1) : Math.abs(v) < 0.1 && v > 0 ? pct1(v) : pct(v);
          txt(g, x + cw / 2, y + ch / 2 + 5, label, { class: "mlab-cell-txt", "text-anchor": "middle" });
          const msg = () => {
            const o = { target: IPA[f], resp: r === "x" ? TX.none : IPA[r] };
            if (st.view === "diff") return fill(TX.conf_diff, { ...o, a: pct1(M.nm[f][r] / M.nm[f].n), b: pct1(M.wm[f][r] / M.wm[f].n), d: signed(v * 100, 1) });
            const m = M[st.view][f];
            return fill(diag ? TX.conf_diag : TX.conf_cell, { ...o, cond: st.view === "nm" ? TX.nomask : TX.mask, p: pct1(v), k: m[r], n: m.n });
          };
          g.addEventListener("click", () => { st.sel = [f, r]; renderAll(); });
          g.addEventListener("pointerenter", () => { ui.status.textContent = msg(); words.innerHTML = describe(ps, ii, f, r); });
          g.addEventListener("pointerleave", () => { if (st.sel) { ui.status.textContent = selMsg(); words.innerHTML = describe(ps, ii, st.sel[0], st.sel[1]); } });
          if (st.sel && st.sel[0] === f && st.sel[1] === r) g.dataset.msg = "1";
          g._msg = msg;
        });
      });
      const selMsg = () => { const g = ui.svg.querySelector('[data-msg="1"]'); return g ? g._msg() : TX.conf_help; };
      ui.status.textContent = selMsg();
      words.innerHTML = describe(ps, ii, st.sel[0], st.sel[1]);
    });
  };

  // ---------- 4. acoustics ----------
  const acoustics = (fig) => {
    const st = { m: "cog" };
    const ui = scaffold(fig);
    row(ui.ctl, TX.measure, [["cog", TX.ac_cog], ["int", TX.ac_int]], () => st.m, (v) => (st.m = v));
    sharedRows(ui.ctl);
    ui.svg.setAttribute("aria-label", TX.ac_aria_a);
    const cap1 = h("p", "mlab-cap mono"); ui.wrap.insertBefore(cap1, ui.svg);
    const cap2 = h("p", "mlab-cap mono"); ui.wrap.appendChild(cap2);
    const svg2 = el("svg", { class: "mlab-svg", role: "img", "aria-label": TX.ac_aria_b }, ui.wrap);
    const stats = h("div", "mlab-rs mono"); ui.wrap.appendChild(stats);
    renders.push(() => {
      const key = st.m === "cog" ? "cog" : "int", unit = st.m === "cog" ? "Hz" : "dB", dp = st.m === "cog" ? 0 : 1;
      const fmt = (v) => nf(v, dp) + " " + unit;
      ui.legend.innerHTML = legendCond();
      cap1.textContent = fill(TX.ac_a_title, { m: st.m === "cog" ? TX.ac_cog : TX.ac_int });
      cap2.textContent = fill(TX.ac_b_title, { m: st.m === "cog" ? TX.ac_cog : TX.ac_int });
      // slope charts
      let [W, H] = sizeSvg(ui.svg, 0.5, 280, 380);
      let L = 64, R = 12, T = 12, B = 34, PW = W - L - R, PH = H - T - B;
      const vals = items.flatMap((it) => it[key]);
      let lo = Math.min(...vals), hi = Math.max(...vals); const pad = (hi - lo) * 0.05; lo -= pad; hi += pad;
      let sy = (v) => T + (hi - v) / (hi - lo) * PH;
      yAxis(ui.svg, niceTicks(lo, hi, 5), sy, L, W, R, (v) => nf(v) + (st.m === "cog" ? "" : ""));
      txt(ui.svg, 12, T + PH / 2, unit, { class: "mlab-axis", transform: `rotate(-90 12 ${T + PH / 2})`, "text-anchor": "middle" });
      const cw = PW / 4, dx = Math.min(44, cw * 0.3);
      FR.forEach((f, k) => {
        const cx = L + cw * (k + 0.5), col = COL[f], its = items.filter((it) => it.t === f);
        txt(ui.svg, cx, H - 10, IPA[f], { class: "mlab-cat", "text-anchor": "middle" });
        for (const it of its) {
          const g = el("g", { class: "mlab-word" }, ui.svg);
          el("line", { x1: cx - dx, x2: cx + dx, y1: sy(it[key][0]), y2: sy(it[key][1]), stroke: col, "stroke-width": 1, opacity: 0.35 }, g);
          el("line", { x1: cx - dx, x2: cx + dx, y1: sy(it[key][0]), y2: sy(it[key][1]), stroke: "transparent", "stroke-width": 8 }, g);
          hover(g, ui, () => `<strong><em>${it.w}</em></strong> ${IPA[f]}<br>${esc(TX.nomask)}: ${fmt(it[key][0])}<br>${esc(TX.mask)}: ${fmt(it[key][1])}`);
        }
        const m0 = its.reduce((a, it) => a + it[key][0], 0) / its.length, m1 = its.reduce((a, it) => a + it[key][1], 0) / its.length;
        el("line", { x1: cx - dx, x2: cx + dx, y1: sy(m0), y2: sy(m1), stroke: col, "stroke-width": 3, "pointer-events": "none" }, ui.svg);
        el("circle", { cx: cx - dx, cy: sy(m0), r: 5.5, fill: "var(--understory)", stroke: col, "stroke-width": 2.5, "pointer-events": "none" }, ui.svg);
        el("circle", { cx: cx + dx, cy: sy(m1), r: 5.5, fill: col, "pointer-events": "none" }, ui.svg);
      });
      // scatter: acoustic change vs accuracy change
      const ps = chosen();
      const pts = items.map((it, i) => ({ it, x: it[key][1] - it[key][0], y: ps.length ? ((itemAcc(i, "wm", ps) || 0) - (itemAcc(i, "nm", ps) || 0)) * 100 : 0 }));
      [W, H] = sizeSvg(svg2, 0.5, 280, 400);
      L = 52; R = 12; T = 12; B = 42; PW = W - L - R; PH = H - T - B;
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      let x0 = Math.min(0, ...xs), x1 = Math.max(0, ...xs); const px = (x1 - x0) * 0.06; x0 -= px; x1 += px;
      let y0 = Math.min(-5, ...ys) - 3, y1 = Math.max(5, ...ys) + 3;
      const sx = (v) => L + (v - x0) / (x1 - x0) * PW; sy = (v) => T + (y1 - v) / (y1 - y0) * PH;
      yAxis(svg2, niceTicks(y0, y1, 5), sy, L, W, R, (v) => signed(v, 0));
      for (const v of niceTicks(x0, x1, 6)) txt(svg2, sx(v), H - 24, signed(v, 0), { class: "mlab-tick", "text-anchor": "middle" });
      el("line", { x1: sx(0), x2: sx(0), y1: T, y2: T + PH, class: "mlab-zero" }, svg2);
      el("line", { x1: L, x2: W - R, y1: sy(0), y2: sy(0), class: "mlab-zero" }, svg2);
      txt(svg2, L + PW / 2, H - 6, fill(TX.ac_x, { u: unit }), { class: "mlab-axis", "text-anchor": "middle" });
      txt(svg2, L + 6, T + 12, TX.ac_y, { class: "mlab-hint" });
      for (const p of pts) {
        const g = el("g", { class: "mlab-pt" }, svg2);
        el("circle", { cx: sx(p.x), cy: sy(p.y), r: 5, fill: COL[p.it.t], opacity: 0.85 }, g);
        el("circle", { cx: sx(p.x), cy: sy(p.y), r: 11, fill: "transparent" }, g);
        hover(g, ui, () => `<strong><em>${p.it.w}</em></strong> ${IPA[p.it.t]}<br>${esc(TX.ac_change)}: ${signed(p.x, dp)} ${unit}<br>${esc(TX.acc_change)}: ${signed(p.y, 1)} ${TX.pp}`);
      }
      stats.innerHTML = FR.map((f) => {
        const fit = ols(pts.filter((p) => p.it.t === f).map((p) => [p.x, p.y]));
        return `<span><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="${COL[f]}"/></svg> ${IPA[f]} r = ${fit ? nf(fit.r, 2) : "–"}</span>`;
      }).join("");
      ui.status.textContent = TX.ac_help;
    });
  };

  // ---------- 5. words ----------
  const wordsFig = (fig) => {
    const st = { c: "both", fr: new Set(FR), q: "", sel: null };
    const ui = scaffold(fig);
    row(ui.ctl, TX.show, [["nm", TX.nomask], ["wm", TX.mask], ["both", TX.both]], () => st.c, (v) => (st.c = v));
    const fr = h("div", "filter-row"); fr.appendChild(h("span", "filter-label mono", esc(TX.fricatives)));
    for (const f of FR) {
      const b = h("button", "pill", IPA[f]); b.type = "button";
      b.addEventListener("click", () => { if (st.fr.has(f) && st.fr.size > 1) st.fr.delete(f); else st.fr.add(f); renderAll(); });
      fr.appendChild(b);
    }
    syncers.push(() => fr.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", String(st.fr.has(FR[i])))));
    ui.ctl.appendChild(fr);
    sharedRows(ui.ctl);
    const sr = h("div", "filter-row"); sr.appendChild(h("span", "filter-label mono", esc(TX.find)));
    const inp = h("input", "mlab-search mono"); inp.type = "search"; inp.placeholder = TX.find_ph; inp.setAttribute("aria-label", TX.find);
    inp.addEventListener("input", () => {
      st.q = inp.value.trim().toLowerCase();
      const hit = items.find((it) => it.w === st.q); if (hit) st.sel = hit.w;
      renderAll();
    });
    sr.appendChild(inp); ui.ctl.appendChild(sr);
    ui.svg.setAttribute("aria-label", TX.w_aria);
    const card = h("div", "mlab-card"); fig.insertBefore(card, ui.status.nextSibling);
    const cardHtml = (i, ps) => {
      const it = items[i];
      const a = C.map((c) => itemAcc(i, c, ps)), r = C.map((c) => itemRt(i, c, ps));
      const wrong = {}; for (const c of C) for (const p of ps) { const x = D.resp[c][p][i]; if (x !== it.t) wrong[x] = (wrong[x] || 0) + 1; }
      const top = Object.entries(wrong).sort((x, y) => y[1] - x[1])[0];
      const cell = (v, f) => (v === null ? "–" : f(v));
      return `<div class="mlab-card-head"><strong><em>${it.w}</em></strong> <span class="mono" style="color:${COL[it.t]}">${IPA[it.t]}</span> ` +
        `<span class="mono">${esc(it.pos === "onset" ? TX.pos_onset : TX.pos_coda)} · ${esc(it.comp ? TX.comp_yes : TX.comp_no)} · ${esc(TX.freq_short)} ${nf(it.f, 2)}</span></div>` +
        `<table class="mlab-card-tab mono"><tr><th></th><th>${esc(TX.nomask)}</th><th>${esc(TX.mask)}</th></tr>` +
        `<tr><td>${esc(TX.m_acc)}</td><td>${cell(a[0], pct)}</td><td>${cell(a[1], pct)}</td></tr>` +
        `<tr><td>${esc(TX.m_rt)}</td><td>${cell(r[0], (v) => nf(v) + " ms")}</td><td>${cell(r[1], (v) => nf(v) + " ms")}</td></tr>` +
        `<tr><td>${esc(TX.ac_cog)}</td><td>${nf(it.cog[0])} Hz</td><td>${nf(it.cog[1])} Hz</td></tr>` +
        `<tr><td>${esc(TX.ac_int)}</td><td>${nf(it.int[0], 1)} dB</td><td>${nf(it.int[1], 1)} dB</td></tr></table>` +
        `<p class="mono">${esc(TX.top_wrong)}: ${top ? `${top[0] === "x" ? esc(TX.none) : IPA[top[0]]} (${top[1]}×)` : esc(TX.no_wrong)}</p>`;
    };
    renders.push(() => {
      ui.legend.innerHTML = legendFr(st.fr) + (st.c === "both" ? legendCond() : "");
      const ps = chosen();
      const shown = items.map((it, i) => i).filter((i) => st.fr.has(items[i].t));
      const acc = {}; for (const i of shown) acc[i] = C.map((c) => itemAcc(i, c, ps));
      const [W, H] = sizeSvg(ui.svg, 0.6, 300, 440);
      const L = 52, R = 14, T = 14, B = 42, PW = W - L - R, PH = H - T - B;
      const fx = items.map((it) => it.f); const x0 = Math.floor(Math.min(...fx) * 2) / 2 - 0.1, x1 = Math.ceil(Math.max(...fx) * 2) / 2 + 0.1;
      const yv = shown.flatMap((i) => (st.c === "both" ? acc[i] : [acc[i][st.c === "nm" ? 0 : 1]])).filter((v) => v !== null);
      const y0 = yv.length ? Math.max(0, Math.floor((Math.min(...yv) - 0.03) * 10) / 10) : 0, y1 = 1.02;
      const sx = (v) => L + (v - x0) / (x1 - x0) * PW, sy = (v) => T + (y1 - v) / (y1 - y0) * PH;
      yAxis(ui.svg, niceTicks(y0, 1, 5), sy, L, W, R, pct);
      for (const v of niceTicks(x0, x1, 6)) txt(ui.svg, sx(v), H - 24, nf(v, 1), { class: "mlab-tick", "text-anchor": "middle" });
      txt(ui.svg, L + PW / 2, H - 6, TX.freq_axis, { class: "mlab-axis", "text-anchor": "middle" });
      const fitInfo = [];
      for (const [j, c] of C.entries()) {
        if (st.c !== "both" && st.c !== c) continue;
        const fit = ols(shown.filter((i) => acc[i][j] !== null).map((i) => [items[i].f, acc[i][j]]));
        if (!fit) continue;
        el("line", { x1: sx(x0), x2: sx(x1), y1: sy(fit.a + fit.b * x0), y2: sy(fit.a + fit.b * x1), stroke: "var(--mist)", "stroke-width": 1.5, "stroke-dasharray": j ? "" : "5 5", opacity: 0.7, "pointer-events": "none" }, ui.svg);
        fitInfo.push(`${j ? TX.mask : TX.nomask}: ${signed(fit.b * 100, 1)} ${TX.per_unit}`);
      }
      const q = st.q;
      for (const i of shown) {
        const it = items[i], col = COL[it.t];
        const match = q && it.w.startsWith(q), dim = q && !match, sel = st.sel === it.w;
        const g = el("g", { class: "mlab-pt" + (sel ? " on" : ""), opacity: dim ? 0.18 : 1 }, ui.svg);
        const x = sx(it.f);
        if (st.c === "both") {
          if (acc[i][0] === null) continue;
          el("line", { x1: x, x2: x, y1: sy(acc[i][0]), y2: sy(acc[i][1]), stroke: col, "stroke-width": 1.5, opacity: 0.7 }, g);
          el("circle", { cx: x, cy: sy(acc[i][0]), r: 3.5, fill: "var(--understory)", stroke: col, "stroke-width": 1.5 }, g);
          el("circle", { cx: x, cy: sy(acc[i][1]), r: 4.5, fill: col, class: "mlab-dot" }, g);
          el("rect", { x: x - 7, y: Math.min(sy(acc[i][0]), sy(acc[i][1])) - 7, width: 14, height: Math.abs(sy(acc[i][0]) - sy(acc[i][1])) + 14, fill: "transparent" }, g);
        } else {
          const v = acc[i][st.c === "nm" ? 0 : 1]; if (v === null) continue;
          el("circle", { cx: x, cy: sy(v), r: 5, fill: col, class: "mlab-dot" }, g);
          el("circle", { cx: x, cy: sy(v), r: 11, fill: "transparent" }, g);
        }
        if (match || sel) { const right = x > L + PW * 0.8; txt(ui.svg, right ? x - 8 : x + 8, sy(acc[i][st.c === "nm" ? 0 : 1] ?? 1) - 6, it.w, { class: "mlab-label", "text-anchor": right ? "end" : "start" }); }
        hover(g, ui, () => `<strong><em>${it.w}</em></strong> ${IPA[it.t]}<br>${esc(TX.nomask)}: ${pct(acc[i][0])} · ${esc(TX.mask)}: ${pct(acc[i][1])}`);
        g.addEventListener("click", () => { st.sel = it.w; renderAll(); });
      }
      const si = items.findIndex((it) => it.w === st.sel);
      card.innerHTML = si >= 0 && ps.length ? cardHtml(si, ps) : `<p class="mono">${esc(TX.w_help)}</p>`;
      ui.status.textContent = fitInfo.length ? TX.fit + ": " + fitInfo.join(" · ") : "";
    });
  };

  // ---------- 6. listeners ----------
  const listeners = (fig) => {
    const st = { set: "nonsib" };
    const ui = scaffold(fig);
    row(ui.ctl, TX.fricatives, [["all", TX.set_all], ["nonsib", TX.set_nonsib], ["sib", TX.set_sib], ...FR.map((f) => [f, IPA[f]])], () => st.set, (v) => (st.set = v));
    sharedRows(ui.ctl);
    ui.svg.setAttribute("aria-label", TX.l_aria);
    renders.push(() => {
      ui.legend.innerHTML =
        `<span><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="var(--pandan)"/></svg> ${esc(TX.var_th)}</span>` +
        `<span><svg width="12" height="12" aria-hidden="true"><rect x="1" y="1" width="10" height="10" rx="2" fill="var(--kingfisher)"/></svg> ${esc(TX.var_other)}</span>`;
      const sets = { all: FR, nonsib: ["f", "t"], sib: ["s", "h"] };
      const fs = sets[st.set] || [st.set];
      const ii = idxOf((it) => fs.includes(it.t));
      const ps = chosen();
      const pts = ps.map((p) => ({ p, a: accPerson(p, "nm", ii), b: accPerson(p, "wm", ii) }));
      const [W, H] = sizeSvg(ui.svg, 0.75, 300, 460);
      const L = 52, R = 14, T = 14, B = 42, PW = W - L - R, PH = H - T - B;
      const vv = pts.flatMap((o) => [o.a, o.b]);
      const lo = vv.length ? Math.max(0, Math.floor((Math.min(...vv) - 0.03) * 10) / 10) : 0, hi = 1.02;
      const sx = (v) => L + (v - lo) / (hi - lo) * PW, sy = (v) => T + (hi - v) / (hi - lo) * PH;
      const ticks = niceTicks(lo, 1, 5);
      yAxis(ui.svg, ticks, sy, L, W, R, pct);
      for (const v of ticks) txt(ui.svg, sx(v), H - 24, pct(v), { class: "mlab-tick", "text-anchor": "middle" });
      el("line", { x1: sx(lo), y1: sy(lo), x2: sx(1), y2: sy(1), class: "mlab-zero" }, ui.svg);
      txt(ui.svg, L + PW / 2, H - 6, TX.l_x, { class: "mlab-axis", "text-anchor": "middle" });
      txt(ui.svg, L + 6, T + 12, TX.l_y, { class: "mlab-hint" });
      { const dv = lo + (1 - lo) * 0.22, ang = Math.atan2(sy(1) - sy(lo), sx(1) - sx(lo)) * 180 / Math.PI;
        txt(ui.svg, sx(dv) + 4, sy(dv) - 6, TX.l_diag, { class: "mlab-hint", transform: `rotate(${ang.toFixed(1)} ${sx(dv) + 4} ${sy(dv) - 6})` }); }
      const seen = {};
      for (const o of pts) {
        const k = o.a.toFixed(3) + o.b.toFixed(3); const n = (seen[k] = (seen[k] || 0) + 1) - 1;
        const off = n ? ((n % 2 ? 1 : -1) * Math.ceil(n / 2) * 5) : 0;
        const x = sx(o.a) + off, y = sy(o.b), pp = people[o.p];
        const g = el("g", { class: "mlab-pt" }, ui.svg);
        if (pp.th) el("circle", { cx: x, cy: y, r: 5.5, fill: "var(--pandan)", opacity: 0.9 }, g);
        else el("rect", { x: x - 5, y: y - 5, width: 10, height: 10, rx: 2, fill: "var(--kingfisher)", opacity: 0.9 }, g);
        el("circle", { cx: x, cy: y, r: 11, fill: "transparent" }, g);
        hover(g, ui, () => `<strong>${pp.id}</strong> · ${esc(pp.th ? TX.var_th : TX.var_other)} · ${esc(pp.dev === "m" ? TX.dev_m : TX.dev_c)}<br>` +
          `${esc(TX.nomask)}: ${pct(o.a)} · ${esc(TX.mask)}: ${pct(o.b)}`);
      }
      const below = pts.filter((o) => o.b < o.a).length, same = pts.filter((o) => o.b === o.a).length;
      ui.status.textContent = fill(TX.l_count, { below, n: pts.length, same, above: pts.length - below - same });
    });
  };

  const parts = { guess, accuracy, confusion, acoustics, words: wordsFig, listeners };
  document.querySelectorAll(".mlab[data-part]").forEach((fig) => { const f = parts[fig.dataset.part]; if (f) f(fig); });
  renderAll();
  let rt; let lastW = window.innerWidth;
  window.addEventListener("resize", () => { if (window.innerWidth === lastW) return; lastW = window.innerWidth; clearTimeout(rt); rt = setTimeout(renderAll, 120); });
})();
