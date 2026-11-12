// Chess in the home-page terminal (layouts/index.html loads this the first time "chess" is typed).
// "chess" starts a game against the engine (engine.js, in a Web Worker), with white or black at random.
// While a game is on, a line that is not a terminal command is read as a move (e4, Nf3, O-O, exd5,
// e8=Q, or e2e4); "board", "undo" and "resign" also work. When the engine replies, the terminal is
// cleared, so only the new board and the reply are on screen. chess-lib.js (chess.js) checks the moves.
import { Chess } from "./chess-lib.js";

// engine strength: search depth in half-moves (plus captures and checks), and whether it picks among
// close best moves like a human. The pangolin plays the easier level; the Doglord (purple theme, chosen
// when the game starts) plays the original, stronger one
const LEVELS = { pangolin: { depth: 3, human: true }, doglord: { depth: 4, human: false } };
const TIME = 2000;    // time limit per move, in ms, for slow phones

export function setup({ T, pre, add, fill, finish, log, pangolinSays }) {
  const S = T.t.chess;
  let g = null;   // the game: { c, you, fens, busy, level }
  let worker = null;

  const colourName = (col) => (col === "w" ? S.white : S.black);
  // in the purple theme (the Doglord has been summoned) you play the Doglord instead of the pangolin
  const who = () => (document.documentElement.dataset.theme === "purple" ? S.whoDoglord : S.who);
  const say = (p, text) => add(p, fill(text, { who: who() }), "term-out");

  // the solid chess symbols for both sides, told apart by colour (fonts.css: the Chess Pieces font);
  // U+FE0E asks for the text form, so phones do not turn the pawn into an emoji
  const GLYPH = { k: "\u265A", q: "\u265B", r: "\u265C", b: "\u265D", n: "\u265E", p: "\u265F" };
  // the outline symbols, drawn over the solid ones in the other side's colour
  const OUTLINE = { k: "\u2654", q: "\u2655", r: "\u2656", b: "\u2657", n: "\u2658", p: "\u2659" };

  // the board as text, from the player's side; the last move and a king in check are coloured
  const drawBoard = (p) => {
    const code = document.createElement("code");
    code.className = "chess-board";
    code.setAttribute("aria-label", g.c.fen());
    const rows = g.c.board();
    const hist = g.c.history({ verbose: true });
    const last = hist.length ? hist[hist.length - 1] : null;
    const checkSq = g.c.inCheck() ? g.c.findPiece({ type: "k", color: g.c.turn() })[0] : null;
    const order = [0, 1, 2, 3, 4, 5, 6, 7];
    const rIdx = g.you === "w" ? order : order.slice().reverse();
    const cIdx = g.you === "w" ? order : order.slice().reverse();
    const text = (s) => code.appendChild(document.createTextNode(s));
    for (const r of rIdx) {
      text(" " + (8 - r) + "  ");
      cIdx.forEach((col, k) => {
        const sq = "abcdefgh"[col] + (8 - r);
        const pc = rows[r][col];
        const span = document.createElement("span");
        span.textContent = pc ? GLYPH[pc.type] + "\uFE0E" : ".";
        if (pc) span.dataset.o = OUTLINE[pc.type] + "\uFE0E";
        const cls = pc ? ["pc", pc.color === "w" ? "cw" : "cb"] : ["ce"];
        if (last && (sq === last.from || sq === last.to)) cls.push("clast");
        if (sq === checkSq) cls.push("ccheck");
        span.className = cls.join(" ");
        code.appendChild(span);
        if (k < 7) text(" ");
      });
      text("\n");
    }
    text("    " + cIdx.map((col) => "abcdefgh"[col]).join(" "));
    p.appendChild(code);
    p.appendChild(document.createTextNode("\n"));
  };

  // checkmate, stalemate and the other draws: the message, or "" if the game goes on
  const result = () => {
    const c = g.c;
    let msg = "";
    if (c.isCheckmate()) msg = c.turn() === g.you ? S.youLose : S.youWin;
    else if (c.isStalemate()) msg = S.drawStalemate;
    else if (c.isThreefoldRepetition()) msg = S.drawRepetition;
    else if (c.isInsufficientMaterial()) msg = S.drawMaterial;
    else if (c.isDraw()) msg = S.drawFifty;
    return msg;
  };

  // a move typed by the player, in any of the usual forms
  const tryMove = (s) => {
    const c = g.c;
    const attempt = (x) => { try { return c.move(x); } catch (e) { return null; } };
    s = s.replace(/0/g, "O").replace(/[+#!?]+$/, "");
    let m = attempt(s);
    if (!m && /^[nbrqk]/.test(s)) m = attempt(s[0].toUpperCase() + s.slice(1));
    if (!m) {
      const u = s.toLowerCase().match(/^([a-h][1-8])-?([a-h][1-8])=?([nbrq])?$/);
      if (u) m = attempt({ from: u[1], to: u[2], promotion: u[3] || "q" });
    }
    return m;
  };

  // the screens after a reply and at the start hold only the board and a line or two of text,
  // scrolled so that the text under the board is always visible
  const bottom = () => { log.scrollTop = log.scrollHeight; };

  // the engine's reply wipes the terminal, so only the new board and the reply are left;
  // intro is the start message, shown after the engine's first move when the player has black
  const engineMove = (intro) => {
    if (!worker) worker = new Worker(new URL("./engine.js" + new URL(import.meta.url).search, import.meta.url));   // same ?v= as this file, so a new engine is not cached
    g.busy = true;
    const game = g;
    worker.onmessage = (e) => {
      if (g !== game) return;   // resigned or restarted meanwhile
      g.busy = false;
      const r = e.data;
      log.replaceChildren();
      const p = pre();
      if (!r.move) { say(p, result() || S.error); g = null; bottom(); return; }
      g.fens.push(g.c.fen());
      const m = g.c.move({ from: r.move.slice(0, 2), to: r.move.slice(2, 4), promotion: r.move[4] });
      drawBoard(p);
      const end = result();
      say(p, fill(S.engineMove, { move: m.san, who: who() }) + " " + (end || intro || (game.c.inCheck() ? S.check + " " : "") + S.yourMove));
      if (end) g = null;
      bottom();
    };
    worker.onerror = () => { if (g === game) { g = null; const p = pre(); say(p, S.error); finish(p); } };
    worker.postMessage({ fen: g.c.fen(), history: g.fens, depth: g.level.depth, human: g.level.human, time: TIME });
  };

  // a new game clears the terminal: the board, then the start message
  const newGame = () => {
    const level = document.documentElement.dataset.theme === "purple" ? LEVELS.doglord : LEVELS.pangolin;
    g = { c: new Chess(), you: Math.random() < 0.5 ? "w" : "b", fens: [], busy: false, level };
    const intro = fill(S.start, { colour: colourName(g.you) });
    log.replaceChildren();
    if (g.you === "b") { engineMove(intro); return; }
    const p = pre();
    drawBoard(p);
    say(p, intro);
    bottom();
  };

  // a line typed while a game is on: an in-game command or a move. Returns false if it is neither,
  // so the terminal can say "command not found"
  const line = (text, p) => {
    const cmd = text.trim().toLowerCase();
    if (g.busy) { say(p, S.wait); return true; }
    if (cmd === "board") { drawBoard(p); say(p, S.yourMove); return true; }
    // resigning clears the terminal and the pangolin (or the wizard dog) announces it
    if (cmd === "resign") { g = null; log.replaceChildren(); pangolinSays(pre(), fill(S.resigned, { who: who() })); return true; }
    if (cmd === "undo") {
      const n = g.c.history().length;
      if (n < 2 || (g.you === "b" && n < 3)) { say(p, S.undoNone); return true; }
      g.c.undo(); g.c.undo(); g.fens.splice(-2);
      drawBoard(p); say(p, S.yourMove);
      return true;
    }
    if (/\s/.test(text.trim())) return false;
    const before = g.c.fen();
    const m = tryMove(text.trim());
    if (!m) {
      // something that looks like a move gets "illegal move"; anything else is left to the terminal
      if (/^([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](=?[NBRQnbrq])?|[Oo0]-[Oo0](-[Oo0])?|[a-h][1-8]-?[a-h][1-8][nbrq]?|[nbrqk][a-h]?[1-8]?x?[a-h][1-8])[+#]?$/.test(text.trim())) {
        say(p, fill(S.illegal, { move: text.trim() }));
        return true;
      }
      return false;
    }
    g.fens.push(before);
    const end = result();
    if (end) { drawBoard(p); say(p, end); g = null; return true; }
    engineMove();
    return true;
  };

  return {
    start: (args, p) => newGame(args, p),
    active: () => !!g,
    line,
  };
}
