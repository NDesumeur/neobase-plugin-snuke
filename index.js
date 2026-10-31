// Snuke : ton appli d'origine (HTML et code inchangés), livrée en plugin.
// Ses données sont dans le dossier du plugin, que NeoBase sauvegarde (synchro cloud et sauvegardes) ; à la première ouverture elle reprend ce que tu avais dans NeoBase.
// Elle demande l'accès complet pour utiliser les outils d'interface de NeoBase. NeoBase ne l'ouvre que si elle est signée.
const HTML = "<div class=\"appWrap\">\n      <div class=\"agHead\"><span class=\"label\">Snuke</span><span class=\"hint\" id=\"snInfo\"></span><div class=\"agNav\"><select class=\"f gSel\" id=\"snMode\" title=\"Mode de jeu\"></select><button class=\"btn main px\" id=\"snNew\">NOUVELLE PARTIE</button></div></div>\n      <div class=\"gameBox tall snBox\"><canvas id=\"snCanvas\" width=\"240\" height=\"264\"></canvas></div>\n      <div class=\"snLegend\" id=\"snLegend\" style=\"display:none\"></div>\n      <div class=\"hint\">Flèches, ZQSD ou glisser à la souris : tourner · P ou Échap : pause · espace : rejouer. Chaque fruit allonge le serpent et le fait aller plus vite ; une étoile apparaît tous les 7 fruits (50 points, elle ne reste pas longtemps). Classique : les bords tuent · Sans bords : on ressort de l'autre côté · Labyrinthe : 4 plateaux murés, le suivant tous les 10 fruits · Mue : tous les 5 fruits la queue se change en pierre et le serpent repart court · Chrono : 60 secondes, rien ne tue, se mordre coupe la queue · Vergers : trois fruits sur le plateau, dix espèces ; la vitesse du serpent est celle du dernier fruit mangé (piment fulgurant, myrtille tranquille), et les fruits lents rapportent moins. Records et statistiques sauvegardés et synchronisés.</div>\n    </div>";
/*CSS-MOVED*/ const CSS = `.gameBox{display:grid;place-items:center;padding:10px;background:#05010b;box-shadow:0 0 0 3px var(--line2)}
.gameBox.snBox canvas{aspect-ratio:240/264}
.gameBox canvas{width:min(100%,1152px);aspect-ratio:384/144;image-rendering:pixelated;cursor:var(--cp,pointer)}
.gameBox.tall canvas{width:auto;height:min(720px,72vh);aspect-ratio:240/320}
.snLegend{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:6px 18px;font-size:14px;color:var(--lilac)}
.snLegend div{display:flex;align-items:center;gap:10px}
.snLegend canvas{width:20px;height:20px;image-rendering:pixelated;flex:none}
.gSel{width:auto;font-size:14px;padding:6px 10px;margin-right:8px}
`;  // le style de ce plugin (il utilise les variables du thème de NeoBase)
export default async function (ctx) {
  const view = ctx.view;
  if (!ctx.host) { view.textContent = "Ce plugin doit être approuvé par NeoBase pour s'ouvrir."; return; }
  const host = ctx.host, { el, toast, sfx, ask, newTab, pixIcon, PIX, WX } = host;
  const folder = ctx.folder, legacy = ctx.legacy || {};
  ctx.host.addStyle(CSS);
  view.innerHTML = HTML;
  const $ = id => id === "snakeApp" ? view : (view.querySelector('#' + id) || document.getElementById(id));  // les identifiants de ta vue d'abord, puis ceux de la page (fenêtres, menus)
  const doc = async n => { try { return await folder.read(n); } catch { return null; } };
  const __icon = () => ctx.icon;  // l'icône de ce plugin
  const LEGACY_GAMES = {"top":["snake"],"best":"^snake_"};
  let games = await doc('games');
  if (games == null) {  // première ouverture : tu retrouves tes records et tes parties d'avant
    const old = legacy.api ? await legacy.api('games').catch(() => null) : null; games = { best: {} };
    if (old) { const re = new RegExp(LEGACY_GAMES.best); for (const [k, v] of Object.entries(old.best || {})) if (re.test(k)) games.best[k] = v; for (const k of LEGACY_GAMES.top) if (old[k] !== undefined) games[k] = old[k]; await folder.write('games', games); }
  }
  games = { best: {}, ...games };
  let gamesTimer = null;
  const saveGames = () => { clearTimeout(gamesTimer); gamesTimer = setTimeout(() => { gamesTimer = null; folder.write('games', games).catch(() => {}); }, 500); };
  const best = (k, v, higher = true) => { const b = games.best[k]; if (b == null || (higher ? v > b : v < b)) { games.best[k] = v; saveGames(); return true; } return false; };
  const gstore = (k, init) => (games[k] ??= init);  // la section d'un jeu
function gameLoop(st, appKey, update, draw) {
  cancelAnimationFrame(st.raf);
  const STEP = 1000 / 60; let acc = 0, last = performance.now();
  const frame = t => {
    if (!view.classList.contains('on')) { st.raf = 0; if (st.mode === 'play') st.mode = 'pause'; return; }  // leaving the tab pauses the game
    st.raf = requestAnimationFrame(frame);
    acc += Math.min(200, t - last); last = t;
    while (acc >= STEP) { if (st.mode === 'play') update(); st.tick++; acc -= STEP; }
    draw();
  };
  st.raf = requestAnimationFrame(frame);
}
function gameText(g, w, lines, y0) {  // centred pixel-font lines over a dark band
  g.fillStyle = 'rgba(11,3,28,.72)'; g.fillRect(0, y0 - 14, w, lines.length * 14 + 14);
  g.textAlign = 'center';
  lines.forEach(([text, color, size], i) => { g.fillStyle = color; g.font = (size || 8) + 'px "Press Start 2P", monospace'; g.fillText(text, w / 2, y0 + i * 14); });
  g.textAlign = 'left';
}
const px = (g, color, x, y, w = 1, h = 1) => { g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), w, h); };
function sprite(g, rows, x, y, pal) { rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const c = pal[r[i]]; if (c) px(g, c, x + i, y + j); } }); }
  // ---- ton code d'origine ----
/* ---------- jeu "Snuke": a snake on a 24 x 24 board (arrows or ZQSD). Modes: Classique (the edges kill), Sans bords (it comes back on the
   other side), Labyrinthe (4 walled boards, the next one every 10 fruits), Mue (every 5 fruits the tail turns to stone and the snake starts
   short again) and Chrono (60 s, nothing kills: biting yourself cuts your tail). Records and stats are kept in games.json (synced). ---------- */
const SN = {W: 240, H: 264, C: 10, N: 24, TOP: 24,
  kinds: {classique: 'Classique', tore: 'Sans bords', labyrinthe: 'Labyrinthe', mue: 'Mue', chrono: 'Chrono 60 s', verger: 'Vergers'},
  // the labyrinth boards: [name, is (x, y) a wall, start row]
  mazes: [
    ['Couloirs', (x, y) => (y === 6 || y === 17) && x > 3 && x < 20, 11],
    ['Cage', (x, y) => (x === 2 || y === 2 || x === 21 || y === 21) && Math.abs(x - 11.5) > 2 && Math.abs(y - 11.5) > 2, 11],
    ['Colonnes', (x, y) => x % 6 === 3 && y % 8 > 1 && y % 8 < 6, 8],
    ['Zigzag', (x, y) => y === 5 && x < 18 || y === 11 && x > 5 || y === 17 && x < 18, 8],
  ],
};
// le mode Vergers : trois fruits sur le plateau, dix espèces. step = images entre deux pas (petit = rapide) ; la vitesse reste celle du dernier fruit mangé
const SN_FRUITS = [
  {k: 'piment', name: 'Piment', color: '#ff3a2a', step: 3, pts: 50, grow: 1},
  {k: 'fraise', name: 'Fraise', color: '#ff4f6d', step: 4, pts: 35, grow: 1},
  {k: 'citron', name: 'Citron', color: '#ffe45a', step: 4, pts: 25, grow: 2},
  {k: 'orange', name: 'Orange', color: '#ff9a3c', step: 5, pts: 22, grow: 1},
  {k: 'cerise', name: 'Cerise', color: '#d4143c', step: 5, pts: 18, grow: 2},
  {k: 'pomme', name: 'Pomme', color: '#7fe05a', step: 6, pts: 12, grow: 1},
  {k: 'kiwi', name: 'Kiwi', color: '#9aa83a', step: 7, pts: 12, grow: 2},
  {k: 'raisin', name: 'Raisin', color: '#b46aee', step: 8, pts: 9, grow: 1},
  {k: 'pasteque', name: 'Pastèque', color: '#3ac060', step: 10, pts: 7, grow: 4},
  {k: 'myrtille', name: 'Myrtille', color: '#4a6aff', step: 12, pts: 5, grow: 1},
];
const snPace = s => s <= 3 ? 'très rapide' : s === 4 ? 'rapide' : s === 5 ? 'assez rapide' : s === 6 ? 'normal' : s <= 8 ? 'lent' : 'très lent';
function snFruitArt(g, X, Y, f) {  // chaque espèce a sa forme (10 x 10 pixels)
  const c = f.color;
  if (f.k === 'citron') { px(g, c, X + 1, Y + 3, 8, 5); px(g, c, X + 2, Y + 2, 6, 7); px(g, '#fff5a0', X + 3, Y + 3, 2, 2); px(g, '#8aa030', X + 8, Y + 4, 2, 1); }
  else if (f.k === 'fraise') { px(g, c, X + 1, Y + 2, 8, 3); px(g, c, X + 2, Y + 5, 6, 2); px(g, c, X + 3, Y + 7, 4, 1); px(g, c, X + 4, Y + 8, 2, 1); for (const [a, b] of [[3, 3], [6, 3], [4, 5], [6, 6]]) px(g, '#ffe45a', X + a, Y + b); px(g, '#5fd08a', X + 3, Y + 1, 4, 1); px(g, '#5fd08a', X + 4, Y, 2, 1); }
  else if (f.k === 'pasteque') { px(g, '#1f8a40', X, Y + 3, 10, 6); px(g, '#ff4f6d', X + 1, Y + 3, 8, 4); px(g, '#e8ffe0', X + 1, Y + 7, 8, 1); for (const a of [2, 5, 7]) px(g, '#130a20', X + a, Y + 4, 1, 2); }
  else if (f.k === 'raisin') { for (const [a, b] of [[1, 3], [4, 3], [7, 3], [2, 5], [5, 5], [3, 7]]) { px(g, c, X + a, Y + b, 3, 2); px(g, '#e0c0ff', X + a, Y + b, 1, 1); } px(g, '#5fd08a', X + 4, Y + 1, 2, 2); }
  else if (f.k === 'piment') { px(g, c, X + 2, Y + 2, 3, 3); px(g, c, X + 3, Y + 4, 3, 3); px(g, c, X + 5, Y + 6, 3, 2); px(g, '#ffb0a0', X + 2, Y + 2, 1, 2); px(g, '#5fd08a', X + 1, Y + 1, 3, 1); px(g, '#5fd08a', X + 1, Y + 2, 1, 1); }
  else if (f.k === 'kiwi') { px(g, '#7a5a2a', X + 1, Y + 2, 8, 7); px(g, '#7a5a2a', X + 2, Y + 1, 6, 9); px(g, c, X + 2, Y + 3, 6, 5); px(g, '#e8ffd0', X + 4, Y + 4, 2, 2); for (const [a, b] of [[3, 4], [6, 4], [3, 6], [6, 6]]) px(g, '#130a20', X + a, Y + b); }
  else if (f.k === 'myrtille') { px(g, c, X + 3, Y + 3, 5, 5); px(g, c, X + 2, Y + 4, 7, 3); px(g, '#c0c8ff', X + 3, Y + 4, 1, 1); px(g, '#130a20', X + 5, Y + 4, 1, 1); px(g, '#130a20', X + 4, Y + 5, 3, 1); }
  else { px(g, c, X + 2, Y + 3, 6, 6); px(g, c, X + 1, Y + 4, 8, 4); px(g, 'rgba(255,255,255,.6)', X + 3, Y + 4, 2, 2); px(g, '#5fd08a', X + 4, Y + 1, 2, 2); px(g, '#5fd08a', X + 6, Y, 2, 1); }  // cerise, pomme, orange
}
const snSave = () => gstore('snake', {kind: 'classique', games: 0, fruits: 0, longest: 0});
let sn = null;
function snStart(kind = snSave().kind) {
  snSave().kind = kind;
  sn = {raf: sn?.raf || 0, g: $('snCanvas').getContext('2d'), mode: 'ready', kind, tick: 0, maze: 0, rocks: new Set(), score: 0, eaten: 0, wait: 0, queue: [], dir: [1, 0],
    fruit: null, star: null, time: kind === 'chrono' ? 3600 : 0, record: false, cut: 0, fruits: [], fspd: 6, grow: 0, last: null};
  snBody(); snFruit(); snInfo(); $('snMode').value = kind; $('snLegend').style.display = kind === 'verger' ? '' : 'none';
  gameLoop(sn, 'neodyme:snake', snUpdate, snDraw);
}
function snBody() {
  const y = sn.kind === 'labyrinthe' ? SN.mazes[sn.maze][2] : 12;
  sn.body = [[6, y], [5, y], [4, y]]; sn.dir = [1, 0]; sn.queue = [];
}
const snWall = (x, y) => sn.kind === 'labyrinthe' && SN.mazes[sn.maze][1](x, y) || sn.rocks.has(y * SN.N + x);
const snOn = (x, y) => sn.body.some(([a, b]) => a === x && b === y);
function snFree() {
  const free = [];
  for (let y = 0; y < SN.N; y++) for (let x = 0; x < SN.N; x++) if (!snWall(x, y) && !snOn(x, y) && !(sn.fruit?.[0] === x && sn.fruit?.[1] === y) && !(sn.star?.[0] === x && sn.star?.[1] === y) && !sn.fruits?.some(f => f.x === x && f.y === y)) free.push([x, y]);
  return free[Math.floor(Math.random() * free.length)] || null;
}
function snFruit() {
  if (sn.kind !== 'verger') { sn.fruit = snFree(); if (!sn.fruit) snOver(); return; }
  while (sn.fruits.length < 3) {  // trois fruits d'espèces différentes sur le plateau
    const p = snFree(); if (!p) break;
    const rest = SN_FRUITS.filter(k => !sn.fruits.some(f => f.t === k)); sn.fruits.push({x: p[0], y: p[1], t: rest[Math.floor(Math.random() * rest.length)]});
  }
  if (!sn.fruits.length) snOver();
}
// one step of the snake
function snStep() {
  const q = sn.queue.shift(); if (q) sn.dir = q;
  const [hx, hy] = sn.body[0], wrap = sn.kind === 'tore' || sn.kind === 'chrono';
  let x = hx + sn.dir[0], y = hy + sn.dir[1];
  if (wrap) { x = (x + SN.N) % SN.N; y = (y + SN.N) % SN.N; }
  else if (x < 0 || y < 0 || x >= SN.N || y >= SN.N) return snOver();
  if (snWall(x, y)) return snOver();
  const vi = sn.kind === 'verger' ? sn.fruits.findIndex(f => f.x === x && f.y === y) : -1, eat = vi >= 0 || (sn.kind !== 'verger' && sn.fruit && sn.fruit[0] === x && sn.fruit[1] === y), gem = sn.star && sn.star[0] === x && sn.star[1] === y;
  if (!eat && !gem) { if (sn.grow > 0) sn.grow--; else sn.body.pop(); }  // the tail leaves its cell before the head comes in
  const hit = sn.body.findIndex(([a, b]) => a === x && b === y);
  if (hit >= 0) { if (sn.kind !== 'chrono') return snOver(); sn.body.length = Math.max(hit, 2); sn.cut = 20; sfx('error'); }  // keeps the part before the bite
  sn.body.unshift([x, y]);
  if (gem) { sn.star = null; sn.score += 50; sfx('notify'); }
  if (eat) {
    sn.eaten++; sfx('click');
    if (vi >= 0) { const f = sn.fruits.splice(vi, 1)[0]; sn.score += f.t.pts; sn.fspd = f.t.step; sn.grow += f.t.grow - 1; sn.last = f.t; } else sn.score += 10;
    if (sn.kind === 'mue' && sn.eaten % 5 === 0) {  // the tail turns to stone, the snake goes on short
      for (const [a, b] of sn.body.slice(3)) sn.rocks.add(b * SN.N + a);
      sn.body.length = 3; sn.score += 25;
    }
    if (sn.kind === 'labyrinthe' && sn.eaten % 10 === 0) { sn.maze = (sn.maze + 1) % SN.mazes.length; snBody(); sn.star = null; sn.wait = 40; sfx('launch'); }
    if (sn.eaten % 7 === 0 && !sn.star) { sn.star = snFree(); sn.starT = 300; }
    snFruit();
  }
}
const snSpeed = () => sn.kind === 'chrono' ? 5 : sn.kind === 'verger' ? sn.fspd : Math.max(3, 8 - Math.floor(sn.eaten / 6));
function snUpdate() {
  if (sn.cut) sn.cut--;
  if (sn.star && --sn.starT <= 0) sn.star = null;
  if (sn.kind === 'chrono' && --sn.time <= 0) return snOver();
  if (sn.wait > 0) { sn.wait--; return; }
  sn.wait = snSpeed() - 1; snStep();
}
function snOver() {
  if (sn.mode === 'over') return;
  sn.mode = 'over'; sfx('error');
  const s = snSave(); s.games++; s.fruits += sn.eaten; s.longest = Math.max(s.longest, sn.body.length);
  sn.record = best('snake_' + sn.kind, sn.score); saveGames(); snInfo();
}
/* ---------- drawing ---------- */
function snDraw() {
  const g = sn.g, C = SN.C, T = SN.TOP, t = sn.tick;
  g.fillStyle = '#0b031c'; g.fillRect(0, 0, SN.W, SN.H);
  for (let y = 0; y < SN.N; y++) for (let x = 0; x < SN.N; x++) if ((x + y) % 2) px(g, '#110828', x * C, T + y * C, C, C);
  if (sn.kind === 'tore' || sn.kind === 'chrono') { g.strokeStyle = 'rgba(127,224,238,.25)'; g.setLineDash([2, 3]); g.strokeRect(.5, T + .5, SN.W - 1, SN.N * C - 1); g.setLineDash([]); }
  else { g.strokeStyle = '#ff5ad9'; g.lineWidth = 1; g.strokeRect(.5, T + .5, SN.W - 1, SN.N * C - 1); }
  // walls and stones
  for (let y = 0; y < SN.N; y++) for (let x = 0; x < SN.N; x++) {
    const X = x * C, Y = T + y * C;
    if (sn.kind === 'labyrinthe' && SN.mazes[sn.maze][1](x, y)) { px(g, '#5e2aa0', X, Y, C, C); px(g, '#8a4ad0', X, Y, C, 2); px(g, '#3e0f4a', X, Y + 5, C, 1); px(g, '#3e0f4a', X + (y % 2 ? 3 : 7), Y, 1, 5); }
    else if (sn.rocks.has(y * SN.N + x)) { px(g, '#4a4a60', X, Y, C, C); px(g, '#8f8fa8', X + 1, Y + 1, 4, 2); px(g, '#2a2a3a', X + 6, Y + 6, 2, 2); }
  }
  // fruit: a pixel berry that bobs; the star blinks when it is about to go
  if (sn.fruit) { const [x, y] = sn.fruit, X = x * C, Y = T + y * C + (t >> 4) % 2; px(g, '#ff4f6d', X + 2, Y + 3, 6, 6); px(g, '#ff4f6d', X + 1, Y + 4, 8, 4); px(g, '#ffd0f4', X + 3, Y + 4, 2, 2); px(g, '#5fd08a', X + 4, Y + 1, 2, 2); px(g, '#5fd08a', X + 6, Y, 2, 1); }
  for (const f of sn.fruits || []) snFruitArt(g, f.x * C, T + f.y * C + (t >> 4) % 2, f.t);
  if (sn.star && (sn.starT > 90 || (t >> 3) % 2)) sprite(g, CA_STAR, sn.star[0] * C - 1, T + sn.star[1] * C - 1, {y: '#ffd07a', w: '#fff5d0'});
  // the snake: head with eyes looking where it goes, body getting darker towards the tail
  const n = sn.body.length;
  sn.body.forEach(([x, y], i) => {
    const X = x * C, Y = T + y * C, head = i === 0;
    const col = sn.cut && (t >> 2) % 2 ? '#ffffff' : head ? '#ff5ad9' : i % 2 ? '#c03aa8' : '#d84ac0';
    px(g, col, X + 1, Y + 1, C - 2, C - 2);
    if (!head) { px(g, i > n * .7 ? '#7a2070' : '#ff8ae6', X + 3, Y + 3, 2, 2); return; }
    const [dx, dy] = sn.dir, e1 = dy ? [2, 4 + dy * 2] : [4 + dx * 2, 2], e2 = dy ? [6, 4 + dy * 2] : [4 + dx * 2, 6];
    for (const [a, b] of [e1, e2]) { px(g, '#ffffff', X + a, Y + b, 2, 2); px(g, '#130a20', X + a + (dx > 0 ? 1 : 0), Y + b + (dy > 0 ? 1 : 0), 1, 1); }
    if ((t >> 3) % 8 === 0) px(g, '#ff4f6d', X + 4 + dx * 5, Y + 4 + dy * 5, 2, 2);  // the tongue
  });
  // header
  g.font = '6px "Press Start 2P", monospace'; g.fillStyle = '#8f7bb8';
  g.fillText('SCORE', 6, 9); g.fillText('RECORD', 70, 9); g.fillText(sn.kind === 'chrono' ? 'TEMPS' : sn.kind === 'labyrinthe' ? SN.mazes[sn.maze][0].toUpperCase() : 'TAILLE', 140, 9);
  g.fillStyle = '#ffd07a'; g.font = '8px "Press Start 2P", monospace';
  g.fillText(String(sn.score), 6, 20); g.fillText(String(games?.best['snake_' + sn.kind] ?? 0), 70, 20);
  g.fillText(sn.kind === 'chrono' ? Math.ceil(sn.time / 60) + ' s' : String(sn.body.length), 140, 20);
  if (sn.kind === 'verger') {  // la vitesse du dernier fruit mangé
    g.font = '6px "Press Start 2P", monospace'; g.fillStyle = '#8f7bb8'; g.fillText('VITESSE', 190, 9);
    const k = (13 - sn.fspd) / 10; px(g, '#05010b', 190, 13, 46, 7); px(g, k > .7 ? '#ff4f6d' : k > .45 ? '#ffd07a' : '#7fe0ee', 191, 14, Math.round(44 * k), 5);
  }
  if (sn.mode === 'ready') gameText(g, SN.W, [['SNUKE', '#ff5ad9', 12], [SN.kinds[sn.kind].toUpperCase(), '#ffd07a', 8], ['UNE FLÈCHE POUR PARTIR', '#ffffff', 7]], 128);
  if (sn.mode === 'pause') gameText(g, SN.W, [['PAUSE', '#ffd07a', 10], ['UNE FLÈCHE POUR REPRENDRE', '#d9c6ff', 7]], 140);
  if (sn.mode === 'over') gameText(g, SN.W, [[sn.kind === 'chrono' ? 'TEMPS ÉCOULÉ' : 'PERDU', '#ff4f6d', 10], [sn.score + ' POINTS' + (sn.record ? ' · RECORD !' : ''), '#ffd07a', 8], [sn.eaten + ' FRUITS · TAILLE ' + sn.body.length, '#d9c6ff', 7], ['ESPACE : REJOUER', '#ffffff', 7]], 122);
}
/* ---------- input and page ---------- */
const SN_DIRS = {ArrowLeft: [-1, 0], q: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0], ArrowUp: [0, -1], z: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1]};
function snTurn(d) {
  if (sn.mode === 'over') return;
  if (sn.mode !== 'play') sn.mode = 'play';
  const last = sn.queue.at(-1) || sn.dir;
  if (sn.queue.length < 2 && !(last[0] === d[0] && last[1] === d[1]) && !(last[0] === -d[0] && last[1] === -d[1])) sn.queue.push(d);  // no U-turn into yourself
}
document.addEventListener('keydown', e => {
  if (!view.classList.contains('on') || !sn || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (SN_DIRS[k]) { e.preventDefault(); snTurn(SN_DIRS[k]); }
  else if ((k === ' ' || k === 'Enter') && sn.mode === 'over') { e.preventDefault(); snStart(sn.kind); }
  else if (k === 'p' || k === 'Escape') { if (sn.mode === 'play') sn.mode = 'pause'; }
});
// mouse / touch: a swipe on the board turns
$('snCanvas').onpointerdown = e => {
  const cv = $('snCanvas'), sx = e.clientX, sy = e.clientY; cv.setPointerCapture(e.pointerId);
  cv.onpointerup = u => { cv.onpointerup = null; const dx = u.clientX - sx, dy = u.clientY - sy;
    if (sn.mode === 'over') return snStart(sn.kind);
    if (Math.hypot(dx, dy) > 12) snTurn(Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]); };
};
function snLegend() {  // les dix fruits, leur vitesse et leurs points
  $('snLegend').replaceChildren(...SN_FRUITS.map(f => {
    const row = el('div'), cv = el('canvas'); cv.width = cv.height = 10; snFruitArt(cv.getContext('2d'), 0, 0, f);
    row.append(cv, el('span', '', f.name + ' · ' + snPace(f.step) + ' · ' + f.pts + ' pts' + (f.grow > 1 ? ' · +' + (f.grow - 1) + ' de longueur' : ''))); return row;
  }));
}
function snInfo() { const s = snSave(); $('snInfo').textContent = 'Records : ' + Object.entries(SN.kinds).map(([k, v]) => v + ' ' + (games?.best['snake_' + k] ?? 0)).join(' · ') + ' · ' + s.games + ' parties · ' + s.fruits + ' fruits · plus long : ' + s.longest; }
function snOpen() {
  if (!$('snMode').options.length) $('snMode').replaceChildren(...Object.entries(SN.kinds).map(([k, v]) => Object.assign(el('option', '', v), {value: k})));
  if (sn) { gameLoop(sn, 'neodyme:snake', snUpdate, snDraw); snInfo(); return; }
  snStart();
}
snLegend();
$('snMode').onchange = () => { snStart($('snMode').value); saveGames(); $('snMode').blur(); };
$('snNew').onclick = () => { snStart(sn?.kind); $('snNew').blur(); };
{  // self-check: eating grows by one, a U-turn is refused, Chrono cuts the tail instead of killing, Mue turns the tail to stone
  const keep = sn, real = {snFruit, snOver}; let over = 0; snFruit = () => { sn.fruit = null; }; snOver = () => over++;
  try {
    sn = {kind: 'classique', mode: 'play', body: [[5, 5], [4, 5], [3, 5]], dir: [1, 0], queue: [], rocks: new Set(), maze: 0, eaten: 0, score: 0, fruit: [6, 5], star: null};
    snStep(); const grew = sn.body.length === 4 && sn.score === 10;
    snTurn([-1, 0]); const noU = sn.queue.length === 0;
    sn.body = [[5, 5], [5, 6], [4, 6], [4, 5], [3, 5]]; sn.dir = [0, 1]; sn.queue = [[-1, 0]]; snStep(); const died = over === 1;  // turns left into its own body
    sn.kind = 'chrono'; sn.body = [[5, 5], [5, 6], [4, 6], [4, 5], [3, 5], [2, 5]]; sn.dir = [0, 1]; sn.queue = [[-1, 0]]; snStep(); const cut = over === 1 && sn.body.length === 4 &&sn.body[0][0] === 4 && sn.body[0][1] === 5;
    sn.kind = 'mue'; sn.body = [[5, 5], [4, 5], [3, 5], [2, 5], [1, 5]]; sn.dir = [1, 0]; sn.eaten = 4; sn.fruit = [6, 5]; snStep(); const stone = sn.body.length === 3 && sn.rocks.size === 3;
    sn.kind = 'verger'; sn.body = [[5, 5], [4, 5], [3, 5]]; sn.dir = [1, 0]; sn.eaten = 0; sn.score = 0; sn.grow = 0; sn.fspd = 6; sn.fruit = null; sn.fruits = [{x: 6, y: 5, t: SN_FRUITS[0]}, {x: 9, y: 9, t: SN_FRUITS[8]}];
    snStep(); const pepper = sn.fspd === 3 && sn.score === 50 && sn.body.length === 4 && sn.fruits.length === 1;  // le piment : vitesse 3, 50 points
    sn.fruits.push({x: 7, y: 5, t: SN_FRUITS[8]}); snStep(); const melon = sn.fspd === 10 && sn.grow === 3 && sn.body.length === 5; snStep(); snStep(); const grows = sn.body.length === 7 && sn.grow === 1;  // la pastèque : lente, la queue grandit de 4
    console.assert(grew && noU && died && cut && stone && pepper && melon && grows && SN_FRUITS.length === 10 && new Set(SN_FRUITS.map(f => f.k)).size === 10, 'snake moves', {grew, noU, died, cut, stone, pepper, melon, grows});
  } finally { ({snFruit, snOver} = real); sn = keep; }
}  // (non indenté : les textes sur plusieurs lignes restent exactement les tiens)
  // ---- fin ----
  ctx.onOpen(() => { snOpen(); });
}
