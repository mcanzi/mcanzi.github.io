/*
 * Pangolin, a small chess engine for the terminal on the home page (the "chess" command).
 * Runs as a Web Worker: post { fen, history, depth, time } and it answers { move, depth, score, nodes },
 * with move in coordinate notation ("e2e4", "e7e8q"). history is the list of earlier positions (FEN),
 * so the engine knows about repetitions.
 *
 * Board: 0x88, square = row * 16 + col, row 0 is rank 8. Pieces: 1-6 white P N B R Q K, 9-14 black.
 * Search: iterative deepening, alpha-beta with a transposition table, check extension, quiescence on
 * captures and promotions. Evaluation: material and piece-square tables (Michniewski's simplified
 * evaluation function), king tables blended by game phase, and a mop-up term for won endgames.
 * Strength is kept moderate by the depth limit and a small random bonus for each root move; the easier
 * level (against the pangolin) also makes a human-like choice among the best moves when they are close
 * (within 40 centipawns).
 */
(function () {
  "use strict";
  const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6, BLACK = 8;
  const VAL = [0, 100, 320, 330, 500, 900, 0];
  const PHASE = [0, 0, 1, 1, 2, 4, 0];
  const MATE = 30000, INF = 32000;

  const T = (a) => Int16Array.from(a);
  const PST = [null,
    T([0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5,
       0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0]),
    T([-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30,
       -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50]),
    T([-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10,
       -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20]),
    T([0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,
       -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0]),
    T([-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5,
       0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20]),
    T([-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
       -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10,
       20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20]),
  ];
  const KING_END = T([-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30,
    -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30,
    -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50]);

  const KN = [-33, -31, -18, -14, 14, 18, 31, 33];
  const KG = [-17, -16, -15, -1, 1, 15, 16, 17];
  const DIAG = [-17, -15, 15, 17], ORTH = [-16, -1, 1, 16];

  // Zobrist keys (two 32-bit halves)
  let seed = 0x9e3779b9;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
  const ZP = [new Int32Array(16 * 128), new Int32Array(16 * 128)];
  for (let i = 0; i < 16 * 128; i++) { ZP[0][i] = rnd(); ZP[1][i] = rnd(); }
  const ZC = [new Int32Array(16), new Int32Array(16)], ZE = [new Int32Array(128), new Int32Array(128)];
  for (let i = 0; i < 16; i++) { ZC[0][i] = rnd(); ZC[1][i] = rnd(); }
  for (let i = 0; i < 128; i++) { ZE[0][i] = rnd(); ZE[1][i] = rnd(); }
  const ZS0 = rnd(), ZS1 = rnd();

  // castling-right masks: moving from or to these squares clears rights (1 K, 2 Q, 4 k, 8 q)
  const CMASK = new Int32Array(128).fill(15);
  CMASK[0x74] = 15 & ~3; CMASK[0x77] = 15 & ~1; CMASK[0x70] = 15 & ~2;
  CMASK[0x04] = 15 & ~12; CMASK[0x07] = 15 & ~4; CMASK[0x00] = 15 & ~8;

  // ---- position --------------------------------------------------------------------
  const board = new Int8Array(128);
  let side = 0, castle = 0, ep = -1, h0 = 0, h1 = 0;
  const kingSq = [0, 0];
  const stack = [];   // undo records

  const sqName = (s) => "abcdefgh"[s & 7] + (8 - (s >> 4));
  const parseSq = (n) => (8 - +n[1]) * 16 + (n.charCodeAt(0) - 97);

  function rehash() {
    h0 = 0; h1 = 0;
    for (let s = 0; s < 128; s++) if (!(s & 0x88) && board[s]) { h0 ^= ZP[0][board[s] * 128 + s]; h1 ^= ZP[1][board[s] * 128 + s]; }
    h0 ^= ZC[0][castle]; h1 ^= ZC[1][castle];
    if (ep >= 0) { h0 ^= ZE[0][ep]; h1 ^= ZE[1][ep]; }
    if (side) { h0 ^= ZS0; h1 ^= ZS1; }
  }

  function setFen(fen) {
    board.fill(0);
    const [pos, stm, cas, eps] = fen.trim().split(/\s+/);
    let row = 0, col = 0;
    for (const ch of pos) {
      if (ch === "/") { row++; col = 0; continue; }
      if (ch >= "1" && ch <= "8") { col += +ch; continue; }
      const t = "pnbrqk".indexOf(ch.toLowerCase()) + 1;
      const c = ch === ch.toLowerCase() ? BLACK : 0;
      const s = row * 16 + col;
      board[s] = t | c;
      if (t === K) kingSq[c ? 1 : 0] = s;
      col++;
    }
    side = stm === "b" ? 1 : 0;
    castle = (cas.includes("K") ? 1 : 0) | (cas.includes("Q") ? 2 : 0) | (cas.includes("k") ? 4 : 0) | (cas.includes("q") ? 8 : 0);
    ep = eps && eps !== "-" ? parseSq(eps) : -1;
    rehash();
  }

  function attacked(s, by) {   // is square s attacked by side `by`?
    const c = by ? BLACK : 0;
    // pawns
    const pd = by ? -16 : 16;   // white pawns attack from below (higher row numbers)
    for (const d of [pd - 1, pd + 1]) { const f = s + d; if (!(f & 0x88) && board[f] === (P | c)) return true; }
    for (const d of KN) { const f = s + d; if (!(f & 0x88) && board[f] === (N | c)) return true; }
    for (const d of KG) { const f = s + d; if (!(f & 0x88) && board[f] === (K | c)) return true; }
    for (const d of DIAG) {
      let f = s + d;
      while (!(f & 0x88)) { const p = board[f]; if (p) { if (p === (B | c) || p === (Q | c)) return true; break; } f += d; }
    }
    for (const d of ORTH) {
      let f = s + d;
      while (!(f & 0x88)) { const p = board[f]; if (p) { if (p === (R | c) || p === (Q | c)) return true; break; } f += d; }
    }
    return false;
  }
  const inCheck = (sd) => attacked(kingSq[sd], sd ^ 1);

  // move: from | to << 7 | promo << 14 | flag << 17   (flag 1 ep, 2 castle, 4 double push)
  const mv = (f, t, pr, fl) => f | (t << 7) | (pr << 14) | (fl << 17);
  const mFrom = (m) => m & 127, mTo = (m) => (m >> 7) & 127, mPro = (m) => (m >> 14) & 7, mFlag = (m) => m >> 17;

  function gen(out, capturesOnly) {
    const c = side ? BLACK : 0, opp = side ? 0 : BLACK;
    const fwd = side ? 16 : -16, startRow = side ? 1 : 6, promoRow = side ? 7 : 0;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = board[s];
      if (!p || (p & BLACK) !== c) continue;
      const t = p & 7;
      if (t === P) {
        const f = s + fwd;
        if (!(f & 0x88) && !board[f]) {
          if ((f >> 4) === promoRow) { out.push(mv(s, f, Q, 0)); if (!capturesOnly) { out.push(mv(s, f, N, 0), mv(s, f, R, 0), mv(s, f, B, 0)); } }
          else if (!capturesOnly) {
            out.push(mv(s, f, 0, 0));
            const f2 = f + fwd;
            if ((s >> 4) === startRow && !board[f2]) out.push(mv(s, f2, 0, 4));
          }
        }
        for (const d of [fwd - 1, fwd + 1]) {
          const f2 = s + d;
          if (f2 & 0x88) continue;
          const q = board[f2];
          if (q && (q & BLACK) === opp) {
            if ((f2 >> 4) === promoRow) { out.push(mv(s, f2, Q, 0)); if (!capturesOnly) out.push(mv(s, f2, N, 0), mv(s, f2, R, 0), mv(s, f2, B, 0)); }
            else out.push(mv(s, f2, 0, 0));
          } else if (f2 === ep) out.push(mv(s, f2, 0, 1));
        }
      } else if (t === N || t === K) {
        for (const d of t === N ? KN : KG) {
          const f = s + d;
          if (f & 0x88) continue;
          const q = board[f];
          if (q ? (q & BLACK) === opp : !capturesOnly) out.push(mv(s, f, 0, 0));
        }
        if (t === K && !capturesOnly) {
          if (side === 0 && s === 0x74) {
            if ((castle & 1) && !board[0x75] && !board[0x76] && board[0x77] === R && !attacked(0x74, 1) && !attacked(0x75, 1) && !attacked(0x76, 1)) out.push(mv(s, 0x76, 0, 2));
            if ((castle & 2) && !board[0x73] && !board[0x72] && !board[0x71] && board[0x70] === R && !attacked(0x74, 1) && !attacked(0x73, 1) && !attacked(0x72, 1)) out.push(mv(s, 0x72, 0, 2));
          } else if (side === 1 && s === 0x04) {
            if ((castle & 4) && !board[0x05] && !board[0x06] && board[0x07] === (R | BLACK) && !attacked(0x04, 0) && !attacked(0x05, 0) && !attacked(0x06, 0)) out.push(mv(s, 0x06, 0, 2));
            if ((castle & 8) && !board[0x03] && !board[0x02] && !board[0x01] && board[0x00] === (R | BLACK) && !attacked(0x04, 0) && !attacked(0x03, 0) && !attacked(0x02, 0)) out.push(mv(s, 0x02, 0, 2));
          }
        }
      } else {
        const dirs = t === B ? DIAG : t === R ? ORTH : KG;
        for (const d of dirs) {
          let f = s + d;
          while (!(f & 0x88)) {
            const q = board[f];
            if (q) { if ((q & BLACK) === opp) out.push(mv(s, f, 0, 0)); break; }
            if (!capturesOnly) out.push(mv(s, f, 0, 0));
            f += d;
          }
        }
      }
    }
    return out;
  }

  const put = (s, p) => { board[s] = p; h0 ^= ZP[0][p * 128 + s]; h1 ^= ZP[1][p * 128 + s]; };
  const take = (s) => { const p = board[s]; board[s] = 0; h0 ^= ZP[0][p * 128 + s]; h1 ^= ZP[1][p * 128 + s]; return p; };

  // returns false (and undoes it) if the move leaves the mover's king in check
  function make(m) {
    const f = mFrom(m), t = mTo(m), pr = mPro(m), fl = mFlag(m);
    const p = board[f], c = p & BLACK;
    stack.push([board[t], castle, ep, h0, h1, m]);
    if (ep >= 0) { h0 ^= ZE[0][ep]; h1 ^= ZE[1][ep]; }
    h0 ^= ZC[0][castle]; h1 ^= ZC[1][castle];
    if (board[t]) take(t);
    take(f);
    put(t, pr ? pr | c : p);
    if (fl & 1) take(t + (side ? -16 : 16));
    if (fl & 2) {
      if (t === 0x76) put(0x75, take(0x77)); else if (t === 0x72) put(0x73, take(0x70));
      else if (t === 0x06) put(0x05, take(0x07)); else if (t === 0x02) put(0x03, take(0x00));
    }
    if ((p & 7) === K) kingSq[side] = t;
    castle &= CMASK[f] & CMASK[t];
    ep = fl & 4 ? (f + t) >> 1 : -1;
    h0 ^= ZC[0][castle]; h1 ^= ZC[1][castle];
    if (ep >= 0) { h0 ^= ZE[0][ep]; h1 ^= ZE[1][ep]; }
    side ^= 1; h0 ^= ZS0; h1 ^= ZS1;
    if (inCheck(side ^ 1)) { unmake(); return false; }
    return true;
  }

  function unmake() {
    const [cap, cas, eps, a, b, m] = stack.pop();
    side ^= 1;
    const f = mFrom(m), t = mTo(m), pr = mPro(m), fl = mFlag(m);
    let p = board[t];
    if (pr) p = P | (p & BLACK);
    board[f] = p; board[t] = cap;
    if (fl & 1) board[t + (side ? -16 : 16)] = P | (side ? 0 : BLACK);
    if (fl & 2) {
      if (t === 0x76) { board[0x77] = board[0x75]; board[0x75] = 0; }
      else if (t === 0x72) { board[0x70] = board[0x73]; board[0x73] = 0; }
      else if (t === 0x06) { board[0x07] = board[0x05]; board[0x05] = 0; }
      else if (t === 0x02) { board[0x00] = board[0x03]; board[0x03] = 0; }
    }
    if ((p & 7) === K) kingSq[side] = f;
    castle = cas; ep = eps; h0 = a; h1 = b;
  }

  function perft(d) {
    if (d === 0) return 1;
    let n = 0;
    for (const m of gen([], false)) if (make(m)) { n += perft(d - 1); unmake(); }
    return n;
  }

  // ---- evaluation (from the side to move's point of view) ---------------------------
  function evaluate() {
    let mg = [0, 0], eg = [0, 0], phase = 0, mat = [0, 0], bishops = [0, 0];
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = board[s];
      if (!p) continue;
      const t = p & 7, w = p & BLACK ? 1 : 0;
      const i = w ? (7 - (s >> 4)) * 8 + (s & 7) : (s >> 4) * 8 + (s & 7);
      mat[w] += VAL[t];
      phase += PHASE[t];
      if (t === B) bishops[w]++;
      if (t === K) { mg[w] += PST[K][i]; eg[w] += KING_END[i]; }
      else { const v = VAL[t] + PST[t][i]; mg[w] += v; eg[w] += v; }
    }
    if (phase > 24) phase = 24;
    let score = ((mg[0] - mg[1]) * phase + (eg[0] - eg[1]) * (24 - phase)) / 24;
    if (bishops[0] >= 2) score += 30;
    if (bishops[1] >= 2) score -= 30;
    // mop-up: in a won endgame, drive the losing king to the edge and bring the winning king close
    const diff = mat[0] - mat[1];
    if (phase <= 6 && Math.abs(diff) >= 400) {
      const win = diff > 0 ? 0 : 1, lk = kingSq[win ^ 1], wk = kingSq[win];
      const lr = lk >> 4, lc = lk & 7, wr = wk >> 4, wc = wk & 7;
      const centre = Math.max(3 - lr, lr - 4) + Math.max(3 - lc, lc - 4);
      const dist = Math.abs(lr - wr) + Math.abs(lc - wc);
      const bonus = 10 * centre + 4 * (14 - dist);
      score += win === 0 ? bonus : -bonus;
    }
    score = Math.round(score);
    return side ? -score : score;
  }

  // ---- search -----------------------------------------------------------------------
  const TT_BITS = 18, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
  const ttKey = new Int32Array(TT_SIZE), ttMove = new Int32Array(TT_SIZE), ttScore = new Int16Array(TT_SIZE);
  const ttDepth = new Int8Array(TT_SIZE), ttFlag = new Int8Array(TT_SIZE);   // flag 1 exact, 2 lower, 3 upper
  let nodes = 0, stopAt = 0, stopped = false;
  const killers = [];
  let seen = new Set(), path = [];
  const posKey = () => h0 + ":" + h1;

  const victimScore = (m) => {
    const t = mTo(m), cap = mFlag(m) & 1 ? P : board[t] & 7;
    return cap ? 10 * VAL[cap] - VAL[board[mFrom(m)] & 7] / 10 + 1000 : 0;
  };

  function order(moves, ply, ttm) {
    const sc = moves.map((m) => {
      if (m === ttm) return 1e6;
      let s = victimScore(m);
      if (mPro(m) === Q) s += 9000;
      if (!s && killers[ply] && (killers[ply][0] === m || killers[ply][1] === m)) s = 500;
      return s;
    });
    const idx = moves.map((_, i) => i).sort((a, b) => sc[b] - sc[a]);
    return idx.map((i) => moves[i]);
  }

  function quiesce(alpha, beta, ply) {
    nodes++;
    if ((nodes & 2047) === 0 && Date.now() > stopAt) stopped = true;
    if (stopped) return 0;
    const stand = evaluate();
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (ply > 40) return stand;
    for (const m of order(gen([], true), ply, 0)) {
      if (!make(m)) continue;
      const s = -quiesce(-beta, -alpha, ply + 1);
      unmake();
      if (stopped) return 0;
      if (s >= beta) return s;
      if (s > alpha) alpha = s;
    }
    return alpha;
  }

  function search(depth, alpha, beta, ply) {
    if (ply > 0) {
      const key = posKey();
      if (seen.has(key) || path.includes(key)) return 0;   // repetition: count as a draw
    }
    const check = inCheck(side);
    if (check && ply < 30) depth++;
    if (depth <= 0) return quiesce(alpha, beta, ply);
    nodes++;
    if ((nodes & 2047) === 0 && Date.now() > stopAt) stopped = true;
    if (stopped) return 0;

    const slot = h0 & TT_MASK;
    let ttm = 0;
    if (ttKey[slot] === h1) {
      ttm = ttMove[slot];
      if (ply > 0 && ttDepth[slot] >= depth) {
        const s = ttScore[slot], f = ttFlag[slot];
        if (f === 1 || (f === 2 && s >= beta) || (f === 3 && s <= alpha)) return s;
      }
    }

    const a0 = alpha;
    let best = -INF, bestMove = 0, legal = 0;
    path.push(posKey());
    for (const m of order(gen([], false), ply, ttm)) {
      if (!make(m)) continue;
      legal++;
      const s = -search(depth - 1, -beta, -alpha, ply + 1);
      unmake();
      if (stopped) { path.pop(); return 0; }
      if (s > best) { best = s; bestMove = m; }
      if (s > alpha) alpha = s;
      if (alpha >= beta) {
        if (!victimScore(m)) { killers[ply] = killers[ply] || [0, 0]; if (killers[ply][0] !== m) { killers[ply][1] = killers[ply][0]; killers[ply][0] = m; } }
        break;
      }
    }
    path.pop();
    if (!legal) return check ? -MATE + ply : 0;
    ttKey[slot] = h1; ttMove[slot] = bestMove; ttScore[slot] = best; ttDepth[slot] = depth;
    ttFlag[slot] = best <= a0 ? 3 : best >= beta ? 2 : 1;
    return best;
  }

  // root: every legal move gets a small random bonus, more in the opening, so games vary
  function think(fen, history, maxDepth, timeMs, human) {
    setFen(fen);
    seen = new Set();
    for (const h of history || []) { setFen(h); seen.add(posKey()); }
    setFen(fen);
    seen.delete(posKey());
    path = [];
    killers.length = 0;
    nodes = 0; stopped = false; stopAt = Date.now() + timeMs;
    const fullmove = +(fen.split(/\s+/)[5] || 1);
    const spread = fullmove <= 8 ? 24 : 6;
    let root = [];
    for (const m of gen([], false)) if (make(m)) { unmake(); root.push({ m, bonus: Math.floor(Math.random() * (spread + 1)) }); }
    if (!root.length) return { move: null };
    let bestMove = root[0].m, bestScore = 0, done = 0;
    for (let d = 1; d <= maxDepth; d++) {
      let alpha = -INF, curBest = 0, curScore = -INF;
      const slot = h0 & TT_MASK, ttm = ttKey[slot] === h1 ? ttMove[slot] : 0;
      root.sort((a, b) => (b.m === bestMove) - (a.m === bestMove) || (b.m === ttm) - (a.m === ttm) || victimScore(b.m) - victimScore(a.m));
      path.push(posKey());
      for (const r of root) {
        make(r.m);
        const raw = -search(d - 1, -INF, -alpha + r.bonus, 1);
        const s = raw + (Math.abs(raw) < MATE - 100 ? r.bonus : 0);
        unmake();
        if (stopped) break;
        if (s > curScore) { curScore = s; curBest = r.m; }
        if (s > alpha) alpha = s;
      }
      path.pop();
      if (stopped && d > 1) break;
      bestMove = curBest || bestMove; bestScore = curScore; done = d;
      if (bestScore > MATE - 100) break;
      if (stopped) break;
    }
    // a human-like choice: score every root move exactly, then pick among the moves within 40 centipawns
    // of the best (best 55%, second 30%, third 15%); skipped when a mate is found or time is up
    if (human && done >= 1 && Math.abs(bestScore) < MATE - 100 && !stopped) {
      const scored = [];
      path.push(posKey());
      for (const r of root) {
        make(r.m);
        const s = -search(done - 1, -INF, INF, 1);
        unmake();
        if (stopped) break;
        scored.push({ m: r.m, s });
      }
      path.pop();
      if (!stopped && scored.length) {
        scored.sort((a, b) => b.s - a.s);
        const near = scored.filter((x) => x.s >= scored[0].s - 40).slice(0, 3);
        const w = [0.55, 0.3, 0.15].slice(0, near.length);
        let pick = Math.random() * w.reduce((a, b) => a + b, 0), i = 0;
        while (i < near.length - 1 && (pick -= w[i]) > 0) i++;
        bestMove = near[i].m; bestScore = near[i].s;
      }
    }
    const pr = mPro(bestMove);
    return { move: sqName(mFrom(bestMove)) + sqName(mTo(bestMove)) + (pr ? " nbrq"[pr - 1] : ""), depth: done, score: bestScore, nodes };
  }

  const api = { think, perft: (fen, d) => { setFen(fen); return perft(d); } };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else if (typeof self !== "undefined" && typeof self.postMessage === "function") {
    self.onmessage = (e) => {
      const { fen, history, depth, time, human } = e.data;
      self.postMessage(think(fen, history, depth || 3, time || 1500, !!human));
    };
  }
})();
