// Search for the record grid. The cards are already in artist order; the records come from the
// JSON block that layouts/_default/music.html writes into each page.
(() => {
  const D = JSON.parse(document.getElementById("music-data").textContent);
  const list = document.querySelector(".records");
  const count = document.querySelector(".music-count");
  const empty = document.querySelector(".music-empty");
  const search = document.querySelector(".music-search");
  const state = { q: "" };

  // reuse the cards rendered at build time (same order as D.records)
  const items = [...list.children].map((li, i) => ({ li, r: D.records[i] }));
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  items.forEach((it) => { it.text = norm([it.r.artist, it.r.title, ...it.r.styles].join(" ")); });

  const update = () => {
    const q = norm(state.q).trim();
    let shown = 0;
    items.forEach((it) => {
      const ok = !q || it.text.includes(q);
      it.li.hidden = !ok;
      if (ok) shown++;
    });
    count.textContent = D.t.count.replace("{n}", shown).replace("{total}", items.length);
    empty.hidden = shown > 0;
  };

  search.addEventListener("input", () => { state.q = search.value; update(); });
})();
