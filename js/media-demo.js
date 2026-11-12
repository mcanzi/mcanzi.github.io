/* Two interactive figures for the media study (content/demo/media.*.md), from data/mediastudy.json (participants).
   Each is a <figure class="mlab mdlab" data-part="..."> filled in here:
   - people: one before/after line per participant, one panel per group
   - perm:   an exact permutation test of the group difference in change, over all 48,620 ways to split
             the 18 participants into two groups of nine */
(() => {
  const I = JSON.parse(document.getElementById("mdlab-i18n").textContent);
  const TX = I.t, LOC = I.locale || "en-US";
  const PEOPLE = JSON.parse(document.getElementById("mdlab-data").textContent);
  const NS = "http://www.w3.org/2000/svg";
  const GROUPS = { AE: { name: TX.ae, colour: "var(--c1)" }, BE: { name: TX.be, colour: "var(--c3)" } };
  const FEATS = ["flapping", "rhoticity", "both"];

  const nf = (v, d = 0) => v.toLocaleString(LOC, { minimumFractionDigits: d, maximumFractionDigits: d });
  const signed = (v, d = 1) => (v > 0 ? "+" : v < 0 ? "−" : "±") + nf(Math.abs(v), d);
  const fill = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => (k in o ? o[k] : ""));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const lead0 = (x) => (I.lang === "en" ? x.replace(/^0/, "") : x);

  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e); return e;
  };
  const txt = (parent, x, y, s, attrs = {}) => { const t = el("text", { x, y, ...attrs }, parent); t.textContent = s; return t; };
  const sizeSvg = (svg, ratio, minH, maxH) => {
    const W = Math.max(280, Math.round(svg.parentElement.clientWidth));
    const H = Math.round(Math.max(minH, Math.min(maxH, W * ratio)));
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("width", W); svg.setAttribute("height", H);
    svg.textContent = ""; return [W, H];
  };
  const pills = (parent, label, values, names, get, set) => {
    const row = h("div", "filter-row");
    row.appendChild(h("span", "filter-label mono", esc(label)));
    const bs = values.map((v) => {
      const b = h("button", "pill", esc(names[v])); b.type = "button";
      b.addEventListener("click", () => { set(v); bs.forEach((x) => x.setAttribute("aria-pressed", String(x === b))); });
      b.setAttribute("aria-pressed", String(v === get())); row.appendChild(b); return b;
    });
    parent.appendChild(row);
  };
  const scaffold = (fig, aria) => {
    const ctl = h("div", "mlab-controls"); fig.appendChild(ctl);
    const legend = h("div", "mlab-legend mono"); fig.appendChild(legend);
    const wrap = h("div", "mlab-plot"); fig.appendChild(wrap);
    const svg = el("svg", { class: "mlab-svg", role: "img", "aria-label": aria }, wrap);
    const rs = h("div", "mlab-rs mono plab-rs"); fig.appendChild(rs);
    const status = h("p", "mlab-status mono"); status.setAttribute("aria-live", "polite"); fig.appendChild(status);
    return { ctl, legend, svg, rs, status };
  };
  const groupKey = (g) => g === "AE"
    ? `<span><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="var(--c1)"/></svg> ${esc(GROUPS.AE.name)}</span>`
    : `<span><svg width="12" height="12" aria-hidden="true"><rect x="1" y="1" width="10" height="10" rx="2" fill="var(--c3)"/></svg> ${esc(GROUPS.BE.name)}</span>`;
  const renders = [];

  // ---------- who changed: one line per participant ----------
  const people = (fig) => {
    let feat = "flapping", focus = null;
    const ui = scaffold(fig, TX.people_aria);
    pills(ui.ctl, TX.feature, FEATS, TX.feats, () => feat, (v) => { feat = v; focus = null; draw(); });
    ui.legend.innerHTML = groupKey("AE") + groupKey("BE") +
      `<span><svg width="18" height="12" aria-hidden="true"><line x1="0" y1="6" x2="18" y2="6" stroke="var(--mist)" stroke-width="4"/></svg> ${esc(TX.mean)}</span>`;
    const describe = (p) => {
      const f = p.f[feat];
      return fill(TX.person, { id: p.id, group: GROUPS[p.group].name, b: nf(f.before, 1), a: nf(f.after, 1), c: signed(f.change), n: f.n });
    };
    const draw = () => {
      const narrow = fig.clientWidth < 560;
      const [W, H] = sizeSvg(ui.svg, narrow ? 1.25 : 0.5, 300, narrow ? 720 : 400);
      const L = 46, R = 16, T = 26, B = 30, gap = 36;
      const panels = narrow
        ? [["AE", L, W - R, T, (H - gap) / 2 - B / 2], ["BE", L, W - R, (H + gap) / 2, H - B]]
        : [["AE", L, (W - gap) / 2, T, H - B], ["BE", (W + gap) / 2 + 24, W - R, T, H - B]];
      const counts = {};
      for (const [g, x0, x1, y0, y1] of panels) {
        const xb = x0 + 34, xa = x1 - 34, sy = (v) => y1 - (v / 100) * (y1 - y0);
        for (const v of [0, 25, 50, 75, 100]) {
          el("line", { x1: x0, x2: x1, y1: sy(v), y2: sy(v), class: "mlab-grid" }, ui.svg);
          txt(ui.svg, x0 - 6, sy(v) + 4, nf(v) + "%", { class: "mlab-tick", "text-anchor": "end" });
        }
        txt(ui.svg, xb, y1 + 18, TX.before, { class: "mlab-tick", "text-anchor": "middle" });
        txt(ui.svg, xa, y1 + 18, TX.after, { class: "mlab-tick", "text-anchor": "middle" });
        txt(ui.svg, (x0 + x1) / 2, y0 - 10, GROUPS[g].name, { class: "mlab-cat", "text-anchor": "middle", style: `fill: ${GROUPS[g].colour}` });
        const members = PEOPLE.filter((p) => p.group === g);
        const c = { up: 0, down: 0, same: 0 }; counts[g] = c;
        let mb = 0, ma = 0;
        for (const p of members) {
          const f = p.f[feat]; mb += f.before; ma += f.after;
          c[f.change > 0 ? "up" : f.change < 0 ? "down" : "same"]++;
          const on = focus === p.id, dim = focus && !on;
          const gp = el("g", { class: "mdlab-line", tabindex: 0, role: "img", "aria-label": describe(p), "data-id": p.id }, ui.svg);
          el("line", { x1: xb, y1: sy(f.before), x2: xa, y2: sy(f.after), stroke: GROUPS[g].colour,
            "stroke-width": on ? 3.5 : 1.8, "stroke-opacity": dim ? 0.18 : on ? 1 : 0.6, "stroke-linecap": "round" }, gp);
          for (const [x, v] of [[xb, f.before], [xa, f.after]]) {
            if (g === "AE") el("circle", { cx: x, cy: sy(v), r: on ? 5.5 : 4, fill: GROUPS[g].colour, "fill-opacity": dim ? 0.2 : 1 }, gp);
            else el("rect", { x: x - (on ? 5 : 3.5), y: sy(v) - (on ? 5 : 3.5), width: on ? 10 : 7, height: on ? 10 : 7, rx: 1.5, fill: GROUPS[g].colour, "fill-opacity": dim ? 0.2 : 1 }, gp);
          }
          el("line", { x1: xb, y1: sy(f.before), x2: xa, y2: sy(f.after), stroke: "transparent", "stroke-width": 14 }, gp);
          if (on) txt(ui.svg, xa + 8, sy(f.after) + 4, p.id, { class: "mlab-cat" });
        }
        mb /= members.length; ma /= members.length;
        el("line", { x1: xb, y1: sy(mb), x2: xa, y2: sy(ma), stroke: "var(--mist)", "stroke-width": 4, "stroke-linecap": "round", "pointer-events": "none" }, ui.svg);
      }
      ui.rs.innerHTML = ["AE", "BE"].map((g) => `<span>${esc(GROUPS[g].name)}: <strong>${esc(fill(TX.counts, { up: counts[g].up, down: counts[g].down, same: counts[g].same }))}</strong></span>`).join("");
      if (!focus) ui.status.textContent = fill(TX.people_help, { n: nf(Math.min(...PEOPLE.map((p) => p.f[feat].n))) + "–" + nf(Math.max(...PEOPLE.map((p) => p.f[feat].n))) });
    };
    const pick = (e) => { const g = e.target.closest && e.target.closest(".mdlab-line"); return g ? g.dataset.id : null; };
    const show = (id) => {
      if (id === focus) return; focus = id; draw();
      if (id) ui.status.textContent = describe(PEOPLE.find((p) => p.id === id));
      if (id) { const g = ui.svg.querySelector(`[data-id="${id}"]`); if (g && document.activeElement !== g && fig.contains(document.activeElement)) g.focus(); }
    };
    ui.svg.addEventListener("pointermove", (e) => { const id = pick(e); if (id) show(id); });
    ui.svg.addEventListener("pointerleave", () => show(null));
    ui.svg.addEventListener("click", (e) => show(pick(e)));
    ui.svg.addEventListener("focusin", (e) => { const id = pick(e); if (id && id !== focus) { focus = id; ui.status.textContent = describe(PEOPLE.find((p) => p.id === id)); draw(); ui.svg.querySelector(`[data-id="${id}"]`).focus(); } });
    renders.push(draw);
  };

  // ---------- could it be chance: exact permutation test ----------
  const SPLITS = (() => {
    const out = [], idx = [];
    const rec = (start) => {
      if (idx.length === 9) { let m = 0; for (const i of idx) m |= 1 << i; out.push(m); return; }
      for (let i = start; i <= 18 - (9 - idx.length); i++) { idx.push(i); rec(i + 1); idx.pop(); }
    };
    rec(0); return Int32Array.from(out);
  })();
  const perm = (fig) => {
    let feat = "flapping", done = 0, order = null, diffs = null, last = null;
    const ui = scaffold(fig, TX.perm_aria);
    pills(ui.ctl, TX.feature, FEATS, TX.feats, () => feat, (v) => { feat = v; reset(); });
    const bar = h("div", "filter-row"); ui.ctl.appendChild(bar);
    const btn = (label, k) => {
      const b = h("button", "pill", esc(label)); b.type = "button";
      b.addEventListener("click", () => add(k)); bar.appendChild(b);
    };
    btn(TX.shuffle1, 1); btn(fill(TX.shuffleK, { k: nf(100) }), 100); btn(fill(TX.all, { k: nf(SPLITS.length) }), SPLITS.length);
    ui.legend.innerHTML = `<span><svg width="12" height="12" aria-hidden="true"><rect x="1" y="1" width="10" height="10" rx="2" fill="var(--c4)"/></svg> ${esc(TX.one_split)}</span>` +
      `<span><svg width="12" height="12" aria-hidden="true"><rect x="1" y="1" width="10" height="10" rx="2" fill="var(--c2)"/></svg> ${esc(TX.as_extreme)}</span>` +
      `<span><svg width="16" height="12" aria-hidden="true"><line x1="0" y1="6" x2="16" y2="6" stroke="var(--mist)" stroke-width="2.5"/></svg> ${esc(TX.observed)}</span>`;
    const changes = () => PEOPLE.map((p) => p.f[feat].change);
    const diffOf = (mask, ch) => { let a = 0, b = 0; for (let i = 0; i < 18; i++) (mask >> i) & 1 ? (a += ch[i]) : (b += ch[i]); return a / 9 - b / 9; };
    const realMask = PEOPLE.reduce((m, p, i) => (p.group === "AE" ? m | (1 << i) : m), 0);
    let obs = 0, ch = [], sd = 1, lim = 30;
    const reset = () => {
      ch = changes(); obs = diffOf(realMask, ch);
      diffs = new Float64Array(SPLITS.length); let ss = 0, mx = 0;
      for (let i = 0; i < SPLITS.length; i++) { diffs[i] = diffOf(SPLITS[i], ch); ss += diffs[i] ** 2; mx = Math.max(mx, Math.abs(diffs[i])); }
      sd = Math.sqrt(ss / SPLITS.length); lim = Math.ceil(Math.max(mx, Math.abs(obs) + 2) / 10) * 10;
      order = Uint32Array.from({ length: SPLITS.length }, (_, i) => i);
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      done = 0; last = null; draw();
    };
    let token = 0;
    const add = (k) => {
      if (done >= SPLITS.length) { done = 0; last = null; }
      const target = Math.min(SPLITS.length, done + k), me = ++token, step = Math.max(1, Math.ceil((target - done) / 30));
      const tick = () => {
        if (me !== token) return;
        done = Math.min(target, done + step); last = order[done - 1]; draw();
        if (done < target) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const draw = () => {
      const [W, H] = sizeSvg(ui.svg, 0.48, 260, 380);
      const L = 52, R = 16, T = 20, B = H - 44;
      const lo = -lim, hi = lim, nb = 60, bw = (hi - lo) / nb;
      const sx = (v) => L + ((v - lo) / (hi - lo)) * (W - R - L);
      const cnt = new Array(nb).fill(0), ext = new Array(nb).fill(0);
      let k = 0;
      for (let i = 0; i < done; i++) {
        const d = diffs[order[i]], b = Math.min(nb - 1, Math.max(0, Math.floor((d - lo) / bw)));
        if (Math.abs(d) >= Math.abs(obs) - 1e-9) { ext[b]++; k++; } else cnt[b]++;
      }
      const full = SPLITS.length * bw / (Math.sqrt(2 * Math.PI) * sd) * 1.15;
      const ymax = Math.max(done > 300 ? full * done / SPLITS.length : 4, ...cnt.map((c, i) => c + ext[i]), 1);
      const sy = (v) => B - (v / ymax) * (B - T);
      for (let v = -lim; v <= lim; v += 10) txt(ui.svg, sx(v), B + 18, signed(v, 0).replace("±", ""), { class: "mlab-tick", "text-anchor": "middle" });
      txt(ui.svg, (L + W - R) / 2, H - 6, TX.perm_x, { class: "mlab-axis", "text-anchor": "middle" });
      txt(ui.svg, L + 6, T + 2, TX.splits_y, { class: "mlab-hint" });
      el("line", { x1: L, x2: W - R, y1: B, y2: B, class: "mlab-grid" }, ui.svg);
      for (let b = 0; b < nb; b++) {
        const x = sx(lo + b * bw) + 0.5, w = Math.max(1, sx(lo + (b + 1) * bw) - sx(lo + b * bw) - 1);
        if (cnt[b]) el("rect", { x, y: sy(cnt[b]), width: w, height: B - sy(cnt[b]), fill: "var(--c4)" }, ui.svg);
        if (ext[b]) el("rect", { x, y: sy(cnt[b] + ext[b]), width: w, height: sy(cnt[b]) - sy(cnt[b] + ext[b]), fill: "var(--c2)" }, ui.svg);
      }
      for (const v of [obs, -obs]) {
        el("line", { x1: sx(v), x2: sx(v), y1: T, y2: B, stroke: "var(--mist)", "stroke-width": v === obs ? 2.5 : 1.2, "stroke-dasharray": v === obs ? "" : "4 4" }, ui.svg);
      }
      const far = sx(obs) > (L + W - R) * 0.7;
      txt(ui.svg, sx(obs) + (far ? -6 : 6), T + 14, fill(TX.real, { d: signed(obs) }), { class: "mlab-cat", "text-anchor": far ? "end" : "start" });
      if (last !== null && done < SPLITS.length) {
        const d = diffs[last];
        el("circle", { cx: sx(d), cy: B - 7, r: 5, fill: "var(--mist)", stroke: "var(--understory)", "stroke-width": 2 }, ui.svg);
      }
      ui.rs.innerHTML = `<span>${esc(TX.observed)}: <strong>${signed(obs)} pp</strong></span>` +
        `<span>${esc(TX.splits)}: <strong>${nf(done)} / ${nf(SPLITS.length)}</strong></span>` +
        `<span>${esc(TX.share)}: <strong>${done ? lead0(nf(k / done, 3)) : "–"}</strong></span>`;
      ui.status.innerHTML = !done ? esc(TX.perm_help)
        : done < SPLITS.length && last !== null ? esc(fill(TX.this_split, { ae: PEOPLE.filter((_, i) => (SPLITS[last] >> i) & 1).map((p) => p.id).join(", "), d: signed(diffs[last]) }))
        : esc(fill(TX.exact, { p: lead0(nf(k / done, 3)) }));
    };
    reset();
    renders.push(draw);
  };

  const parts = { people, perm };
  document.querySelectorAll(".mdlab[data-part]").forEach((fig) => { const f = parts[fig.dataset.part]; if (f) f(fig); });
  renders.forEach((f) => f());
  let rt, lastW = window.innerWidth;
  window.addEventListener("resize", () => { if (window.innerWidth === lastW) return; lastW = window.innerWidth; clearTimeout(rt); rt = setTimeout(() => renders.forEach((f) => f()), 120); });
})();
