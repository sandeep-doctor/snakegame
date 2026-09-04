"use strict";

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

const COLS = 24, ROWS = 15;
const COMBO_WINDOW = 3200;

const DIFFS = {
  // Classic: starts at a comfortable pace, speeds up as you level,
  // capped at insane speed so it never exceeds it.
  classic: { speed0: 6, speedMax: 9.5, accel: 0.055, obs: 3 },
  // Insane: flat-out pro speed from the start, no speed-up with level.
  insane:  { speed0: 9.5, speedMax: 9.5, accel: 0, obs: 9 }
};

const BUFFS = {
  slow:   { dur: 6000, color: "#54c8ff", tag: "SLOW-MO", name: "Slow-Mo" },
  double: { dur: 7000, color: "#ffd166", tag: "2X PTS",  name: "Double Points" },
  shield: { dur: 10000, color: "#b388ff", tag: "SHIELD",  name: "Shield" },
  magnet: { dur: 8000, color: "#ff8a80", tag: "MAGNET",  name: "Magnet" }
};
const SHIELD_WARN_MS = 3000;

const FOODS = {
  apple:  { pts: 10, w: 34, c1: "#ff8a80", c2: "#e63946", c3: "#b3202e", glow: "rgba(255,90,104,.85)", leaf: true },
  orange: { pts: 15, w: 22, c1: "#ffd6a5", c2: "#fb8500", c3: "#b65d00", glow: "rgba(251,133,0,.85)", leaf: true },
  berry:  { pts: 20, w: 16, c1: "#9db4ff", c2: "#3f5efb", c3: "#1e2a8a", glow: "rgba(90,120,255,.85)", leaf: false },
  cherry: { pts: 30, w: 12, c1: "#ff8fa3", c2: "#d90429", c3: "#7a0019", glow: "rgba(255,60,110,.9)", leaf: true, double: true },
  grape:  { pts: 25, w: 11, c1: "#e0aaff", c2: "#9d4edd", c3: "#5a189a", glow: "rgba(157,78,221,.85)", leaf: true, cluster: true },
  golden: { pts: 50, w: 5,  c1: "#fff3c4", c2: "#ffd166", c3: "#b26a00", glow: "rgba(255,209,102,.95)", leaf: true, sparkle: true }
};

function pickFruitKind() {
  // Only owned fruits spawn — locked store fruits stay out of the pool.
  const pool = Object.keys(FOODS).filter(k => fruitOwned(k));
  const kinds = pool.length ? pool : ["apple"];
  const total = kinds.reduce((s, k) => s + FOODS[k].w, 0);
  let r = Math.random() * total;
  for (const k of kinds) {
    r -= FOODS[k].w;
    if (r <= 0) return k;
  }
  return kinds[0];
}

const THEMES = {
  neon:    { a: "#3dff8f", b: "#12b981", acc2: "#19d3ff", glow: "rgba(61,255,143,.75)" },
  cyan:    { a: "#37e6ff", b: "#118ab2", acc2: "#3dff8f", glow: "rgba(55,230,255,.75)" },
  magenta: { a: "#ff5ce1", b: "#c026d3", acc2: "#ffb84d", glow: "rgba(255,92,225,.75)" },
  gold:    { a: "#ffd166", b: "#f77f00", acc2: "#ff5ce1", glow: "rgba(255,209,102,.75)" }
};
const THEME_REQ = { neon: 0, cyan: 100, magenta: 250, gold: 500 };

// Store catalog: star prices. Skins are also unlocked by score milestones
// (THEME_REQ) — buying is an alternate way to unlock. Forms only change the
// snake's look. Locked fruits never spawn until owned.
const STORE = {
  themes: [
    { id: "neon", price: 0 },
    { id: "cyan", price: 30 },
    { id: "magenta", price: 80 },
    { id: "gold", price: 150 }
  ],
  forms: [
    { id: "classic", name: "Classic", price: 0 },
    { id: "bubble", name: "Bubble", price: 40 },
    { id: "blocky", name: "Blocky", price: 70 },
    { id: "arrow", name: "Arrow", price: 100 },
    { id: "glossy", name: "3D Gloss", price: 150 }
  ],
  fruits: [
    { id: "apple", emoji: "\u{1F34E}", price: 0 },
    { id: "orange", emoji: "\u{1F34A}", price: 0 },
    { id: "berry", emoji: "\u{1FAD0}", price: 0 },
    { id: "cherry", emoji: "\u{1F352}", price: 25 },
    { id: "grape", emoji: "\u{1F347}", price: 40 },
    { id: "golden", emoji: "\u2728", price: 60 }
  ]
};
const FORMS = { classic: 1, bubble: 1, blocky: 1, arrow: 1, glossy: 1 };

const DIRS = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
  left: { x: -1, y: 0 }, right: { x: 1, y: 0 }
};

const DEFAULTS = {
  difficulty: "classic", walls: "solid", obstacles: true,
  touch: "auto", theme: "neon", form: "classic", mode: "dark",
  music: true, sfx: true, haptics: true
};

const LEGACY_DIFFS = { easy: "classic", normal: "classic", hard: "classic", general: "classic" };

let settings = { ...DEFAULTS };
let best = 0;
// Per-mode bests: key = "difficulty|walls|obstacles" e.g. "classic|wrap|off"
let bests = {};
let stats = { games: 0, apples: 0, stars: 0 };
// Store purchases (theme/form/fruit ids bought with stars).
let store = { themes: [], forms: [], fruits: [] };
try {
  const s = JSON.parse(localStorage.getItem("ns_settings"));
  if (s) settings = { ...DEFAULTS, ...s };
  // Map removed difficulties (easy/normal/hard) to classic.
  if (settings.difficulty in LEGACY_DIFFS) settings.difficulty = LEGACY_DIFFS[settings.difficulty];
  if (!(settings.difficulty in DIFFS)) settings.difficulty = "classic";
  best = +localStorage.getItem("ns_best") || 0;
  const st = JSON.parse(localStorage.getItem("ns_stats"));
  if (st) stats = { ...stats, ...st };
  const bs = JSON.parse(localStorage.getItem("ns_bests"));
  if (bs && typeof bs === "object") {
    for (const k of Object.keys(bs)) {
      const v = +bs[k] || 0;
      if (v <= 0) continue;
      if (k.includes("|")) {
        // Remap legacy combo keys (easy|.. / normal|.. / hard|..) to classic.
        const parts = String(k).split("|");
        let dk = parts[0];
        if (dk in LEGACY_DIFFS) dk = LEGACY_DIFFS[dk];
        if (!(dk in DIFFS)) dk = "classic";
        const nk = `${dk}|${parts[1] === "wrap" ? "wrap" : "solid"}|${parts[2] === "off" ? "off" : "on"}`;
        bests[nk] = Math.max(bests[nk] || 0, v);
      } else {
        // Migrate difficulty-only format to a full combo key.
        let dk = k;
        if (dk in LEGACY_DIFFS) dk = LEGACY_DIFFS[dk];
        if (!(dk in DIFFS)) continue;
        const wallGuess = settings.walls === "wrap" ? settings.walls : "solid";
        const obsGuess = settings.obstacles ? "on" : "off";
        const fk = `${dk}|${wallGuess}|${obsGuess}`;
        bests[fk] = Math.max(bests[fk] || 0, v);
      }
    }
  }
  if (!Object.keys(bests).length && best > 0) {
    // Migrate legacy overall best into the current combo so it isn't lost.
    bests[comboKeyOf(settings)] = best;
  }
  // Overall best is always the max of per-mode bests (keeps them in sync).
  const vals = Object.values(bests);
  if (vals.length) best = Math.max(best, ...vals);
  try {
    const ow = JSON.parse(localStorage.getItem("ns_store"));
    if (ow && typeof ow === "object") {
      for (const k of ["themes", "forms", "fruits"]) {
        if (Array.isArray(ow[k])) store[k] = ow[k].filter(x => typeof x === "string");
      }
    }
  } catch (e2) {}
  if (!(settings.theme in THEMES)) settings.theme = "neon";
  if (!(settings.form in FORMS)) settings.form = "classic";
} catch (e) {}

function normDiff(d) {
  if (d in DIFFS) return d;
  if (d in LEGACY_DIFFS) return LEGACY_DIFFS[d];
  return "classic";
}
function normWalls(w) { return (w === "wrap") ? "wrap" : "solid"; }
function normObs(o) { return o ? "on" : "off"; }

function comboKeyOf(st) {
  return `${normDiff(st.difficulty)}|${normWalls(st.walls)}|${normObs(st.obstacles)}`;
}

function modeKey() {
  return comboKeyOf(settings);
}

function shortModeLabel(key) {
  const [d, w, o] = String(key).split("|");
  const dd = normDiff(d).toUpperCase();
  const ww = normWalls(w) === "wrap" ? "WRAP" : "SOLID";
  const oo = normObs(o === "on") === "on" ? "OBS ON" : "OBS OFF";
  return `${dd} · ${ww} · ${oo}`;
}

function modeBest(key) {
  return bests[key || modeKey()] || 0;
}

function recordScore(sc) {
  let isModeBest = false;
  const k = modeKey();
  if (sc > (bests[k] || 0)) { bests[k] = sc; isModeBest = true; }
  if (sc > best) { best = sc; }
  return isModeBest;
}

function saveAll() {
  try {
    localStorage.setItem("ns_settings", JSON.stringify(settings));
    localStorage.setItem("ns_best", String(best));
    localStorage.setItem("ns_bests", JSON.stringify(bests));
    localStorage.setItem("ns_stats", JSON.stringify(stats));
    localStorage.setItem("ns_store", JSON.stringify(store));
  } catch (e) {}
}

function themeOwned(id) {
  return id === "neon" || best >= (THEME_REQ[id] || Infinity) || store.themes.includes(id);
}
function formOwned(id) {
  return id === "classic" || store.forms.includes(id);
}
function fruitOwned(id) {
  const cat = STORE.fruits.find(f => f.id === id);
  return !cat || cat.price <= 0 || store.fruits.includes(id);
}
function normForm(f) { return (f in FORMS) ? f : "classic"; }

const canvas = $("#game");
const ctx = canvas.getContext("2d");
const stage = $("#stage");
const buffbar = $("#buffbar");
const comboEl = $("#combo");

let state = "menu";
let demoMode = true;
let dead = false;
let started = false;

let snake = [], prevCells = [], dir = { x: 1, y: 0 }, dirQueue = [];
let foods = [], obstacles = [], powerups = [], particles = [], floats = [];
let buffs = { slow: 0, double: 0, shield: 0, magnet: 0 };

let score = 0, apples = 0, level = 1, combo = 0, comboT = 0, maxCombo = 1, playTime = 0;
let stepMs = 160, acc = 0, shake = 0;
let respawnAt = 0, overPending = false, overShownAt = 0;
let winMode = false, newBest = false;
let wrapFx = []; // portal glow markers {x,y,t,life,axis}
let lastWrapDir = null; // dir used for the most recent wrap tick (for smooth portal slide)

const chipMap = {};
let lastShownScore = -1, lastMultShown = 1;

const view = { w: 300, h: 400, cell: 14, dpr: 1 };
let bgCache = null;

let CA = { r: 61, g: 255, b: 143 }, CB = { r: 18, b: 185, g: 129 };

function hex2rgb(h) {
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16)
  };
}

function applyTheme() {
  const t = THEMES[settings.theme] || THEMES.neon;
  const rs = document.documentElement.style;
  rs.setProperty("--acc", t.a);
  rs.setProperty("--acc2", t.acc2);
  rs.setProperty("--glow", t.glow);
  CA = hex2rgb(t.a);
  CB = hex2rgb(t.b);
}

const isLight = () => document.body.dataset.mode === "light";

function applyMode() {
  if (settings.mode !== "light" && settings.mode !== "dark") settings.mode = "dark";
  document.body.dataset.mode = settings.mode;
}

function vibe(p) {
  if (!settings.haptics) return;
  try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {}
}

function buildBG() {
  const { w, h, cell, dpr } = view;
  const light = isLight();
  bgCache = document.createElement("canvas");
  bgCache.width = Math.round(w * dpr);
  bgCache.height = Math.round(h * dpr);
  const c = bgCache.getContext("2d");
  c.scale(dpr, dpr);
  c.fillStyle = light ? "#e8edf4" : "#0a0f1a";
  c.fillRect(0, 0, w, h);
  c.fillStyle = light ? "#dbe3ee" : "#0c1220";
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++)
      if ((x + y) & 1) c.fillRect(x * cell, y * cell, cell + 0.5, cell + 0.5);
}

function resize() {
  // Fit the portrait-rectangle board strictly inside the visible stage so
  // it never overflows on phones (small screens, landscape, dpad showing).
  const r = stage.getBoundingClientRect();
  const availW = Math.max(120, r.width - 16);
  const availH = Math.max(120, r.height - 16);
  view.dpr = Math.min(window.devicePixelRatio || 1, 3);
  let cell = Math.floor(Math.min(availW / COLS, availH / ROWS));
  cell = Math.max(6, cell);
  view.cell = cell;
  view.w = cell * COLS;
  view.h = cell * ROWS;
  canvas.style.width = view.w + "px";
  canvas.style.height = view.h + "px";
  canvas.width = Math.round(view.w * view.dpr);
  canvas.height = Math.round(view.h * view.dpr);
  buildBG();
}

const keyOf = (x, y) => y * COLS + x;

function freeCells() {
  const occ = new Set();
  for (const s of snake) occ.add(keyOf(s.x, s.y));
  for (const o of obstacles) occ.add(keyOf(o.x, o.y));
  for (const f of foods) occ.add(keyOf(f.x, f.y));
  for (const p of powerups) occ.add(keyOf(p.x, p.y));
  const out = [];
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++)
      if (!occ.has(keyOf(x, y))) out.push({ x, y });
  return out;
}

function randFree() {
  const f = freeCells();
  if (!f.length) return null;
  return f[(Math.random() * f.length) | 0];
}

function spawnFood(kind) {
  const c = randFree();
  if (!c) { if (kind !== "bonus") triggerWin(); return; }
  if (kind === "bonus") {
    foods.push({ x: c.x, y: c.y, kind: "bonus" });
    return;
  }
  foods.push({ x: c.x, y: c.y, kind: kind || pickFruitKind() });
}

function toroidalDelta(a, b, size) {
  let d = a - b;
  if (d > size / 2) d -= size;
  else if (d < -size / 2) d += size;
  return d;
}

function toroidalDist(ax, ay, bx, by) {
  const dx = Math.abs(toroidalDelta(ax, bx, COLS));
  const dy = Math.abs(toroidalDelta(ay, by, ROWS));
  return dx + dy;
}

// Interpolated cell position that NEVER slides across the whole board.
// If prev and curr are far apart (a portal jump), snap to curr.
function lerpCellSnap(prev, curr, a) {
  if (!prev) return { x: curr.x, y: curr.y };
  if (Math.abs(curr.x - prev.x) > 1.5 || Math.abs(curr.y - prev.y) > 1.5) {
    return { x: curr.x, y: curr.y };
  }
  return { x: prev.x + (curr.x - prev.x) * a, y: prev.y + (curr.y - prev.y) * a };
}

function portalBurst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 0.8 + Math.random() * 2.2;
    particles.push({
      x: x + 0.5, y: y + 0.5,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      size: 0.06 + Math.random() * 0.08,
      t: 0, life: 380 + Math.random() * 320,
      color
    });
  }
}

function spawnPower(now) {
  const types = Object.keys(BUFFS);
  const type = types[(Math.random() * types.length) | 0];
  const c = randFree();
  if (!c) return;
  powerups.push({ x: c.x, y: c.y, type, expires: now + 9000 });
}

function addObstacles(n, initial) {
  const head = snake[0];
  let tries = n * 50;
  while (n > 0 && tries-- > 0 && obstacles.length < 45) {
    const x = (Math.random() * COLS) | 0;
    const y = (Math.random() * ROWS) | 0;
    if (snake.some(s => s.x === x && s.y === y)) continue;
    if (obstacles.some(o => o.x === x && o.y === y)) continue;
    if (foods.some(f => f.x === x && f.y === y)) continue;
    if (powerups.some(p => p.x === x && p.y === y)) continue;
    if (Math.abs(x - head.x) + Math.abs(y - head.y) < 5) continue;
    if (initial && y === head.y && ((dir.x > 0 && x > head.x) || (dir.x < 0 && x < head.x))) continue;
    obstacles.push({ x, y });
    n--;
  }
}

function updateSpeed() {
  const d = DIFFS[normDiff(settings.difficulty)];
  let sp = d.speed0 * (1 + d.accel * (level - 1));
  sp = Math.min(sp, d.speedMax);
  if (buffs.slow > 0) sp *= 0.55;
  stepMs = 1000 / sp;
}

function reset(demo) {
  demoMode = demo;
  const cx = (COLS / 2) | 0, cy = (ROWS / 2) | 0;
  snake = [];
  for (let i = 0; i < 3; i++) snake.push({ x: cx - i, y: cy });
  prevCells = snake.map(s => ({ x: s.x, y: s.y }));
  dir = { x: 1, y: 0 };
  dirQueue = [];
  foods = []; powerups = []; particles = []; floats = []; obstacles = [];
  wrapFx = []; lastWrapDir = null;
  buffs = { slow: 0, double: 0, shield: 0, magnet: 0 };
  for (const k in chipMap) { chipMap[k].remove(); delete chipMap[k]; }
  score = 0; apples = 0; level = 1; combo = 0; comboT = 0;
  maxCombo = 1; playTime = 0; acc = 0; shake = 0;
  dead = false; started = false; winMode = false; newBest = false; overPending = false;
  spawnFood(pickFruitKind());
  const d = DIFFS[normDiff(settings.difficulty)];
  if (settings.obstacles && d.obs > 0) addObstacles(d.obs, true);
  updateSpeed();
  syncHud(true);
  syncCombo(true);
}

const comboMult = () => Math.min(Math.max(combo, 1), 5);

function aiDir() {
  const head = snake[0];
  const target = foods[0];
  const all = [DIRS.up, DIRS.down, DIRS.left, DIRS.right];
  const occ = new Set();
  for (let i = 0; i < snake.length - 1; i++) occ.add(keyOf(snake[i].x, snake[i].y));
  for (const o of obstacles) occ.add(keyOf(o.x, o.y));
  const wrap = settings.walls === "wrap";
  const step = (x, y) => wrap ? [(x + COLS) % COLS, (y + ROWS) % ROWS] : [x, y];
  const inB = (x, y) => wrap || (x >= 0 && x < COLS && y >= 0 && y < ROWS);
  const safe = all.filter(d => {
    const [x, y] = step(head.x + d.x, head.y + d.y);
    return inB(head.x + d.x, head.y + d.y) && !occ.has(keyOf(x, y));
  });
  if (!safe.length) return dir;
  const scoreDir = d => {
    const [x, y] = step(head.x + d.x, head.y + d.y);
    let dist = target
      ? (wrap ? toroidalDist(x, y, target.x, target.y) : Math.abs(x - target.x) + Math.abs(y - target.y))
      : 0;
    let free = 0;
    for (const e of all) {
      const [ax, ay] = step(x + e.x, y + e.y);
      if (inB(x + e.x, y + e.y) && !occ.has(keyOf(ax, ay))) free++;
    }
    return dist - free * 2;
  };
  safe.sort((a, b) => scoreDir(a) - scoreDir(b));
  return safe[0];
}

function tick() {
  prevCells = snake.map(s => ({ x: s.x, y: s.y }));
  if (demoMode) {
    dir = aiDir();
  } else {
    while (dirQueue.length) {
      const nd = dirQueue.shift();
      if (nd.x === -dir.x && nd.y === -dir.y) continue;
      if (nd.x === dir.x && nd.y === dir.y) continue;
      dir = nd;
      break;
    }
  }
  const shield = buffs.shield > 0;
  const oldHead = { x: snake[0].x, y: snake[0].y };
  let nx = snake[0].x + dir.x, ny = snake[0].y + dir.y;
  let wrapped = false;
  if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
    if (shield || settings.walls === "wrap") {
      nx = (nx + COLS) % COLS;
      ny = (ny + ROWS) % ROWS;
      wrapped = true;
    } else return crash();
  }
  const fi = foods.findIndex(f => f.x === nx && f.y === ny);
  const grow = fi >= 0;
  // Shield protects against walls + obstacles + self-bites: with shield
  // active the head passes through instead of crashing.
  {
    const lim = grow ? snake.length : snake.length - 1;
    let selfHit = false;
    for (let i = 0; i < lim; i++)
      if (snake[i].x === nx && snake[i].y === ny) { selfHit = true; break; }
    if (selfHit && !shield) return crash();
    if (!shield && obstacles.some(o => o.x === nx && o.y === ny)) return crash();
    if (selfHit && shield && !demoMode) {
      burst(nx, ny, BUFFS.shield.color, 10);
      vibe(20);
    }
  }
  snake.unshift({ x: nx, y: ny });
  if (!grow) snake.pop();
  const al = [];
  for (let i = 0; i < snake.length; i++) {
    const p = prevCells[i];
    al.push(p ? p : { x: snake[i].x, y: snake[i].y });
  }
  // Snap the head on portal jumps so it never lerps across the whole board
  // (that mid-board ghost segment was the reported wrap bug).
  if (wrapped) al[0] = { x: nx, y: ny };
  prevCells = al;
  if (wrapped) {
    lastWrapDir = { x: dir.x, y: dir.y };
    const themeCol = THEMES[settings.theme].a;
    // glow markers on both sides of the portal
    wrapFx.push({ x: oldHead.x, y: oldHead.y, t: 0, life: 450 });
    wrapFx.push({ x: nx, y: ny, t: 0, life: 450 });
    portalBurst(oldHead.x, oldHead.y, themeCol, 8);
    portalBurst(nx, ny, themeCol, 8);
    if (!demoMode) vibe(12);
  } else {
    lastWrapDir = null;
  }
  const pi = powerups.findIndex(p => p.x === nx && p.y === ny);
  if (pi >= 0) pickup(pi);
  if (grow) eat(fi, nx, ny);
  if (buffs.magnet > 0) magnetPull();
}

function eat(fi, x, y) {
  const f = foods.splice(fi, 1)[0];
  combo = comboT > 0 ? Math.min(combo + 1, 9) : 1;
  comboT = COMBO_WINDOW;
  maxCombo = Math.max(maxCombo, comboMult());
  const mult = comboMult() * (buffs.double > 0 ? 2 : 1);
  const isBonus = f.kind === "bonus";
  const info = FOODS[f.kind];
  const base = isBonus ? 50 : (info ? info.pts : 10);
  const pts = base * mult;
  score += pts;
  floats.push({
    x: x + 0.5, y: y + 0.5, text: "+" + pts,
    color: isBonus ? "#ffd166" : (info ? info.c2 : "#ffffff"),
    t: 0, life: 900
  });
  burst(x, y, isBonus ? "#ffd166" : (info ? info.c2 : "#ff6b6b"), isBonus ? 18 : (f.kind === "golden" ? 20 : 10));
  if (!demoMode) {
    if (isBonus) { sound.bonus(); vibe(20); }
    else { sound.eat(combo); vibe(8); stats.apples++; }
    // Stars are the store currency: golden fruit +1, bonus star +2.
    const earned = isBonus ? 2 : (f.kind === "golden" ? 1 : 0);
    if (earned > 0) {
      stats.stars += earned;
      floats.push({
        x: x + 0.5, y: y - 0.1, text: "+" + earned + " \u2605",
        color: "#ffd166", t: -150, life: 1000
      });
    }
    syncCombo();
  }
  if (!isBonus) {
    apples++;
    const nl = 1 + ((apples / 5) | 0);
    if (nl > level) { level = nl; levelUp(); }
    if (apples % 5 === 0 && !foods.some(q => q.kind === "bonus")) {
      const c = randFree();
      if (c) foods.push({ x: c.x, y: c.y, kind: "bonus", expires: performance.now() + 7500 });
    }
    // Only replace eaten fruit — bonus is an extra and shouldn't duplicate apples.
    spawnFood(pickFruitKind());
  }
  const now = performance.now();
  if (powerups.length === 0 && Math.random() < 0.15) spawnPower(now);
  updateSpeed();
  syncHud(false);
}

function levelUp() {
  if (!demoMode) {
    toast("LEVEL " + level, "#ffd166");
    sound.level();
    vibe(30);
  }
  if (settings.obstacles) addObstacles(2, false);
  updateSpeed();
}

function pickup(pi) {
  const p = powerups.splice(pi, 1)[0];
  buffs[p.type] = BUFFS[p.type].dur;
  burst(p.x, p.y, BUFFS[p.type].color, 14);
  updateSpeed();
  if (!demoMode) {
    toast(BUFFS[p.type].name.toUpperCase(), BUFFS[p.type].color);
    sound.power();
    vibe(25);
  }
}

function magnetPull() {
  const h = snake[0];
  const wrap = settings.walls === "wrap";
  for (const f of foods) {
    let dx = h.x - f.x, dy = h.y - f.y;
    if (wrap) {
      dx = toroidalDelta(h.x, f.x, COLS);
      dy = toroidalDelta(h.y, f.y, ROWS);
    }
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) continue;
    if (dx === 0 && dy === 0) continue;
    const sx = Math.sign(dx), sy = Math.sign(dy);
    const opts = Math.abs(dx) >= Math.abs(dy)
      ? [[f.x + sx, f.y], [f.x, f.y + sy]]
      : [[f.x, f.y + sy], [f.x + sx, f.y]];
    for (let [cx, cy] of opts) {
      if (wrap) {
        cx = (cx + COLS) % COLS;
        cy = (cy + ROWS) % ROWS;
      }
      if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) continue;
      if (cx === h.x && cy === h.y) continue;
      const k = keyOf(cx, cy);
      if (snake.some(s => keyOf(s.x, s.y) === k)) continue;
      if (obstacles.some(o => keyOf(o.x, o.y) === k)) continue;
      if (powerups.some(p => keyOf(p.x, p.y) === k)) continue;
      if (foods.some(o => o !== f && keyOf(o.x, o.y) === k)) continue;
      f.x = cx; f.y = cy;
      break;
    }
  }
}

function crash() {
  dead = true;
  shake = 1;
  const h = snake[0];
  burst(h.x, h.y, "#ff5a68", 26);
  if (demoMode) {
    respawnAt = performance.now() + 800;
    return;
  }
  vibe([70, 50, 90]);
  sound.die();
  sound.musicStop();
  if (score > 0 && recordScore(score)) newBest = true;
  stats.games++;
  saveAll();
  overPending = true;
  overShownAt = performance.now() + 900;
}

function triggerWin() {
  if (winMode || dead) return;
  winMode = true;
  dead = true;
  for (let i = 0; i < 60; i++) particles.push(confetti());
  if (!demoMode) sound.level();
  sound.musicStop();
  if (score > 0 && recordScore(score)) newBest = true;
  if (!demoMode) stats.games++;
  saveAll();
  overPending = true;
  overShownAt = performance.now() + 700;
}

function confetti() {
  const colors = ["#3dff8f", "#37e6ff", "#ffd166", "#ff5ce1", "#ff5a68"];
  return {
    x: Math.random() * COLS, y: Math.random() * ROWS * 0.4,
    vx: (Math.random() - 0.5) * 4, vy: Math.random() * 2,
    size: 0.1 + Math.random() * 0.12,
    t: 0, life: 1200 + Math.random() * 600,
    color: colors[(Math.random() * colors.length) | 0]
  };
}

function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1.2 + Math.random() * 2.6;
    particles.push({
      x: x + 0.5, y: y + 0.5,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.2,
      size: 0.07 + Math.random() * 0.09,
      t: 0, life: 480 + Math.random() * 380,
      color
    });
  }
}

function update(dt) {
  const now = performance.now();
  if (overPending && now >= overShownAt) {
    overPending = false;
    showGameOver();
  }
  if (demoMode && dead && now >= respawnAt) reset(true);
  const active = !dead && (state === "playing" || state === "menu");
  // No background demo play: the board stays still on the menu until
  // the player starts a real game (started becomes true on first input).
  if (active && started) {
    if (state === "playing" && !demoMode) playTime += dt;
    acc += dt;
    let g = 0;
    while (acc >= stepMs && g++ < 6 && !dead) {
      acc -= stepMs;
      tick();
    }
  }
  if (active) {
    const slowWas = buffs.slow > 0;
    const shieldWas = buffs.shield;
    let expired = false;
    for (const k in buffs) {
      if (buffs[k] > 0) {
        buffs[k] -= dt;
        if (buffs[k] <= 0) { buffs[k] = 0; expired = true; }
      }
    }
    if (slowWas !== (buffs.slow > 0)) updateSpeed();
    if (expired && !demoMode) sound.expire();
    // Shield expiry warning: blip once when entering last 3s so the
    // player gets an audio cue on top of the visual flash.
    if (!demoMode && shieldWas > SHIELD_WARN_MS && buffs.shield <= SHIELD_WARN_MS && buffs.shield > 0) {
      sound.expire();
    }
    if (comboT > 0) {
      comboT -= dt;
      if (comboT <= 0) { comboT = 0; combo = 0; syncCombo(); }
    }
    foods = foods.filter(f => f.kind !== "bonus" || now < f.expires);
    powerups = powerups.filter(p => now < p.expires);
    syncChips();
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.t += dt;
    p.x += p.vx * dt / 1000;
    p.y += p.vy * dt / 1000;
    p.vy += 3.5 * dt / 1000;
    if (p.t > p.life) particles.splice(i, 1);
  }
  for (let i = floats.length - 1; i >= 0; i--) {
    floats[i].t += dt;
    if (floats[i].t > floats[i].life) floats.splice(i, 1);
  }
  for (let i = wrapFx.length - 1; i >= 0; i--) {
    wrapFx[i].t += dt;
    if (wrapFx[i].t > wrapFx[i].life) wrapFx.splice(i, 1);
  }
  if (shake > 0) shake = Math.max(0, shake - dt * 0.0028);
}

const curAlpha = () => started ? Math.min(1, acc / stepMs) : 1;

function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x + r, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function mix(c1, c2, t) {
  return `rgb(${(c1.r + (c2.r - c1.r) * t) | 0},${(c1.g + (c2.g - c1.g) * t) | 0},${(c1.b + (c2.b - c1.b) * t) | 0})`;
}

function star(cx, cy, R, r, rot) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r : R;
    const a = rot + i * Math.PI / 5 - Math.PI / 2;
    if (i) ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    else ctx.moveTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  ctx.closePath();
}

const fnt = (px, w) => `${w || 900} ${Math.round(px)}px system-ui,-apple-system,"Segoe UI",sans-serif`;

function render() {
  const { w, h, cell, dpr } = view;
  const now = performance.now();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (bgCache) ctx.drawImage(bgCache, 0, 0, w, h);
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 7, (Math.random() - 0.5) * shake * 7);
  drawWalls(cell, now);
  drawObstacles(cell);
  drawFoods(cell, now);
  drawPowerups(cell, now);
  drawMagnetRing(cell, now);
  drawSnake(cell, curAlpha(), now);
  drawWrapFx(cell);
  drawParticles(cell);
  drawFloats(cell);
  ctx.restore();
  drawFrame(w, h);
  if (state === "playing" && !started && !dead) drawReady(w, h, cell, now);
}

function drawFrame(w, h) {
  if (settings.walls === "wrap") {
    // static portal frame — no animation (marching ants was distracting)
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = THEMES[settings.theme].a;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = 0;
    ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
    ctx.restore();
  } else {
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = THEMES[settings.theme].a;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.strokeRect(0.75, 0.75, w - 1.5, h - 1.5);
    ctx.globalAlpha = 1;
  }
}

function drawWalls(cell, now) {
  const { w, h } = view;
  if (settings.walls !== "wrap") return;
  // subtle static portal chevrons on each edge (no animation)
  ctx.save();
  ctx.fillStyle = THEMES[settings.theme].a;
  ctx.globalAlpha = 0.3;
  const nx = 9, ny = 6, sx = w / nx, sy = h / ny;
  ctx.font = fnt(cell * 0.5);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < ny; i++) {
    const p = (i + 0.5) * sy;
    ctx.fillText("›", w - 5, p);
    ctx.fillText("‹", 5, p);
  }
  for (let i = 0; i < nx; i++) {
    const p = (i + 0.5) * sx;
    ctx.fillText("⌄", p, h - 5);
    ctx.fillText("⌃", p, 5);
  }
  ctx.restore();
}

function drawWrapFx(cell) {
  if (!wrapFx.length) return;
  ctx.save();
  for (const w of wrapFx) {
    const k = 1 - w.t / w.life;
    const cx = (w.x + 0.5) * cell, cy = (w.y + 0.5) * cell;
    ctx.globalAlpha = Math.max(0, k) * 0.9;
    ctx.strokeStyle = THEMES[settings.theme].a;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, cell * (0.5 + (1 - k) * 0.9), 0, 7);
    ctx.stroke();
  }
  ctx.restore();
}

function drawObstacles(cell) {
  for (const o of obstacles) {
    const x = o.x * cell, y = o.y * cell;
    const inset = cell * 0.08, s = cell - inset * 2, r = cell * 0.18;
    rr(x + inset, y + inset, s, s, r);
    const light = isLight();
    ctx.fillStyle = light ? "#c3cede" : "#25304a";
    ctx.fill();
    ctx.strokeStyle = light ? "#9fb0c8" : "#3a4a6d";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = light ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.06)";
    ctx.fillRect(x + inset + 2, y + inset + 2, s - 4, 2);
  }
}

function drawFoods(cell, now) {
  for (const f of foods) {
    const cx = (f.x + 0.5) * cell, cy = (f.y + 0.5) * cell;
    if (f.kind === "bonus") {
      const rem = f.expires - now;
      let a = 1;
      if (rem < 2000) a = 0.35 + 0.65 * Math.abs(Math.sin(now / 90));
      const pulse = 1 + 0.08 * Math.sin(now / 150);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.shadowColor = "rgba(255,209,102,.9)";
      ctx.shadowBlur = cell * 0.8;
      const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, cell * 0.36);
      grad.addColorStop(0, "#fff3c4");
      grad.addColorStop(1, "#f5a623");
      ctx.fillStyle = grad;
      star(cx, cy, cell * 0.36 * pulse, cell * 0.16 * pulse, now / 900);
      ctx.fill();
      ctx.restore();
    } else {
      drawFruit(f.kind, cx, cy, cell, now, f);
    }
  }
}

function drawFruit(kind, cx, cy, cell, now, f) {
  const info = FOODS[kind] || FOODS.apple;
  const pulse = 1 + 0.06 * Math.sin(now / 170 + (f ? f.x * 1.7 + f.y : 0));
  const r = cell * (kind === "golden" ? 0.35 : 0.32) * pulse;
  ctx.save();
  ctx.shadowColor = info.glow;
  ctx.shadowBlur = cell * (kind === "golden" ? 1.0 : 0.7);
  const grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.15, cx, cy, r);
  grad.addColorStop(0, info.c1);
  grad.addColorStop(0.55, info.c2);
  grad.addColorStop(1, info.c3);
  ctx.fillStyle = grad;

  if (info.double) {
    // cherry pair
    ctx.beginPath();
    ctx.arc(cx - r * 0.4, cy + r * 0.15, r * 0.72, 0, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + r * 0.42, cy + r * 0.25, r * 0.72, 0, 7);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#3fae5a";
    ctx.lineWidth = Math.max(1.2, cell * 0.06);
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.4, cy - r * 0.4);
    ctx.quadraticCurveTo(cx, cy - r * 1.1, cx + r * 0.42, cy - r * 0.3);
    ctx.stroke();
  } else if (info.cluster) {
    // grape cluster: 3 lobes
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.25, r * 0.7, 0, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - r * 0.45, cy + r * 0.35, r * 0.62, 0, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + r * 0.45, cy + r * 0.35, r * 0.62, 0, 7);
    ctx.fill();
  } else if (kind === "berry") {
    // blueberry with crown
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 7);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#1e2a8a";
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.55, r * 0.28, 0, 7);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 7);
    ctx.fill();
  }
  ctx.restore();

  // shine
  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.32, cy - r * 0.38, r * 0.22, r * 0.12, -0.5, 0, 7);
  ctx.fill();

  if (info.leaf && !info.double) {
    ctx.fillStyle = kind === "golden" ? "#7ac74f" : "#3fae5a";
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.45, cy - r * 0.85, r * 0.38, r * 0.18, -0.6, 0, 7);
    ctx.fill();
  }
  if (info.sparkle) {
    const tw = 0.5 + 0.5 * Math.sin(now / 130);
    ctx.fillStyle = `rgba(255,255,255,${0.5 + tw * 0.5})`;
    const sx = cx + r * 0.9 * Math.sin(now / 500);
    const sy = cy - r * 0.6;
    ctx.font = fnt(cell * 0.42);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✦", sx, sy);
  }
}

function drawPowerups(cell, now) {
  for (const p of powerups) {
    const col = BUFFS[p.type].color;
    const bob = Math.sin(now / 300 + p.x) * cell * 0.05;
    const cx = (p.x + 0.5) * cell;
    const cy = (p.y + 0.5) * cell + bob;
    let a = 1;
    if (p.expires - now < 2200) a = 0.35 + 0.65 * Math.abs(Math.sin(now / 100));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.shadowColor = col;
    ctx.shadowBlur = cell * 0.6;
    ctx.fillStyle = isLight() ? "rgba(255,255,255,.94)" : "#0d1526ee";
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 0.36, 0, 7);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(2, cell * 0.08);
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 0.36, 0, 7);
    ctx.stroke();
    const u = cell * 0.17;
    const ink = isLight() ? "#16233a" : "#fff";
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1.5, u * 0.3);
    if (p.type === "slow") {
      ctx.beginPath();
      ctx.moveTo(cx - u, cy - u * 1.15);
      ctx.lineTo(cx + u, cy - u * 1.15);
      ctx.lineTo(cx - u, cy + u * 1.15);
      ctx.lineTo(cx + u, cy + u * 1.15);
      ctx.closePath();
      ctx.stroke();
    } else if (p.type === "double") {
      ctx.font = fnt(u * 1.5);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("\u00d72", cx, cy + u * 0.1);
    } else if (p.type === "shield") {
      ctx.beginPath();
      ctx.moveTo(cx - u * 0.75, cy - u * 1.05);
      ctx.lineTo(cx + u * 0.75, cy - u * 1.05);
      ctx.lineTo(cx + u * 0.75, cy + u * 0.15);
      ctx.quadraticCurveTo(cx + u * 0.75, cy + u * 0.85, cx, cy + u * 1.15);
      ctx.quadraticCurveTo(cx - u * 0.75, cy + u * 0.85, cx - u * 0.75, cy + u * 0.15);
      ctx.closePath();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy + u * 0.1, u * 0.8, Math.PI, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - u * 0.8, cy + u * 0.1);
      ctx.lineTo(cx - u * 0.8, cy + u * 0.75);
      ctx.moveTo(cx + u * 0.8, cy + u * 0.1);
      ctx.lineTo(cx + u * 0.8, cy + u * 0.75);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawMagnetRing(cell, now) {
  if (buffs.magnet <= 0) return;
  const h = snake[0];
  const hp = prevCells[0] || h;
  const a = curAlpha();
  const ip = lerpCellSnap(hp, h, a);
  const cx = (ip.x + 0.5) * cell;
  const cy = (ip.y + 0.5) * cell;
  ctx.save();
  ctx.globalAlpha = 0.22 + 0.12 * Math.sin(now / 200);
  ctx.strokeStyle = "#ff8a80";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([cell * 0.35, cell * 0.3]);
  ctx.beginPath();
  ctx.arc(cx, cy, cell * 6, 0, 7);
  ctx.stroke();
  ctx.restore();
}

function snakePoints(cell, a) {
  const pts = [];
  for (let i = 0; i < snake.length; i++) {
    const c = snake[i], p = prevCells[i] || c;
    const ip = lerpCellSnap(p, c, a);
    pts.push({ x: (ip.x + 0.5) * cell, y: (ip.y + 0.5) * cell, gx: ip.x, gy: ip.y });
  }
  return pts;
}

function drawSnake(cell, a, now) {
  const n = snake.length;
  if (!n) return;
  const pts = snakePoints(cell, a);
  const theme = THEMES[settings.theme] || THEMES.neon;
  const form = normForm(settings.form);

  // Body underlay: thick connected path, split at portal jumps so we never
  // draw a line across the whole board (the old stretch bug).
  ctx.save();
  ctx.lineCap = form === "blocky" ? "butt" : "round";
  ctx.lineJoin = form === "blocky" ? "miter" : "round";
  const bodyW = cell * (form === "blocky" ? 0.86 : 0.8); // uniform thickness — no taper
  for (let i = n - 1; i >= 1; i--) {
    const p0 = pts[i - 1], p1 = pts[i];
    const dx = p0.x - p1.x, dy = p0.y - p1.y;
    if (Math.hypot(dx, dy) > cell * 1.7) continue; // portal split — don't connect
    const t = n > 1 ? i / (n - 1) : 0;
    ctx.strokeStyle = mix(CA, CB, t);
    ctx.lineWidth = bodyW;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
  // Body joints: circles over the path for a smooth uniform look
  // (squares for Blocky, shaded 3D spheres for Glossy)
  for (let i = n - 1; i >= 1; i--) {
    const t = n > 1 ? i / (n - 1) : 0;
    ctx.fillStyle = mix(CA, CB, t);
    if (form === "blocky") {
      ctx.fillRect(pts[i].x - bodyW / 2, pts[i].y - bodyW / 2, bodyW, bodyW);
    } else if (form === "glossy") {
      const r = bodyW / 2;
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, r, 0, 7);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.beginPath();
      ctx.arc(pts[i].x - r * 0.28, pts[i].y - r * 0.3, r * 0.52, 0, 7);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.beginPath();
      ctx.arc(pts[i].x - r * 0.3, pts[i].y - r * 0.36, r * 0.15, 0, 7);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, bodyW / 2, 0, 7);
      ctx.fill();
    }
  }
  // Belly highlight
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(1, cell * 0.07);
  ctx.beginPath();
  for (let i = 1; i < n; i++) {
    const p0 = pts[i - 1], p1 = pts[i];
    if (Math.hypot(p0.x - p1.x, p0.y - p1.y) > cell * 1.7) {
      ctx.moveTo(p1.x, p1.y - cell * 0.12);
    } else if (i === 1) {
      ctx.moveTo(p1.x, p1.y - cell * 0.12);
    } else {
      ctx.lineTo(p1.x, p1.y - cell * 0.12);
    }
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();

  // Head: smooth portal slide — when the head just teleported, render it
  // sliding out AND sliding in so it dives through the wall instead of popping.
  const hc = snake[0];
  let headDraws = [{ x: pts[0].x, y: pts[0].y }];
  const hp = prevCells[0];
  if (hp && (Math.abs(hc.x - hp.x) > 1.5 || Math.abs(hc.y - hp.y) > 1.5) && lastWrapDir) {
    const rx = hp.x + lastWrapDir.x * a;
    const ry = hp.y + lastWrapDir.y * a;
    const ex = rx * cell + cell / 2, ey = ry * cell + cell / 2;
    const wx = (((rx % COLS) + COLS) % COLS) * cell + cell / 2;
    const wy = (((ry % ROWS) + ROWS) % ROWS) * cell + cell / 2;
    headDraws = [{ x: ex, y: ey }, { x: wx, y: wy }];
    // clip draws that are fully off-screen to just the visible sliver
    headDraws = headDraws.filter(p =>
      p.x > -cell && p.x < view.w + cell && p.y > -cell && p.y < view.h + cell);
    if (!headDraws.length) headDraws = [{ x: pts[0].x, y: pts[0].y }];
  }

  const hs = cell * 0.96;
  for (const hd of headDraws) {
    const hx = hd.x - cell / 2, hy = hd.y - cell / 2;
    const ho = (cell - hs) / 2;
    ctx.save();
    if (!dead) {
      ctx.shadowColor = theme.glow;
      ctx.shadowBlur = cell * 0.6;
    } else {
      ctx.globalAlpha = 0.55;
    }
    ctx.fillStyle = theme.a;
    if (form === "bubble") {
      ctx.beginPath();
      ctx.arc(hd.x, hd.y, hs / 2, 0, 7);
      ctx.fill();
    } else if (form === "arrow") {
      // Viper head: triangle pointing along travel dir, body stays round.
      const px = -dir.y, py = dir.x;
      ctx.beginPath();
      ctx.moveTo(hd.x + dir.x * hs * 0.58, hd.y + dir.y * hs * 0.58);
      ctx.lineTo(hd.x - dir.x * hs * 0.34 + px * hs * 0.5, hd.y - dir.y * hs * 0.34 + py * hs * 0.5);
      ctx.lineTo(hd.x - dir.x * hs * 0.34 - px * hs * 0.5, hd.y - dir.y * hs * 0.34 - py * hs * 0.5);
      ctx.closePath();
      ctx.fill();
    } else {
      rr(hx + ho, hy + ho, hs, hs, form === "blocky" ? hs * 0.1 : hs * 0.36);
      ctx.fill();
    }
    ctx.restore();
    if (form === "glossy" && !dead) {
      // 3D gloss: top sheen + specular dot over the head.
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.32)";
      ctx.beginPath();
      ctx.ellipse(hd.x - hs * 0.08, hd.y - hs * 0.22, hs * 0.3, hs * 0.14, -0.4, 0, 7);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.arc(hd.x - hs * 0.2, hd.y - hs * 0.24, hs * 0.06, 0, 7);
      ctx.fill();
      ctx.restore();
    }
    drawEyes(hx, hy, hs, dead);
    drawTongue(hd.x, hd.y, cell, now);
  }
  if (buffs.shield > 0) {
    const cx = headDraws[headDraws.length - 1].x, cy = headDraws[headDraws.length - 1].y;
    const warn = buffs.shield <= SHIELD_WARN_MS;
    ctx.save();
    if (warn) {
      // Last 3s: flash between red and gold so expiry is unmissable,
      // pulse faster and slightly larger than the calm purple ring.
      const blink = Math.floor(now / 180) % 2 === 0;
      const col = blink ? "255,90,104" : "255,209,102";
      ctx.strokeStyle = `rgba(${col},${0.65 + 0.35 * Math.sin(now / 90)})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, cell * (0.82 + 0.06 * Math.sin(now / 90)), 0, 7);
      ctx.stroke();
    } else {
      ctx.strokeStyle = `rgba(179,136,255,${0.45 + 0.3 * Math.sin(now / 120)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.78, 0, 7);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawTongue(cx, cy, cell, now) {
  if (dead) return;
  if ((now / 900 + snake.length * 0.13) % 1 > 0.35) return; // flick occasionally
  const len = cell * 0.42;
  const tx = cx + dir.x * cell * 0.48, ty = cy + dir.y * cell * 0.48;
  const ex = tx + dir.x * len, ey = ty + dir.y * len;
  const px = -dir.y, py = dir.x;
  ctx.save();
  ctx.strokeStyle = "#ff5a68";
  ctx.lineWidth = Math.max(1.5, cell * 0.07);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(ex, ey);
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex + (dir.x * 0.35 + px * 0.3) * cell * 0.3, ey + (dir.y * 0.35 + py * 0.3) * cell * 0.3);
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex + (dir.x * 0.35 - px * 0.3) * cell * 0.3, ey + (dir.y * 0.35 - py * 0.3) * cell * 0.3);
  ctx.stroke();
  ctx.restore();
}

function drawEyes(hx, hy, hs, isDead) {
  const cx = hx + hs / 2, cy = hy + hs / 2;
  const bx = cx + dir.x * hs * 0.14, by = cy + dir.y * hs * 0.14;
  const px = -dir.y, py = dir.x;
  const er = hs * 0.13;
  for (const s of [1, -1]) {
    const ex = bx + px * hs * 0.17 * s;
    const ey = by + py * hs * 0.17 * s;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, 7);
    ctx.fill();
    ctx.fillStyle = isDead ? "#ff2e2e" : "#08131c";
    ctx.beginPath();
    ctx.arc(ex + dir.x * er * 0.45, ey + dir.y * er * 0.45, er * 0.52, 0, 7);
    ctx.fill();
  }
}

function drawParticles(cell) {
  for (const p of particles) {
    const k = 1 - p.t / p.life;
    ctx.globalAlpha = Math.max(0, k);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x * cell, p.y * cell, Math.max(0.5, p.size * cell * (0.5 + k * 0.5)), 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFloats(cell) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const f of floats) {
    const k = 1 - f.t / f.life;
    ctx.globalAlpha = Math.max(0, k);
    ctx.font = fnt(cell * 0.55);
    const fx = f.x * cell;
    const fy = f.y * cell - (f.t / 1000) * cell * 1.1;
    ctx.strokeStyle = isLight() ? "rgba(255,255,255,.85)" : "rgba(0,0,0,.7)";
    ctx.lineWidth = 3;
    ctx.strokeText(f.text, fx, fy);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, fx, fy);
  }
  ctx.globalAlpha = 1;
}

function drawReady(w, h, cell, now) {
  ctx.fillStyle = isLight() ? "rgba(255,255,255,.62)" : "rgba(5,8,14,.55)";
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.globalAlpha = 0.75 + 0.25 * Math.sin(now / 300);
  ctx.font = fnt(cell * 1.5);
  ctx.fillStyle = (THEMES[settings.theme] || THEMES.neon).a;
  ctx.fillText("READY?", w / 2, h * 0.44);
  ctx.globalAlpha = 1;
  ctx.font = fnt(cell * 0.62, 600);
  ctx.fillStyle = isLight() ? "#5b6b85" : "#aab6d0";
  ctx.fillText("Swipe or press an arrow key", w / 2, h * 0.44 + cell * 1.7);
}

function toast(msg, color) {
  const el = $("#toast");
  el.textContent = msg;
  el.style.color = color || "var(--acc)";
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
}

function syncHud(force) {
  if (force || score !== lastShownScore) {
    const el = $("#hudScore");
    el.textContent = score;
    if (!force && !demoMode) {
      el.classList.remove("bump");
      void el.offsetWidth;
      el.classList.add("bump");
    }
    lastShownScore = score;
  }
  $("#hudLevel").textContent = level;
  // HUD Best is mode-specific (current difficulty+walls+obstacles combo).
  const mb = modeBest();
  $("#hudBest").textContent = Math.max(mb, demoMode ? 0 : score);
  $("#hudBest").title = shortModeLabel(modeKey());
}

function syncCombo(force) {
  const mult = comboMult();
  const show = !demoMode && state === "playing" && mult >= 2 && comboT > 0;
  if (show) {
    comboEl.classList.remove("hidden");
    comboEl.textContent = "x" + mult;
    if (!force && mult !== lastMultShown) {
      comboEl.classList.remove("pop");
      void comboEl.offsetWidth;
      comboEl.classList.add("pop");
    }
  } else {
    comboEl.classList.add("hidden");
  }
  lastMultShown = mult;
}

function syncChips() {
  for (const k in BUFFS) {
    const rem = buffs[k];
    let chip = chipMap[k];
    if (rem > 0) {
      if (!chip) {
        chip = document.createElement("div");
        chip.className = "chip";
        chip.style.setProperty("--c", BUFFS[k].color);
        chip.innerHTML = BUFFS[k].tag + "<i></i>";
        buffbar.appendChild(chip);
        chipMap[k] = chip;
      }
      chip.style.setProperty("--w", (rem / BUFFS[k].dur * 100).toFixed(1) + "%");
      // Shield flashes in the corner timer too during its last 3s.
      if (k === "shield") chip.classList.toggle("warn", rem <= SHIELD_WARN_MS);
    } else if (chip) {
      chip.remove();
      delete chipMap[k];
    }
  }
}

function hideOverlays() {
  ["#menuOverlay", "#settingsOverlay", "#storeOverlay", "#howOverlay", "#pauseOverlay", "#overOverlay"]
    .forEach(id => $(id).classList.add("hidden"));
}

function setState(s) {
  state = s;
  document.body.dataset.state = s;
  updatePauseIcon();
}

function startGame() {
  sound.ensure();
  sound.click();
  hideOverlays();
  reset(false);
  setState("playing");
  if (settings.music) sound.musicStart();
}

function pauseGame() {
  if (state !== "playing" || dead) return;
  setState("paused");
  $("#pauseOverlay").classList.remove("hidden");
  sound.pauseBlip(true);
  sound.musicStop();
}

function resumeGame() {
  if (state !== "paused") return;
  $("#pauseOverlay").classList.add("hidden");
  setState("playing");
  sound.pauseBlip(false);
  if (settings.music) sound.musicStart();
}

function togglePause() {
  if (state === "playing") pauseGame();
  else if (state === "paused") resumeGame();
}

function quitToMenu() {
  sound.musicStop();
  saveAll();
  hideOverlays();
  reset(true);
  setState("menu");
  $("#menuOverlay").classList.remove("hidden");
  refreshMenuTexts();
}

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

function showGameOver() {
  setState("gameover");
  $("#overTitle").textContent = winMode ? "YOU WIN!" : "GAME OVER";
  $("#overTitle").classList.toggle("win", winMode);
  $("#newBest").classList.toggle("hidden", !(newBest && score > 0));
  if (newBest && score > 0) {
    $("#newBest").textContent = "NEW MODE BEST!";
    $("#newBest").title = shortModeLabel(modeKey());
  }
  $("#fScore").textContent = score;
  $("#fBest").textContent = modeBest();
  const modeEl = $("#overMode");
  if (modeEl) modeEl.textContent = shortModeLabel(modeKey());
  const bestLbl = $("#fBestLabel");
  if (bestLbl) bestLbl.textContent = "Mode best";
  $("#fLen").textContent = snake.length;
  $("#fApples").textContent = apples;
  $("#fCombo").textContent = "x" + maxCombo;
  $("#fTime").textContent = fmtTime(playTime);
  syncHud(true);
  $("#overOverlay").classList.remove("hidden");
  sound.over();
  refreshMenuTexts();
}

function refreshMenuTexts() {
  $("#menuBest").textContent = best;
  $("#menuFoot").textContent =
    `\u{1F3AE} ${stats.games} games \u00b7 \u{1F34E} ${stats.apples} fruits \u00b7 \u2605 ${stats.stars || 0}`;
  renderBestMode();
}

// Show only the single overall best score's mode (no per-mode table).
function renderBestMode() {
  const el = $("#menuBestMode");
  if (!el) return;
  if (!best || best <= 0) {
    el.textContent = "PLAY TO SET A RECORD";
    return;
  }
  let bk = null, bv = -1;
  for (const [k, v] of Object.entries(bests)) {
    if (v > bv) { bv = v; bk = k; }
  }
  el.textContent = shortModeLabel(bk || modeKey());
}

function applyTouchClass() {
  document.body.classList.toggle("touchpad-on", settings.touch === "on");
  document.body.classList.toggle("touchpad-off", settings.touch === "off");
}

function applyAudioToggles() {
  sound.setMusic(settings.music);
  sound.setSfx(settings.sfx);
  $("#btnMusic").classList.toggle("off", !settings.music);
  $("#btnSfx").classList.toggle("off", !settings.sfx);
  $("#swMusic").checked = settings.music;
  $("#swSfx").checked = settings.sfx;
  $("#swHaptics").checked = settings.haptics;
  if (state === "playing" && settings.music && !dead) sound.musicStart();
  else sound.musicStop();
}

function updatePauseIcon() {
  const paused = state === "paused";
  $(".ic-pause").classList.toggle("hidden", paused);
  $(".ic-play").classList.toggle("hidden", !paused);
}

function refreshSettingsUI() {
  $$(".seg").forEach(seg => {
    const name = seg.dataset.setting;
    let cur = settings[name];
    if (name === "obstacles") cur = cur ? "on" : "off";
    seg.querySelectorAll("button").forEach(b =>
      b.classList.toggle("active", b.dataset.val === cur));
  });
  $("#swMode").checked = settings.mode === "light";
}

function openStore() {
  refreshStoreUI();
  $("#storeOverlay").classList.remove("hidden");
}

function closeStore() {
  $("#storeOverlay").classList.add("hidden");
  refreshMenuTexts();
}

function storeBuy(kind, id, price) {
  if ((stats.stars || 0) < price) { vibe(40); return; }
  stats.stars -= price;
  store[kind].push(id);
  saveAll();
  sound.click();
  refreshStoreUI();
  refreshMenuTexts();
  refreshSettingsUI();
}

function storeGrid(elId, items, render) {
  const grid = $(elId);
  if (!grid) return;
  grid.innerHTML = "";
  for (const it of items) grid.appendChild(render(it));
}

function storeBtn(cls, prevHTML, name, sub, subCls, cb) {
  const b = document.createElement("button");
  b.className = "store-item" + (cls ? " " + cls : "");
  b.innerHTML = `<span class="prev">${prevHTML}</span><span class="nm">${name}</span><span class="sub${subCls ? " " + subCls : ""}">${sub}</span>`;
  b.addEventListener("click", cb);
  return b;
}

function refreshStoreUI() {
  $("#storeStars").textContent = stats.stars || 0;
  // Skins
  storeGrid("#storeThemes", STORE.themes, s => {
    const t = THEMES[s.id];
    const owned = themeOwned(s.id);
    const selected = settings.theme === s.id;
    const prev = `<span class="dots"><i style="background:${t.a}"></i><i style="background:${t.b};margin-left:-6px"></i></span>`;
    const sub = selected ? "SELECTED" : owned ? "SELECT" : `\u2605${s.price}`;
    return storeBtn(selected ? "selected" : (!owned && (stats.stars || 0) < s.price ? "cant" : ""),
      prev, s.id.toUpperCase(), sub, owned ? "" : "",
      () => {
        if (themeOwned(s.id)) {
          settings.theme = s.id;
          saveAll(); applyTheme(); sound.click();
          refreshStoreUI(); refreshSettingsUI();
        } else storeBuy("themes", s.id, s.price);
      });
  });
  // Forms
  storeGrid("#storeForms", STORE.forms, s => {
    const owned = formOwned(s.id);
    const selected = normForm(settings.form) === s.id;
    let prev;
    if (s.id === "arrow") {
      prev = `<span class="dots"><i style="width:0;height:0;border-radius:0;background:none;box-shadow:none;border-top:8px solid transparent;border-bottom:8px solid transparent;border-left:13px solid #3dff8f"></i></span>`;
    } else if (s.id === "glossy") {
      prev = `<span class="dots"><i style="background:radial-gradient(circle at 32% 30%,#ffffff,#3dff8f 62%)"></i><i style="background:radial-gradient(circle at 32% 30%,#ffffff,#12b981 62%);margin-left:-6px"></i></span>`;
    } else {
      const shape = s.id === "bubble" ? "border-radius:50%" : s.id === "blocky" ? "border-radius:3px" : "border-radius:40%";
      prev = `<span class="dots"><i style="background:#3dff8f;${shape}"></i><i style="background:#12b981;${shape};margin-left:-6px"></i></span>`;
    }
    const sub = selected ? "SELECTED" : owned ? "SELECT" : `\u2605${s.price}`;
    return storeBtn(selected ? "selected" : (!owned && (stats.stars || 0) < s.price ? "cant" : ""),
      prev, s.name.toUpperCase(), sub, "",
      () => {
        if (formOwned(s.id)) {
          settings.form = s.id;
          saveAll(); sound.click();
          refreshStoreUI();
        } else storeBuy("forms", s.id, s.price);
      });
  });
  // Fruits
  storeGrid("#storeFruits", STORE.fruits, s => {
    const owned = fruitOwned(s.id);
    const sub = owned ? "OWNED" : `\u2605${s.price}`;
    return storeBtn(owned ? "" : ((stats.stars || 0) < s.price ? "cant" : ""),
      s.emoji, s.id.toUpperCase(), sub, owned ? "owned" : "",
      () => { if (!fruitOwned(s.id)) storeBuy("fruits", s.id, s.price); });
  });
}

function openHow() {
  $("#howOverlay").classList.remove("hidden");
}

function closeHow() {
  $("#howOverlay").classList.add("hidden");
}

function openSettings() {
  refreshSettingsUI();
  $("#settingsOverlay").classList.remove("hidden");
}

function closeSettings() {
  $("#settingsOverlay").classList.add("hidden");
  refreshMenuTexts();
  syncHud(true);
}

function handleDir(name) {
  if (state !== "playing" || dead) return;
  const d = DIRS[name];
  if (!d) return;
  const lastD = dirQueue.length ? dirQueue[dirQueue.length - 1] : dir;
  if (d.x === lastD.x && d.y === lastD.y) return;
  if (d.x === -lastD.x && d.y === -lastD.y) return;
  if (dirQueue.length < 3) dirQueue.push(d);
  started = true;
}

function bindEvents() {
  window.addEventListener("pointerdown", () => sound.ensure());
  window.addEventListener("keydown", () => sound.ensure());
  canvas.addEventListener("contextmenu", e => e.preventDefault());

  $("#btnPlay").addEventListener("click", startGame);
  $("#btnAgain").addEventListener("click", startGame);
  $("#btnRestart").addEventListener("click", startGame);
  $("#btnResume").addEventListener("click", resumeGame);
  $("#btnQuit").addEventListener("click", quitToMenu);
  $("#btnOverMenu").addEventListener("click", quitToMenu);
  $("#btnPause").addEventListener("click", togglePause);
  $("#btnHow").addEventListener("click", () => { sound.click(); openHow(); });
  $("#btnCloseHow").addEventListener("click", closeHow);
  $("#btnSettings").addEventListener("click", () => { sound.click(); openSettings(); });
  $("#btnCloseSettings").addEventListener("click", closeSettings);
  $("#btnStore").addEventListener("click", () => { sound.click(); openStore(); });
  $("#btnCloseStore").addEventListener("click", closeStore);
  // Tap outside the panel (on the dim backdrop) closes the page too.
  [["#settingsOverlay", closeSettings], ["#storeOverlay", closeStore], ["#howOverlay", closeHow]]
    .forEach(([id, fn]) => {
      $(id).addEventListener("click", e => { if (e.target === $(id)) fn(); });
    });

  $("#btnMusic").addEventListener("click", () => {
    settings.music = !settings.music;
    saveAll();
    applyAudioToggles();
    sound.click();
  });
  $("#btnSfx").addEventListener("click", () => {
    settings.sfx = !settings.sfx;
    saveAll();
    applyAudioToggles();
    sound.click();
  });

  document.querySelectorAll(".seg").forEach(seg => {
    seg.addEventListener("click", e => {
      const b = e.target.closest("button");
      if (!b) return;
      const name = seg.dataset.setting;
      let v = b.dataset.val;
      if (name === "obstacles") v = v === "on";
      settings[name] = v;
      saveAll();
      sound.click();
      if (name === "touch") applyTouchClass();
      if (name === "mode") { applyMode(); buildBG(); }
      refreshSettingsUI();
      if (name === "difficulty" || name === "walls" || name === "obstacles") {
        refreshMenuTexts();
        syncHud(true);
      }
    });
  });

  $("#swMusic").addEventListener("change", e => {
    settings.music = e.target.checked;
    saveAll();
    applyAudioToggles();
  });
  $("#swSfx").addEventListener("change", e => {
    settings.sfx = e.target.checked;
    saveAll();
    applyAudioToggles();
  });
  $("#swHaptics").addEventListener("change", e => {
    settings.haptics = e.target.checked;
    saveAll();
  });
  $("#swMode").addEventListener("change", e => {
    settings.mode = e.target.checked ? "light" : "dark";
    saveAll();
    applyMode();
    buildBG();
  });

  document.querySelectorAll(".dbtn").forEach(b => {
    b.addEventListener("pointerdown", e => {
      e.preventDefault();
      sound.ensure();
      handleDir(b.dataset.dir);
    });
  });

  let swipeOrigin = null;
  stage.addEventListener("pointerdown", e => {
    if (e.target.closest(".panel, button")) return;
    swipeOrigin = { x: e.clientX, y: e.clientY };
  });
  stage.addEventListener("pointermove", e => {
    if (!swipeOrigin) return;
    const dx = e.clientX - swipeOrigin.x;
    const dy = e.clientY - swipeOrigin.y;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    handleDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
    swipeOrigin = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener("pointerup", () => { swipeOrigin = null; });
  window.addEventListener("pointercancel", () => { swipeOrigin = null; });

  const KEYMAP = {
    ArrowUp: "up", w: "up", W: "up",
    ArrowDown: "down", s: "down", S: "down",
    ArrowLeft: "left", a: "left", A: "left",
    ArrowRight: "right", d: "right", D: "right"
  };
  window.addEventListener("keydown", e => {
    const k = e.key;
    if (KEYMAP[k]) {
      e.preventDefault();
      handleDir(KEYMAP[k]);
      return;
    }
    if (k === " ") {
      e.preventDefault();
      if (state === "playing" || state === "paused") togglePause();
      else if (state === "gameover" && !$("#overOverlay").classList.contains("hidden")) startGame();
      return;
    }
    if (k === "Enter") {
      if (state === "menu") startGame();
      else if (state === "gameover") startGame();
      else if (state === "paused") resumeGame();
      return;
    }
    if (k === "p" || k === "P" || k === "Escape") {
      if (!$("#storeOverlay").classList.contains("hidden")) closeStore();
      else if (!$("#settingsOverlay").classList.contains("hidden")) closeSettings();
      else if (!$("#howOverlay").classList.contains("hidden")) closeHow();
      else togglePause();
      return;
    }
    if (k === "m" || k === "M") {
      settings.music = !settings.music;
      saveAll();
      applyAudioToggles();
      return;
    }
    if (k === "n" || k === "N") {
      settings.sfx = !settings.sfx;
      saveAll();
      applyAudioToggles();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "playing" && !dead) pauseGame();
  });
  window.addEventListener("blur", () => {
    if (state === "playing" && !dead) pauseGame();
  });

  new ResizeObserver(resize).observe(stage);
  window.addEventListener("orientationchange", () => setTimeout(resize, 150));
}

let lastFrame = performance.now();
function loop(t) {
  const dt = Math.min(50, t - lastFrame);
  lastFrame = t;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

applyTheme();
applyMode();
applyTouchClass();
applyAudioToggles();
refreshMenuTexts();
$("#hudBest").textContent = modeBest();
$("#hudBest").title = shortModeLabel(modeKey());
bindEvents();
resize();
reset(true);
setState("menu");
requestAnimationFrame(loop);
