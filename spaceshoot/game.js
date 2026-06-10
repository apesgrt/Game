'use strict';
/* ══════════════════════════════════════════════
   RAFFZSPACE — game.js
   Optimised: no shadowBlur, capped particles,
   simple draw calls, hub-compatible
══════════════════════════════════════════════ */

// ── Canvas ───────────────────────────────────
const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d');
let W = innerWidth, H = innerHeight;

function resizeCanvas() {
  W = innerWidth; H = innerHeight;
  canvas.width  = W;
  canvas.height = H;
}
resizeCanvas();
addEventListener('resize', resizeCanvas);

// ════════════════════════════════════════════
//  SFX  (Web Audio API, no performance cost)
// ════════════════════════════════════════════
const SFX = (() => {
  let _ac;
  const ac = () => {
    if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)();
    if (_ac.state === 'suspended') _ac.resume();
    return _ac;
  };
  const tone = (f, type, vol, dur, delay = 0) => {
    try {
      const c = ac(), t = c.currentTime;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(vol, t + delay);
      g.gain.exponentialRampToValueAtTime(0.001, t + delay + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t + delay); o.stop(t + delay + dur + 0.05);
    } catch(e) {}
  };
  const noise = (vol, dur, freq = 200) => {
    try {
      const c = ac(), t = c.currentTime;
      const len = Math.ceil(c.sampleRate * dur);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d   = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const s = c.createBufferSource(), flt = c.createBiquadFilter(), g = c.createGain();
      s.buffer = buf; flt.type = 'bandpass'; flt.frequency.value = freq;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(flt); flt.connect(g); g.connect(c.destination);
      s.start(); s.stop(t + dur + 0.05);
    } catch(e) {}
  };
  return {
    shoot(ship) {
      if (ship === 'nova')       tone(1300, 'square', 0.05, 0.03);
      else if (ship === 'titan') tone(380,  'sawtooth', 0.07, 0.07);
      else                       tone(880,  'square',  0.055, 0.04);
    },
    enemyShoot() { tone(240, 'square', 0.04, 0.06); },
    hit()        { noise(0.07, 0.05, 700); },
    playerHit()  { tone(180, 'sawtooth', 0.2, 0.1); tone(130, 'sawtooth', 0.14, 0.1, 0.06); },
    explodeSmall() { noise(0.12, 0.15, 300); },
    explodeBig()   { noise(0.32, 0.45, 160); tone(75, 'sawtooth', 0.26, 0.38); },
    bossSpawn()  {
      noise(0.18, 0.4, 80);
      [75, 95, 75].forEach((f, i) => tone(f, 'sawtooth', 0.2, 0.3, i * 0.14));
    },
    bossDefeat() {
      noise(0.42, 0.55, 180);
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 'sine', 0.13, 0.2, 0.5 + i * 0.1));
    },
    levelUp() { [400, 500, 620, 800].forEach((f, i) => tone(f, 'square', 0.09, 0.1, i * 0.07)); },
    gameOver() { [380, 320, 260, 200, 145].forEach((f, i) => tone(f, 'sawtooth', 0.16, 0.26, i * 0.13)); },
  };
})();

// ════════════════════════════════════════════
//  SHIP DATA
// ════════════════════════════════════════════
const ships = {
  falcon: { name:'Falcon', desc:'Seimbang, cocok semua level.',
            color1:'#67e8f9', color2:'#2563eb',
            hp:110, speed:6.2, damage:2,   fireDelay:230 },
  nova:   { name:'Nova',   desc:'Cepat, spread lebar, HP kecil.',
            color1:'#c084fc', color2:'#7c3aed',
            hp:90,  speed:7.4, damage:1.8,  fireDelay:180 },
  titan:  { name:'Titan',  desc:'Lambat, HP besar, damage tinggi.',
            color1:'#fb923c', color2:'#dc2626',
            hp:155, speed:4.7, damage:3,    fireDelay:265 },
};
const UNLOCK_COST = { falcon: 0, nova: 500, titan: 800 };
const MAX_UPGRADE = 8;

// ════════════════════════════════════════════
//  SAVE / MENU
// ════════════════════════════════════════════
let save = JSON.parse(localStorage.getItem('raffzSpaceSave')) || {
  coins: 160, ship: 'falcon', unlocked: ['falcon'],
  shipUpgrades: {
    falcon: { damage:1, fire:1, hp:1, coin:1 },
    nova:   { damage:1, fire:1, hp:1, coin:1 },
    titan:  { damage:1, fire:1, hp:1, coin:1 },
  }
};
// Migrate old format
if (!save.shipUpgrades) {
  const old = save.upgrades || { damage:1, fire:1, hp:1, coin:1 };
  save.shipUpgrades = { falcon:{...old}, nova:{damage:1,fire:1,hp:1,coin:1}, titan:{damage:1,fire:1,hp:1,coin:1} };
  save.unlocked = save.unlocked || ['falcon'];
  delete save.upgrades;
}
if (!save.unlocked) save.unlocked = ['falcon'];

function saveData() { localStorage.setItem('raffzSpaceSave', JSON.stringify(save)); updateMenu(); }

function upgradeCost(t) {
  const lv = save.shipUpgrades[save.ship][t];
  return { damage:75, fire:85, hp:70, coin:100 }[t] + lv * 45;
}
function buyUpgrade(t) {
  const ups = save.shipUpgrades[save.ship];
  if (ups[t] >= MAX_UPGRADE) { alert('Upgrade sudah MAX!'); return; }
  const cost = upgradeCost(t);
  if (save.coins < cost) { alert('Coin belum cukup!'); return; }
  save.coins -= cost; ups[t]++; saveData();
}
function unlockShip(id) {
  if (save.unlocked.includes(id)) return;
  const cost = UNLOCK_COST[id];
  if (save.coins < cost) { alert(`Butuh 🪙${cost}`); return; }
  save.coins -= cost; save.unlocked.push(id); save.ship = id; saveData();
}

function makePips(id, lv, max, acc) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = ''; el.style.setProperty('--acc', acc);
  for (let i = 0; i < max; i++) {
    const p = document.createElement('div');
    p.className = 'upg-pip' + (i < lv ? ' filled' : '');
    el.appendChild(p);
  }
}

function updateMenu() {
  document.getElementById('coinText').textContent = save.coins;
  document.getElementById('upgSec').textContent = `Upgrade — ${ships[save.ship]?.name || ''}`;

  const u = save.shipUpgrades[save.ship] || { damage:1, fire:1, hp:1, coin:1 };
  [['damage','damageText','damagePips','#67e8f9'],
   ['fire','fireText','firePips','#fb923c'],
   ['hp','hpTextMenu','hpPips','#22c55e'],
   ['coin','coinBonusText','coinPips','#facc15']].forEach(([type, tid, pid, acc]) => {
    const lv = u[type], cost = upgradeCost(type);
    document.getElementById(tid).textContent = lv >= MAX_UPGRADE ? 'MAX' : `Lv ${lv}  •  ${cost} coin`;
    makePips(pid, lv, MAX_UPGRADE, acc);
  });

  const list = document.getElementById('shipList');
  list.innerHTML = '';
  Object.keys(ships).forEach(id => {
    const s = ships[id];
    const owned    = save.unlocked.includes(id);
    const selected = save.ship === id;
    const div = document.createElement('div');
    div.className = 'ship-card' + (selected ? ' active' : '') + (owned ? '' : ' locked');
    div.style.setProperty('--c1', s.color1);
    div.innerHTML = `
      ${!owned ? `<div class="lock-ic">🔒</div>` : ''}
      <h3 style="color:${s.color1}">${s.name}</h3>
      <p>${s.desc}</p>
      <svg class="mini-ship" viewBox="0 0 80 80">
        <defs>
          <linearGradient id="g${id}" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="${s.color1}"/>
            <stop offset="100%" stop-color="${s.color2}"/>
          </linearGradient>
        </defs>
        <path d="M40 5 L55 55 L40 46 L25 55Z" fill="url(#g${id})"/>
        <path d="M20 40 L6 62 L30 55Z"  fill="${s.color2}" opacity=".9"/>
        <path d="M60 40 L74 62 L50 55Z" fill="${s.color2}" opacity=".9"/>
        <ellipse cx="40" cy="29" rx="7" ry="13" fill="#e0f2fe" opacity=".9"/>
        <circle cx="40" cy="64" r="5" fill="#facc15"/>
      </svg>
      ${owned
        ? `<div class="ship-badge">HP ${s.hp} · SPD ${s.speed}</div>`
        : `<div class="ship-price">🪙 ${UNLOCK_COST[id]}</div>
           <button class="beli-btn" onclick="unlockShip('${id}');event.stopPropagation()">BELI</button>`}
    `;
    if (owned) { div.style.cursor = 'pointer'; div.onclick = () => { save.ship = id; saveData(); }; }
    list.appendChild(div);
  });
}
updateMenu();

// ════════════════════════════════════════════
//  GAME STATE
// ════════════════════════════════════════════
let player, bullets = [], enemies = [], eBullets = [], particles = [];
let stars = [], boss = null, announce = null, floats = [];
let keys = {}, playing = false, paused = false;
let score = 0, level = 1, runCoins = 0, lastShot = 0, eSpawn = 0;
let targetX = null, targetY = null, loopStarted = false;
let shakeX = 0, shakeY = 0, shakeAmt = 0;
let combo = 0, comboTimer = 0, maxCombo = 0, killCount = 0;
let trailTick = 0;

function addShake(a) { shakeAmt = Math.max(shakeAmt, a); }
function showAnnounce(text, color = '#fff') { announce = { text, color, life: 100, max: 100 }; }
function addFloat(x, y, text, color) { floats.push({ x, y: y - 8, text, color, life: 55, max: 55, vy: -.75 }); }
function addCoins(a) {
  const b = save.shipUpgrades[save.ship]?.coin || 1;
  runCoins += Math.ceil(a * (1 + b * .12));
}

// ════════════════════════════════════════════
//  BACKGROUND  (cheap: 2-layer stars only)
// ════════════════════════════════════════════
function createStars() {
  stars = [];
  for (let i = 0; i < 55; i++)
    stars.push({ x: Math.random()*W, y: Math.random()*H, spd: .7+Math.random()*.8, r: .8+Math.random()*1.2, a: .2+Math.random()*.5 });
  for (let i = 0; i < 22; i++)
    stars.push({ x: Math.random()*W, y: Math.random()*H, spd: 1.6+Math.random(), r: 1.4+Math.random()*1.5, a: .4+Math.random()*.6 });
}

function drawBackground() {
  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, W, H);
  stars.forEach(s => {
    s.y += s.spd;
    if (s.y > H) { s.y = -4; s.x = Math.random() * W; }
    ctx.globalAlpha = s.a;
    ctx.fillStyle = '#bfdbfe';
    ctx.fillRect(s.x, s.y, s.r, s.spd > 1.4 ? s.r * 2.5 : s.r);
  });
  ctx.globalAlpha = 1;
}

// ════════════════════════════════════════════
//  PLAYER
// ════════════════════════════════════════════
function startGame() {
  const base = ships[save.ship];
  const ups  = save.shipUpgrades[save.ship];
  player = {
    x: W/2, y: H - 100, r: 28,
    hp: base.hp + ups.hp * 24,
    maxHp: base.hp + ups.hp * 24,
    speed: base.speed,
    damage: base.damage + ups.damage * .75,
    fireDelay: Math.max(85, base.fireDelay - ups.fire * 17),
    ship: save.ship, inv: 0,
  };
  bullets = []; enemies = []; eBullets = []; particles = [];
  floats = []; announce = null; boss = null;
  score = 0; level = 1; runCoins = 0; eSpawn = 0; lastShot = 0;
  combo = 0; comboTimer = 0; maxCombo = 0; killCount = 0;
  shakeAmt = 0; trailTick = 0;
  targetX = player.x; targetY = player.y;
  createStars();

  playing = true; paused = false;
  document.getElementById('menu').style.display      = 'none';
  document.getElementById('endScreen').style.display = 'none';
  canvas.style.display                               = 'block';
  document.getElementById('hud').style.display       = 'flex';
  document.getElementById('pauseBtn').textContent    = '⏸';
  if (!loopStarted) { loopStarted = true; requestAnimationFrame(loop); }
}

function togglePause() {
  if (!playing) return;
  paused = !paused;
  document.getElementById('pauseBtn').textContent = paused ? '▶' : '⏸';
}
function goBack() {
  playing = false;
  canvas.style.display                               = 'none';
  document.getElementById('hud').style.display       = 'none';
  document.getElementById('bossBar').style.display   = 'none';
  document.getElementById('endScreen').style.display = 'none';
  document.getElementById('menu').style.display      = 'flex';
  if (window.parent && window.parent !== window)
    window.parent.postMessage('game:close', '*');
  else
    window.location.href = '../home.html';
}
function backToMenu() {
  document.getElementById('endScreen').style.display = 'none';
  document.getElementById('bossBar').style.display   = 'none';
  document.getElementById('menu').style.display      = 'flex';
  canvas.style.display                               = 'none';
  document.getElementById('hud').style.display       = 'none';
  updateMenu();
}
function endGame() {
  playing = false;
  SFX.gameOver(); addShake(16);
  save.coins += runCoins; saveData();
  setTimeout(() => {
    document.getElementById('endTitle').textContent = player.hp <= 0 ? 'GAME OVER' : 'MISI SELESAI';
    document.getElementById('endStats').innerHTML = `
      <div class="stat-row"><span>Skor</span><span class="stat-val">${score}</span></div>
      <div class="stat-row"><span>Level</span><span class="stat-val">${level}</span></div>
      <div class="stat-row"><span>Musuh Dikalahkan</span><span class="stat-val">${killCount}</span></div>
      <div class="stat-row"><span>Combo Terbaik</span><span class="stat-val">${maxCombo}x</span></div>
    `;
    document.getElementById('endCoins').textContent = `🪙 +${runCoins} Coin didapat`;
    document.getElementById('endScreen').style.display = 'flex';
    document.getElementById('hud').style.display       = 'none';
    document.getElementById('bossBar').style.display   = 'none';
  }, 550);
}

function hitPlayer(dmg) {
  if (player.inv > 0) return;
  player.hp -= dmg; player.inv = 40;
  SFX.playerHit(); addShake(12);
  explode(player.x, player.y, ships[player.ship].color1, 8);
  if (player.hp <= 0) { player.hp = 0; endGame(); }
}

// ════════════════════════════════════════════
//  SHOOTING
// ════════════════════════════════════════════
function shoot() {
  const now = performance.now();
  if (now - lastShot < player.fireDelay) return;
  const c1 = ships[player.ship].color1;
  bullets.push({ x: player.x, y: player.y - 36, vx: 0,   vy: -10.5, r: 4, dmg: player.damage, color: c1 });
  if (player.ship !== 'falcon') {
    const spread = player.ship === 'nova' ? 14 : 18;
    bullets.push({ x: player.x - spread, y: player.y - 18, vx: -.35, vy: -9.8, r: 3.5, dmg: player.damage * .7, color: c1 });
    bullets.push({ x: player.x + spread, y: player.y - 18, vx:  .35, vy: -9.8, r: 3.5, dmg: player.damage * .7, color: c1 });
  }
  SFX.shoot(player.ship);
  lastShot = now;
}

// ════════════════════════════════════════════
//  EXPLOSIONS  (no rings, capped particles)
// ════════════════════════════════════════════
function explode(x, y, color, count = 12) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - .5) * (count > 10 ? 7 : 5),
      vy: (Math.random() - .5) * (count > 10 ? 7 : 5),
      life: Math.random() * 20 + 14,
      r: Math.random() * 3 + 1.5,
      color,
    });
  }
  // Hard cap
  if (particles.length > 70) particles.splice(0, particles.length - 70);
}

// ════════════════════════════════════════════
//  ENEMIES
// ════════════════════════════════════════════
const eTypes = {
  scout: { hp(l){ return 4  + l;       }, r:20, spd(l){ return 2.2  + l*.12; }, coin:5  },
  orb:   { hp(l){ return 8  + l*1.4;   }, r:24, spd(l){ return 1.8  + l*.1;  }, coin:9  },
  heavy: { hp(l){ return 15 + l*2;     }, r:32, spd(l){ return 1.2  + l*.08; }, coin:15 },
  blade: { hp(l){ return 10 + l*1.7;   }, r:27, spd(l){ return 2.8  + l*.13; }, coin:13 },
};
function spawnEnemy() {
  const ch = Math.random();
  let type = 'scout';
  if (level >= 3 && ch > .72) type = 'orb';
  if (level >= 5 && ch > .84) type = 'heavy';
  if (level >= 7 && ch > .91) type = 'blade';
  const d = eTypes[type];
  const hp = d.hp(level);
  enemies.push({
    type, r: d.r, spd: d.spd(level), coin: d.coin,
    x: Math.random() * (W - 80) + 40, y: -60,
    hp, maxHp: hp, rot: Math.random() * 10,
    shootT: Math.random() * 120, flash: 0,
  });
}
function spawnBoss() {
  const hp = 160 + level * 55;
  boss = { x: W/2, y: 105, w: Math.min(230, W-40), h: 84, hp, maxHp: hp, dir: 1, shootT: 0 };
  SFX.bossSpawn(); addShake(18);
  showAnnounce('⚠ BOSS MUNCUL ⚠', '#ef4444');
  explode(W/2, 110, '#ef4444', 24);
  document.getElementById('bossBar').style.display = 'block';
}

function dst(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx*dx + dy*dy); }

// ════════════════════════════════════════════
//  UPDATE
// ════════════════════════════════════════════
function update() {
  if (!playing || paused) return;
  if (player.inv > 0) player.inv--;
  if (comboTimer > 0) { comboTimer--; if (comboTimer <= 0) combo = 0; }

  // Move player
  if (keys.ArrowLeft || keys.a) player.x -= player.speed;
  if (keys.ArrowRight|| keys.d) player.x += player.speed;
  if (keys.ArrowUp   || keys.w) player.y -= player.speed;
  if (keys.ArrowDown || keys.s) player.y += player.speed;
  if (targetX !== null) { player.x += (targetX - player.x) * .14; player.y += (targetY - player.y) * .14; }
  player.x = Math.max(30, Math.min(W-30, player.x));
  player.y = Math.max(52, Math.min(H-38, player.y));

  shoot();

  // Engine trail — every 4 frames only
  trailTick++;
  if (trailTick % 4 === 0) {
    const c1 = ships[player.ship].color1;
    particles.push({ x: player.x + (Math.random()-.5)*10, y: player.y+34,
      vx:(Math.random()-.5)*.6, vy:1.2+Math.random(), life:10, r:1.5, color:c1, trail:true });
  }

  // Spawn enemies
  eSpawn++;
  if (eSpawn > Math.max(22, 65 - level*3) && !boss) { spawnEnemy(); eSpawn = 0; }

  // Level up
  if (score > level * 190) {
    level++;
    SFX.levelUp();
    showAnnounce(`LEVEL ${level}`, '#67e8f9');
    if (level % 4 === 0 && !boss) spawnBoss();
  }

  // Move bullets
  bullets.forEach(b  => { b.x += b.vx; b.y += b.vy; });
  eBullets.forEach(b => { b.x += b.vx; b.y += b.vy; });

  // Move & shoot enemies
  enemies.forEach(e => {
    e.y   += e.spd;
    e.rot += e.type === 'blade' ? .1 : .02;
    if (e.flash > 0) e.flash--;
    e.shootT++;
    if (e.shootT > 120 - level*3 && Math.random() < .04) {
      eBullets.push({ x:e.x, y:e.y+e.r, vx:(player.x-e.x)*.006, vy:4+level*.05, r:5, dmg:e.type==='heavy'?18:10 });
      SFX.enemyShoot(); e.shootT = 0;
    }
    if (dst(e, player) < e.r + player.r*.7)  { e.hp = 0; hitPlayer(e.type==='heavy'?30:18); }
    if (e.y > H + 80)                         { e.hp = 0; hitPlayer(10); }
  });

  // Player bullets vs enemies
  bullets.forEach(b => {
    enemies.forEach(e => {
      if (dst(b, e) < b.r + e.r) {
        e.hp -= b.dmg; e.flash = 8; b.y = -999;
        SFX.hit();
        addFloat(e.x, e.y, `-${Math.ceil(b.dmg)}`, b.color);
      }
    });
    if (boss) {
      const bx = b.x > boss.x - boss.w/2 && b.x < boss.x + boss.w/2;
      const by = b.y > boss.y - boss.h/2 && b.y < boss.y + boss.h/2;
      if (bx && by) { boss.hp -= b.dmg; b.y = -999; SFX.hit(); addFloat(boss.x+(Math.random()-.5)*50, boss.y, `-${Math.ceil(b.dmg)}`, '#fca5a5'); }
    }
  });

  // Enemy bullets vs player
  eBullets.forEach(b => { if (dst(b, player) < b.r + player.r*.65) { b.y = H+999; hitPlayer(b.dmg); } });

  // Kill enemies
  enemies = enemies.filter(e => {
    if (e.hp > 0) return true;
    combo++; if (combo > maxCombo) maxCombo = combo;
    comboTimer = 90; killCount++;
    addCoins(e.coin); score += { scout:15, orb:25, heavy:35, blade:28 }[e.type] || 15;
    SFX.explodeSmall();
    explode(e.x, e.y, { scout:'#ef4444', orb:'#22d3ee', heavy:'#f97316', blade:'#a855f7' }[e.type] || '#ef4444', 14);
    if (combo >= 3) addFloat(e.x, e.y - 24, `${combo}x COMBO!`, '#facc15');
    return false;
  });

  // Boss update
  if (boss) {
    boss.x += boss.dir * (1.5 + level * .03);
    if (boss.x < boss.w/2 + 10 || boss.x > W - boss.w/2 - 10) boss.dir *= -1;
    boss.shootT++;
    if (boss.shootT > 44) {
      for (let i = -2; i <= 2; i++)
        eBullets.push({ x: boss.x + i*25, y: boss.y+46, vx: i*.5, vy:4+level*.05, r:6, dmg:14 });
      SFX.enemyShoot(); boss.shootT = 0;
    }
    if (boss.hp <= 0) {
      score += 400; addCoins(120); killCount += 10;
      SFX.bossDefeat(); addShake(20);
      explode(boss.x, boss.y, '#ef4444', 30);
      showAnnounce('BOSS DEFEATED!', '#facc15');
      boss = null;
      document.getElementById('bossBar').style.display = 'none';
    } else {
      const pct = Math.max(0, boss.hp / boss.maxHp);
      document.getElementById('bossFill').style.width  = `${pct*100}%`;
      document.getElementById('bossHpNum').textContent = `${Math.ceil(boss.hp)}/${boss.maxHp}`;
    }
  }

  // Particles
  particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vx *= .96; p.vy *= .96; p.life--; });
  particles = particles.filter(p => p.life > 0);
  floats.forEach(f => { f.y += f.vy; f.life--; });
  floats = floats.filter(f => f.life > 0);
  bullets  = bullets.filter(b => b.y > -80 && b.y < H + 80);
  eBullets = eBullets.filter(b => b.y < H + 80);

  // Screen shake
  if (shakeAmt > .5) {
    shakeX = (Math.random() - .5) * shakeAmt * 2;
    shakeY = (Math.random() - .5) * shakeAmt * 2;
    shakeAmt *= .72;
  } else { shakeX = 0; shakeY = 0; shakeAmt = 0; }
}

// ════════════════════════════════════════════
//  DRAW — optimised (no shadowBlur in game loop)
// ════════════════════════════════════════════
function draw() {
  ctx.save();
  ctx.translate(shakeX, shakeY);

  drawBackground();
  drawBullets();
  enemies.forEach(drawEnemy);
  if (boss) drawBoss();
  drawPlayer();
  drawParticles();
  drawFloats();
  drawAnnounce();

  if (paused) {
    ctx.fillStyle = 'rgba(2,6,23,.72)'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = '#e2e8f0'; ctx.textAlign = 'center';
    ctx.font = 'bold 36px sans-serif'; ctx.fillText('PAUSE', W/2, H/2);
    ctx.font = '13px sans-serif'; ctx.fillStyle = '#475569';
    ctx.fillText('Tekan ⏸ / ESC untuk lanjut', W/2, H/2 + 30);
  }
  ctx.restore();
  updateHUD();
}

// ── Bullets: simple rect, no gradient, no shadowBlur ──
function drawBullets() {
  bullets.forEach(b => {
    ctx.fillStyle = b.color;
    ctx.globalAlpha = .92;
    ctx.beginPath(); ctx.roundRect(b.x - b.r/2, b.y - 20, b.r, 24, b.r/2); ctx.fill();
    // Bright tip
    ctx.fillStyle = '#fff'; ctx.globalAlpha = .65;
    ctx.beginPath(); ctx.arc(b.x, b.y - 19, b.r * .38, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  });
  eBullets.forEach(b => {
    ctx.fillStyle = '#f87171'; ctx.globalAlpha = .88;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ffe4e6'; ctx.globalAlpha = .6;
    ctx.beginPath(); ctx.arc(b.x - 1.2, b.y - 1.2, b.r * .38, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  });
}

// ── Player: polygon shapes, no shadowBlur ──────────
function drawPlayer() {
  const s   = ships[player.ship];
  const blink = player.inv > 0 && Math.floor(player.inv/4) % 2 === 0;
  if (blink) return;
  ctx.save(); ctx.translate(player.x, player.y);
  // Engine glow (cheap: just a coloured oval)
  ctx.fillStyle = s.color1; ctx.globalAlpha = .18;
  ctx.beginPath(); ctx.ellipse(0, 34, 18, 26, 0, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1;

  if (player.ship === 'falcon') {
    // Wings
    ctx.fillStyle = s.color2;
    poly([[-12,-2],[-45,28],[-18,20],[-8,36]]); poly([[12,-2],[45,28],[18,20],[8,36]]);
    // Body
    const g = ctx.createLinearGradient(0,-44,0,40);
    g.addColorStop(0,'#e0f2fe'); g.addColorStop(.35,s.color1); g.addColorStop(1,s.color2);
    ctx.fillStyle = g;
    poly([[0,-46],[17,20],[0,38],[-17,20]]);
    // Cockpit
    ctx.fillStyle = 'rgba(15,23,42,.75)'; poly([[0,-28],[8,5],[0,16],[-8,5]]);
    ctx.fillStyle = '#cffafe'; ctx.beginPath(); ctx.ellipse(0,-10,6.5,13,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#facc15'; ctx.fillRect(-11,34,7,9); ctx.fillRect(4,34,7,9);
  }
  if (player.ship === 'nova') {
    // Wide wings
    ctx.fillStyle = s.color2;
    poly([[-9,-8],[-55,5],[-33,24],[-15,18]]); poly([[9,-8],[55,5],[33,24],[15,18]]);
    ctx.fillStyle = 'rgba(192,132,252,.65)';
    poly([[-18,14],[-38,40],[-10,30]]); poly([[18,14],[38,40],[10,30]]);
    const g = ctx.createLinearGradient(0,-46,0,42);
    g.addColorStop(0,'#f5d0fe'); g.addColorStop(.4,s.color1); g.addColorStop(1,s.color2);
    ctx.fillStyle = g;
    poly([[0,-48],[16,-5],[12,30],[0,42],[-12,30],[-16,-5]]);
    ctx.fillStyle = '#e9d5ff'; ctx.beginPath(); ctx.ellipse(0,-17,8,15,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fef08a';
    ctx.beginPath(); ctx.arc(-11,35,5,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( 11,35,5,0,Math.PI*2); ctx.fill();
  }
  if (player.ship === 'titan') {
    ctx.fillStyle = s.color2;
    poly([[-18,-8],[-58,22],[-34,38],[-13,24]]); poly([[18,-8],[58,22],[34,38],[13,24]]);
    const g = ctx.createLinearGradient(0,-42,0,44);
    g.addColorStop(0,'#fed7aa'); g.addColorStop(.38,s.color1); g.addColorStop(1,s.color2);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(-20,-30,40,64,14); ctx.fill();
    ctx.fillStyle = '#7f1d1d'; poly([[0,-48],[17,-24],[-17,-24]]);
    ctx.fillStyle = '#ffedd5'; ctx.beginPath(); ctx.roundRect(-8,-17,16,22,7); ctx.fill();
    ctx.fillStyle = '#fde047'; ctx.fillRect(-16,32,9,13); ctx.fillRect(7,32,9,13);
  }
  ctx.restore();
}
function poly(pts) {
  ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
  for (let i=1; i<pts.length; i++) ctx.lineTo(pts[i][0],pts[i][1]);
  ctx.closePath(); ctx.fill();
}

// ── Enemies: flat colours, no shadowBlur ──────────
function drawEnemy(e) {
  ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.rot);
  const hp = Math.max(0, e.hp / e.maxHp);
  if (e.flash > 0) ctx.globalAlpha = .35 + .65 * (e.flash/8);

  if (e.type === 'scout') {
    ctx.fillStyle = e.flash > 0 ? '#fff' : '#991b1b';
    poly([[0,-24],[24,20],[0,10],[-24,20]]);
    ctx.fillStyle = '#fca5a5'; poly([[0,-12],[10,12],[0,6],[-10,12]]);
    ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(0,0,4.5,0,Math.PI*2); ctx.fill();
  }
  if (e.type === 'orb') {
    ctx.fillStyle = e.flash > 0 ? '#fff' : '#0e7490';
    ctx.beginPath(); ctx.arc(0,0,e.r,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = e.flash > 0 ? '#fff' : '#22d3ee';
    ctx.beginPath(); ctx.arc(-4,-4,e.r*.62,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#67e8f9'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0,0,e.r+6,8,Math.PI/5,0,Math.PI*2); ctx.stroke();
  }
  if (e.type === 'heavy') {
    ctx.fillStyle = e.flash > 0 ? '#fff' : '#7f1d1d';
    ctx.beginPath(); ctx.roundRect(-e.r,-e.r*.68,e.r*2,e.r*1.36,12); ctx.fill();
    ctx.fillStyle = e.flash > 0 ? '#fcd34d' : '#f97316';
    ctx.beginPath(); ctx.roundRect(-e.r*.58,-e.r*.44,e.r*1.16,e.r*.88,9); ctx.fill();
    ctx.fillStyle = '#fed7aa'; ctx.fillRect(-7,-e.r*.68,14,e.r*1.36);
  }
  if (e.type === 'blade') {
    ctx.fillStyle = e.flash > 0 ? '#fff' : '#581c87';
    poly([[0,-30],[13,-7],[30,0],[13,7],[0,30],[-13,7],[-30,0],[-13,-7]]);
    ctx.fillStyle = e.flash > 0 ? '#fff' : '#d8b4fe';
    ctx.beginPath(); ctx.arc(0,0,7.5,0,Math.PI*2); ctx.fill();
  }

  ctx.globalAlpha = 1; ctx.rotate(-e.rot);
  // HP bar
  ctx.fillStyle = 'rgba(15,23,42,.65)'; ctx.fillRect(-20, e.r+8, 40, 4);
  ctx.fillStyle = hp>.5 ? '#22c55e' : hp>.25 ? '#eab308' : '#ef4444';
  ctx.fillRect(-20, e.r+8, 40*hp, 4);
  ctx.restore();
}

// ── Boss ──────────────────────────────────────────
function drawBoss() {
  ctx.save(); ctx.translate(boss.x, boss.y);
  ctx.fillStyle = '#7f1d1d';
  poly([
    [-boss.w/2,-10],[-boss.w/2+38,-boss.h/2],[0,-boss.h/2+16],[boss.w/2-38,-boss.h/2],
    [boss.w/2,-10],[boss.w/2-34,boss.h/2],[0,boss.h/2-16],[-boss.w/2+34,boss.h/2]
  ]);
  const g = ctx.createLinearGradient(0,-boss.h/2,0,boss.h/2);
  g.addColorStop(0,'#fecaca'); g.addColorStop(.4,'#dc2626'); g.addColorStop(1,'#450a0a');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.roundRect(-boss.w*.28,-boss.h*.35,boss.w*.56,boss.h*.7,16); ctx.fill();
  ctx.fillStyle = '#fee2e2';
  ctx.beginPath(); ctx.roundRect(-20,-20,40,28,10); ctx.fill();
  // Pulsing cannon tips
  const a = .65 + .35 * Math.sin(Date.now()*.006);
  ctx.fillStyle = `rgba(250,204,21,${a})`;
  ctx.beginPath(); ctx.arc(-boss.w*.33,9,7,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( boss.w*.33,9,7,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

// ── Particles ──────────────────────────────────────
function drawParticles() {
  particles.forEach(p => {
    ctx.globalAlpha = Math.max(0, p.trail ? (p.life/p.max) * .4 : p.life/20);
    ctx.fillStyle   = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
  });
  ctx.globalAlpha = 1;
}

// ── Floating damage text ───────────────────────────
function drawFloats() {
  floats.forEach(f => {
    ctx.globalAlpha = Math.max(0, f.life / f.max);
    ctx.fillStyle   = f.color;
    ctx.font        = `bold ${11 + Math.round((1-f.life/f.max)*3)}px sans-serif`;
    ctx.textAlign   = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(f.text, f.x, f.y);
  });
  ctx.globalAlpha = 1;
}

// ── Announce text ──────────────────────────────────
function drawAnnounce() {
  if (!announce) return;
  announce.life--;
  if (announce.life <= 0) { announce = null; return; }
  const a = Math.min(1, announce.life/28) * Math.min(1, (announce.life/announce.max)*3);
  ctx.globalAlpha = a;
  ctx.fillStyle   = announce.color;
  ctx.font        = 'bold 28px sans-serif';
  ctx.textAlign   = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(announce.text, W/2, H/2);
  ctx.globalAlpha = 1;
}

// ── HUD update (DOM — only when changed) ────────────
let _lastHp = -1, _lastScore = '';
function updateHUD() {
  const pct = Math.max(0, player.hp / player.maxHp);
  if (_lastHp !== player.hp) {
    _lastHp = player.hp;
    const fill = document.getElementById('hpFill');
    fill.style.width = `${pct*100}%`;
    fill.style.background = pct>.5 ? 'linear-gradient(90deg,#22c55e,#86efac)' :
                            pct>.25? 'linear-gradient(90deg,#eab308,#fde047)' :
                                     'linear-gradient(90deg,#ef4444,#fb7185)';
    document.getElementById('hudHp').textContent = `${Math.max(0,Math.ceil(player.hp))}/${player.maxHp}`;
  }
  const comboStr = combo >= 3 ? ` · 🔥${combo}x` : '';
  const ns = `Score ${score} · Lv ${level} · +${runCoins}🪙${comboStr}`;
  if (ns !== _lastScore) { _lastScore = ns; document.getElementById('hudScore').textContent = ns; }
}

// ════════════════════════════════════════════
//  GAME LOOP
// ════════════════════════════════════════════
function loop() {
  requestAnimationFrame(loop);
  if (!playing && document.getElementById('endScreen').style.display !== 'flex') return;
  update();
  draw();
}

// ════════════════════════════════════════════
//  INPUT
// ════════════════════════════════════════════
addEventListener('keydown', e => { keys[e.key] = true;  if (e.key==='Escape') togglePause(); });
addEventListener('keyup',   e => { keys[e.key] = false; });

function setPtr(e) { const p = e.touches?e.touches[0]:e; targetX = p.clientX; targetY = p.clientY; }
canvas.addEventListener('touchstart', setPtr, { passive:false });
canvas.addEventListener('touchmove',  e => { e.preventDefault(); setPtr(e); }, { passive:false });
canvas.addEventListener('mousemove',  setPtr);
