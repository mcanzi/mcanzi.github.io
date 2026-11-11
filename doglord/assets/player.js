// Album player for the Doglord page. Track list and labels come from #player-data (written by
// layouts/_default/doglord.html). Tracks without a file are shown but cannot be played.
(() => {
  const D = JSON.parse(document.getElementById("player-data").textContent);
  const audio = document.querySelector(".album audio");
  const rows = [...document.querySelectorAll(".track")];
  const btn = { play: document.querySelector(".ctl.play"), prev: document.querySelector(".ctl.prev"), next: document.querySelector(".ctl.next") };
  const seek = document.querySelector(".seek");
  const cur = document.querySelector(".t-cur");
  const dur = document.querySelector(".t-dur");
  const now = document.querySelector(".now");
  const player = document.querySelector(".player");
  const ok = D.tracks.map((t, i) => t.src ? i : -1).filter((i) => i >= 0);
  if (!ok.length) return;

  const fmt = (s) => Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "–:––";
  let i = -1, dragging = false;

  // track lengths for the list, read from each file's header only
  D.tracks.forEach((t, k) => {
    if (!t.src) return;
    const a = new Audio();
    a.preload = "metadata";
    a.addEventListener("loadedmetadata", () => { rows[k].querySelector(".tr-time").textContent = fmt(a.duration); }, { once: true });
    a.src = t.src;
  });

  const load = (k) => {
    i = k;
    audio.src = D.tracks[k].src;
    now.innerHTML = "";
    const n = document.createElement("span");
    n.className = "now-n";
    n.textContent = String(k + 1).padStart(2, "0");
    now.append(n, " " + D.tracks[k].title);
    rows.forEach((r, n) => { if (n === k) r.setAttribute("aria-current", "true"); else r.removeAttribute("aria-current"); });
    seek.value = 0; cur.textContent = "0:00"; dur.textContent = "–:––";
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: D.tracks[k].title, artist: D.artist, album: D.album,
        artwork: [{ src: D.artwork, sizes: "512x512", type: "image/jpeg" }]
      });
    }
  };
  const play = (k) => { if (k !== i) load(k); audio.play().catch(() => {}); };
  const step = (d) => {
    const at = ok.indexOf(i);
    const n = at < 0 ? 0 : at + d;
    if (n >= 0 && n < ok.length) play(ok[n]);
  };

  btn.play.addEventListener("click", () => {
    if (i < 0) play(ok[0]);
    else if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  });
  btn.prev.addEventListener("click", () => {
    if (audio.currentTime > 3 || ok.indexOf(i) <= 0) { if (i >= 0) audio.currentTime = 0; }
    else step(-1);
  });
  btn.next.addEventListener("click", () => step(1));
  rows.forEach((r, k) => r.addEventListener("click", () => {
    if (k === i) { if (audio.paused) audio.play().catch(() => {}); else audio.pause(); }
    else play(k);
  }));

  const state = () => {
    const on = !audio.paused;
    player.classList.toggle("playing", on);
    btn.play.setAttribute("aria-label", on ? D.t.pause : D.t.play);
    btn.play.title = on ? D.t.pause : D.t.play;
    rows.forEach((r, n) => r.classList.toggle("playing", on && n === i));
  };
  audio.addEventListener("play", state);
  audio.addEventListener("pause", state);
  audio.addEventListener("loadedmetadata", () => { dur.textContent = fmt(audio.duration); });
  audio.addEventListener("timeupdate", () => {
    cur.textContent = fmt(audio.currentTime);
    if (!dragging && audio.duration) seek.value = Math.round(audio.currentTime / audio.duration * 1000);
  });
  audio.addEventListener("ended", () => {
    const at = ok.indexOf(i);
    if (at < ok.length - 1) play(ok[at + 1]);
    else { load(ok[0]); state(); }
  });

  seek.addEventListener("input", () => {
    dragging = true;
    if (audio.duration) cur.textContent = fmt(seek.value / 1000 * audio.duration);
  });
  seek.addEventListener("change", () => {
    dragging = false;
    if (i < 0) load(ok[0]);
    if (audio.duration) audio.currentTime = seek.value / 1000 * audio.duration;
  });

  if ("mediaSession" in navigator) {
    const h = { play: () => btn.play.click(), pause: () => audio.pause(), previoustrack: () => btn.prev.click(), nexttrack: () => step(1) };
    Object.entries(h).forEach(([k, f]) => { try { navigator.mediaSession.setActionHandler(k, f); } catch (e) {} });
  }
})();
