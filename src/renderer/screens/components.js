// Small shared helpers used by multiple screens: a seeded PRNG, HTML
// element factory, and timer helpers.

// ---- Seeded PRNG (sfc32 seeded by xmur3) -----------------------------
// Deterministic for a given string seed. We use this so that picking
// questions and scenarios is reproducible when the same seed is entered.
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
function sfc32(a, b, c, d) {
  return function () {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (a + b | 0) + d | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = c + (c << 3) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function makeRng(seedStr) {
  const seed = xmur3(String(seedStr));
  return sfc32(seed(), seed(), seed(), seed());
}

export function pickN(rng, arr, n) {
  // Returns a deterministic random sample of `n` items from `arr`.
  const copy = arr.slice();
  // Fisher-Yates using rng
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

export function pickOne(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function shuffle(rng, arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ---- DOM helper ------------------------------------------------------
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'dataset') {
      for (const [dk, dv] of Object.entries(v)) el.dataset[dk] = dv;
    } else {
      el.setAttribute(k, v);
    }
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    if (typeof kid === 'string' || typeof kid === 'number') {
      el.appendChild(document.createTextNode(String(kid)));
    } else {
      el.appendChild(kid);
    }
  }
  return el;
}

// ---- Timer / countdown ----------------------------------------------
export function makeCountdown(seconds, onTick, onDone) {
  // Returns { stop, pause, resume, snapshot, getRemaining }
  let remaining = seconds;
  let handle = null;

  function tick() {
    remaining -= 1;
    if (onTick) onTick(formatTime(remaining), remaining);
    if (remaining <= 0) {
      clearInterval(handle);
      handle = null;
      if (onDone) onDone();
    }
  }
  handle = setInterval(tick, 1000);
  if (onTick) onTick(formatTime(remaining), remaining);
  return {
    stop() { if (handle) clearInterval(handle); handle = null; },
    pause() { if (handle) { clearInterval(handle); handle = null; } },
    resume() { if (!handle) handle = setInterval(tick, 1000); },
    getRemaining() { return remaining; },
  };
}

export function formatTime(seconds) {
  if (seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

// ---- Common id / seed helpers ---------------------------------------
export function newAttemptId() {
  const d = new Date();
  const stamp = d.toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const tail = Math.random().toString(36).slice(2, 6);
  return `att_${stamp}_${tail}`;
}

export function randomSeed() {
  // 8-char human-friendly seed.
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
