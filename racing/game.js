'use strict';

// ── Sound Effects (Web Audio API) ─────────────────────────────────────────────
const SFX = (() => {
  let _ac, engOsc, engGain, engOsc2, engGain2;
  let lastMilestone = 0;
  function ac() {
    if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)();
    if (_ac.state === 'suspended') _ac.resume();
    return _ac;
  }
  function tone(freq, type, vol, dur, delay = 0) {
    try {
      const c = ac(), now = c.currentTime;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, now + delay);
      g.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
      o.connect(g); g.connect(c.destination);
      o.start(now + delay); o.stop(now + delay + dur + 0.05);
    } catch(e) {}
  }
  function noise(vol, dur, freq = 200) {
    try {
      const c = ac(), now = c.currentTime;
      const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq;
      g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      s.connect(f); f.connect(g); g.connect(c.destination);
      s.start(); s.stop(now + dur + 0.05);
    } catch(e) {}
  }
  return {
    // Mulai engine — buat oscillator persisten
    startEngine() {
      try {
        const c = ac();
        engGain  = c.createGain(); engGain.gain.value  = 0.07;
        engGain2 = c.createGain(); engGain2.gain.value = 0.04;
        engOsc   = c.createOscillator(); engOsc.type  = 'sawtooth'; engOsc.frequency.value = 55;
        engOsc2  = c.createOscillator(); engOsc2.type = 'square';   engOsc2.frequency.value = 82;
        // Low-pass biar terdengar mesin, bukan noise
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
        engOsc.connect(lp); engOsc2.connect(lp);
        lp.connect(engGain);  engGain.connect(c.destination);
        lp.connect(engGain2); engGain2.connect(c.destination);
        engOsc.start(); engOsc2.start();
      } catch(e) {}
    },
    // Update RPM engine berdasarkan kecepatan (dipanggil tiap frame)
    updateEngine(spd) {
      if (!engOsc) return;
      try {
        const c = ac(), now = c.currentTime;
        const rpm = 55 + spd * 22;
        engOsc.frequency.setTargetAtTime(rpm,      now, 0.1);
        engOsc2.frequency.setTargetAtTime(rpm * 1.5, now, 0.1);
        engGain.gain.setTargetAtTime(Math.min(0.09, 0.05 + spd * 0.007), now, 0.1);
      } catch(e) {}
    },
    // Stop engine
    stopEngine() {
      try { engOsc?.stop(); engOsc2?.stop(); } catch(e) {}
      engOsc = engOsc2 = null;
    },
    // Tabrakan
    crash() {
      this.stopEngine();
      noise(0.5, 0.6, 180);
      tone(120, 'sawtooth', 0.3, 0.5);
      tone(80,  'sawtooth', 0.25, 0.7, 0.1);
    },
    // Ding setiap 100 poin
    checkMilestone(score) {
      const m = Math.floor(score / 100);
      if (m > lastMilestone) {
        lastMilestone = m;
        tone(880, 'sine', 0.15, 0.1);
        tone(1100, 'sine', 0.1, 0.1, 0.1);
      }
    },
    resetMilestone() { lastMilestone = 0; },
  };
})();

// ── Canvas setup ──────────────────────────────────────────────────────────────
const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d');

let W, H;
function resize() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

// ── Constants ─────────────────────────────────────────────────────────────────
const LANE_COUNT = 5;
const ROAD_W     = () => Math.min(W * 0.88, 420);
const ROAD_X     = () => (W - ROAD_W()) / 2;
const LANE_W     = () => ROAD_W() / LANE_COUNT;
const PLAYER_W   = 36;
const PLAYER_H   = 64;
const OBSTACLE_W = 36;
const OBSTACLE_H = 64;

// ── Day/Night cycle ───────────────────────────────────────────────────────────
// dayTime: 0.0 = tengah malam, 0.5 = tengah hari, 1.0 = tengah malam lagi
// Satu siklus = 3600 frame (~60 detik di 60fps) → cukup santai
const DAY_CYCLE = 3600;
let dayTick = DAY_CYCLE * 0.35; // mulai pagi

function getDayTime() { return dayTick / DAY_CYCLE; }  // 0..1

// nightness: 0 = siang penuh, 1 = malam penuh
function getNight() {
  const t = getDayTime();
  // Siang: t=0.5 (night=0), Malam: t=0.0/1.0 (night=1)
  // Gunakan cosinus agar transisi halus
  return Math.pow((Math.cos(t * Math.PI * 2) * -0.5 + 0.5), 1.4);
}

// Interpolasi warna siang/malam
function lerpColor(day, night, t) {
  const d = hexToRgb(day), n = hexToRgb(night);
  const r = Math.round(d.r + (n.r - d.r) * t);
  const g = Math.round(d.g + (n.g - d.g) * t);
  const b = Math.round(d.b + (n.b - d.b) * t);
  return `rgb(${r},${g},${b})`;
}
function hexToRgb(hex) {
  const h = hex.replace('#','');
  return {
    r: parseInt(h.slice(0,2),16),
    g: parseInt(h.slice(2,4),16),
    b: parseInt(h.slice(4,6),16),
  };
}

// ── Game state ────────────────────────────────────────────────────────────────
let state = 'idle';
let score, bestScore = 0;
let distance, baseSpeed, speed;
let player, obstacles, markings;
let frameId;

// ── Joystick ──────────────────────────────────────────────────────────────────
const joystick = { active:false, baseX:0, baseY:0, x:0, y:0, maxR:50 };

const jBase = document.getElementById('joystick-base');
const jKnob = document.getElementById('joystick-knob');

function jStart(e) {
  const t = e.touches ? e.touches[0] : e;
  const rect = jBase.getBoundingClientRect();
  joystick.active = true;
  joystick.baseX  = rect.left + rect.width / 2;
  joystick.baseY  = rect.top  + rect.height / 2;
  jKnob.classList.add('active');
  jMove(e);
}
function jMove(e) {
  if (!joystick.active) return;
  const t = e.touches ? e.touches[0] : e;
  let dx = t.clientX - joystick.baseX;
  let dy = t.clientY - joystick.baseY;
  const dist = Math.sqrt(dx*dx + dy*dy);
  if (dist > joystick.maxR) { dx = dx/dist*joystick.maxR; dy = dy/dist*joystick.maxR; }
  joystick.x = dx / joystick.maxR;
  joystick.y = dy / joystick.maxR;
  jKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}
function jEnd() {
  joystick.active = false; joystick.x = 0; joystick.y = 0;
  jKnob.style.transform = 'translate(-50%, -50%)';
  jKnob.classList.remove('active');
}
jBase.addEventListener('touchstart', jStart, { passive:false });
jBase.addEventListener('touchmove',  jMove,  { passive:false });
jBase.addEventListener('touchend',   jEnd);
jBase.addEventListener('mousedown',  jStart);
window.addEventListener('mousemove', jMove);
window.addEventListener('mouseup',   jEnd);

// ── Init game ─────────────────────────────────────────────────────────────────
function initGame() {
  score = 0; distance = 0; baseSpeed = 2; speed = baseSpeed;
  SFX.resetMilestone();
  SFX.stopEngine();
  SFX.startEngine();
  dayTick = DAY_CYCLE * 0.35;

  const rx = ROAD_X(), rw = ROAD_W();
  player = {
    x: rx + rw / 2, y: H - 160,
    vx: 0, vy: 0,
    w: PLAYER_W, h: PLAYER_H,
    color: '#e84545', tilt: 0,
  };
  obstacles = []; markings = [];
  for (let i = 0; i < 20; i++) markings.push({ y: i * 60 });
  spawnObstacle(); spawnObstacle();
}

// ── Obstacle spawning ─────────────────────────────────────────────────────────
const OBS_COLORS = ['#4595e8','#45e8a0','#e8c845','#c445e8','#45e8e8','#e8954a'];

function spawnObstacle() {
  const rx = ROAD_X(), lw = LANE_W();

  // Pilih lane yang tidak ada mobil di dekat spawn area
  const usedLanes = obstacles
    .filter(o => o.y < 0)
    .map(o => o.lane);

  const freeLanes = [];
  for (let i = 0; i < LANE_COUNT; i++) {
    if (!usedLanes.includes(i)) freeLanes.push(i);
  }
  if (freeLanes.length === 0) return; // semua lane penuh, skip

  const lane = freeLanes[Math.floor(Math.random() * freeLanes.length)];
  const col  = OBS_COLORS[Math.floor(Math.random() * OBS_COLORS.length)];

  obstacles.push({
    x: rx + lane * lw + lw / 2,
    y: -OBSTACLE_H - 100 - Math.random() * 300,
    w: OBSTACLE_W, h: OBSTACLE_H,
    speed: speed * (0.3 + Math.random() * 0.3),
    color: col, lane,
  });
}

// ── Collision ─────────────────────────────────────────────────────────────────
function rectsOverlap(a, b) {
  return !(
    a.x + a.w/2 < b.x - b.w/2 || a.x - a.w/2 > b.x + b.w/2 ||
    a.y + a.h/2 < b.y - b.h/2 || a.y - a.h/2 > b.y + b.h/2
  );
}

// ── Update ────────────────────────────────────────────────────────────────────
function update() {
  const rx = ROAD_X(), rw = ROAD_W();

  // Day/night tick
  dayTick = (dayTick + 1) % DAY_CYCLE;

  speed = baseSpeed + distance / 2000;
  speed = Math.min(speed, 4.11); // 250 km/h max

  const accel = 1.7, friction = 0.77, maxV = 7;
  player.vx += joystick.x * accel;
  player.vy += joystick.y * accel * 0.5;
  player.vx *= friction; player.vy *= friction;
  player.vx = Math.max(-maxV, Math.min(maxV, player.vx));
  player.vy = Math.max(-maxV, Math.min(maxV, player.vy));
  player.x += player.vx; player.y += player.vy;
  player.tilt = player.vx * 0.04;
  player.x = Math.max(rx + player.w/2, Math.min(rx + rw - player.w/2, player.x));
  player.y = Math.max(H * 0.1, Math.min(H - player.h/2 - 10, player.y));

  markings.forEach(m => { m.y += speed; if (m.y > H + 30) m.y -= 20 * 60; });
  obstacles.forEach(obs => { obs.y += speed * 1.1; });
  obstacles = obstacles.filter(obs => obs.y < H + OBSTACLE_H + 50);
  if (obstacles.length < 3) spawnObstacle();

  for (const obs of obstacles) {
    const hitA = { x:player.x, y:player.y, w:player.w*0.75, h:player.h*0.8 };
    const hitB = { x:obs.x,    y:obs.y,    w:obs.w*0.75,    h:obs.h*0.8 };
    if (rectsOverlap(hitA, hitB)) { triggerGameOver(); return; }
  }

  distance += speed;
  score = Math.floor(distance / 10);
  document.getElementById('hud-score').textContent = score;
  document.getElementById('hud-speed').textContent = `${Math.floor(80 + speed * 18)} km/h`;
  SFX.updateEngine(speed);
  SFX.checkMilestone(score);
}

// ── Draw car ──────────────────────────────────────────────────────────────────
function drawCar(x, y, w, h, color, tilt, isPlayer, nightness) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);

  // Body
  ctx.beginPath();
  ctx.roundRect(-w/2, -h/2, w, h, 6);
  ctx.fillStyle = color;
  ctx.fill();

  // Roof
  const roofW = w*0.65, roofH = h*0.38;
  ctx.beginPath();
  ctx.roundRect(-roofW/2, -h/2 + h*0.2, roofW, roofH, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fill();

  // Wheels — warna abu terang supaya kontras dengan aspal
  const wheelW = 8, wheelH = 14;
  const wheelPositions = [
    [-w/2 - 2, -h/2 + 12],
    [ w/2 - 6,  -h/2 + 12],
    [-w/2 - 2,   h/2 - 26],
    [ w/2 - 6,   h/2 - 26],
  ];
  wheelPositions.forEach(([wx, wy]) => {
    // Rim abu terang
    ctx.beginPath();
    ctx.roundRect(wx, wy, wheelW, wheelH, 3);
    ctx.fillStyle = '#555';
    ctx.fill();
    // Ban hitam (tipis di tengah)
    ctx.beginPath();
    ctx.roundRect(wx+1.5, wy+1.5, wheelW-3, wheelH-3, 2);
    ctx.fillStyle = '#1a1a1a';
    ctx.fill();
    // Pelek/spoke
    ctx.beginPath();
    ctx.fillStyle = '#888';
    ctx.fillRect(wx + wheelW/2 - 1, wy + 2, 2, wheelH - 4);
    ctx.fillRect(wx + 2, wy + wheelH/2 - 1, wheelW - 4, 2);
  });

  // Headlights / taillights
  if (isPlayer) {
    // Headlight (depan/atas) — nyala malam
    const hlAlpha = 0.5 + nightness * 0.5;
    const hlColor = `rgba(255,240,180,${hlAlpha})`;
    const hlGlow  = nightness > 0.3;
    [-w/2 + 5, w/2 - 5].forEach(lx => {
      if (hlGlow) {
        ctx.beginPath();
        ctx.arc(lx, -h/2 + 6, 10 + nightness * 8, 0, Math.PI*2);
        ctx.fillStyle = `rgba(255,240,120,${nightness * 0.25})`;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.ellipse(lx, -h/2 + 6, 5, 3, 0, 0, Math.PI*2);
      ctx.fillStyle = hlColor;
      ctx.fill();
    });
    // Tail light (belakang/bawah)
    [-w/2 + 5, w/2 - 5].forEach(lx => {
      ctx.beginPath();
      ctx.ellipse(lx, h/2 - 8, 4, 2.5, 0, 0, Math.PI*2);
      ctx.fillStyle = `rgba(255,60,60,0.9)`;
      ctx.fill();
    });
  } else {
    // Obstacle taillights (merah, makin terang malam)
    const tlAlpha = 0.7 + nightness * 0.3;
    if (nightness > 0.3) {
      [-w/2 + 5, w/2 - 5].forEach(lx => {
        ctx.beginPath();
        ctx.arc(lx, h/2 - 8, 8 + nightness * 6, 0, Math.PI*2);
        ctx.fillStyle = `rgba(255,50,50,${nightness * 0.2})`;
        ctx.fill();
      });
    }
    [-w/2 + 5, w/2 - 5].forEach(lx => {
      ctx.beginPath();
      ctx.ellipse(lx, h/2 - 8, 4, 2.5, 0, 0, Math.PI*2);
      ctx.fillStyle = `rgba(255,60,60,${tlAlpha})`;
      ctx.fill();
    });
  }

  // Shine
  ctx.beginPath();
  ctx.roundRect(-w/2 + 3, -h/2 + 3, w/2 - 2, h*0.2, 4);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fill();

  ctx.restore();
}

// ── Draw road ─────────────────────────────────────────────────────────────────
function drawRoad(night) {
  const rx = ROAD_X(), rw = ROAD_W(), lw = LANE_W();

  // Warna aspal: siang abu cerah, malam abu gelap
  const roadColor  = lerpColor('#7a7a80', '#28282e', night);
  const grassColor = lerpColor('#2d4a1e', '#0e1a08', night);

  // Rumput / pinggir
  ctx.fillStyle = grassColor;
  ctx.fillRect(0, 0, rx, H);
  ctx.fillRect(rx + rw, 0, W - rx - rw, H);

  // Aspal abu cerah
  ctx.fillStyle = roadColor;
  ctx.fillRect(rx, 0, rw, H);

  // Garis pinggir kuning
  ctx.strokeStyle = lerpColor('#e8c845', '#ffe066', night);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(rx, 0); ctx.lineTo(rx, H);
  ctx.moveTo(rx + rw, 0); ctx.lineTo(rx + rw, H);
  ctx.stroke();

  // Lane markings putih
  const markAlpha = 0.35 + night * 0.25;
  ctx.strokeStyle = `rgba(255,255,255,${markAlpha})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([40, 30]);
  for (let i = 1; i < LANE_COUNT; i++) {
    const lx = rx + i * lw;
    markings.forEach(m => {
      ctx.beginPath();
      ctx.moveTo(lx, m.y - 20);
      ctx.lineTo(lx, m.y + 20);
      ctx.stroke();
    });
  }
  ctx.setLineDash([]);
}

// ── Draw sky / background ─────────────────────────────────────────────────────
function drawBackground(night) {
  // Langit: biru cerah siang, biru gelap/hitam malam
  const skyTop    = lerpColor('#87ceeb', '#05050f', night);
  const skyBottom = lerpColor('#c8e8ff', '#0d0d1e', night);
  const grad = ctx.createLinearGradient(0, 0, 0, H * 0.6);
  grad.addColorStop(0, skyTop);
  grad.addColorStop(1, skyBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Bintang saat malam
  if (night > 0.4) {
    const starAlpha = (night - 0.4) / 0.6;
    ctx.fillStyle = `rgba(255,255,255,${starAlpha * 0.9})`;
    // Gambar bintang fixed (seed dari index supaya tidak gerak)
    for (let i = 0; i < 60; i++) {
      const sx = ((i * 137 + 23) % W);
      const sy = ((i * 91  + 17) % (H * 0.55));
      const sr = 0.5 + (i % 3) * 0.5;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI*2);
      ctx.fill();
    }
  }

  // Matahari / bulan
  const celestialY = H * 0.15;
  const celestialX = W * 0.8;
  if (night < 0.6) {
    // Matahari
    const sunAlpha = 1 - night * 1.5;
    if (sunAlpha > 0) {
      const sunGrad = ctx.createRadialGradient(celestialX, celestialY, 0, celestialX, celestialY, 40);
      sunGrad.addColorStop(0, `rgba(255,240,100,${sunAlpha})`);
      sunGrad.addColorStop(0.5, `rgba(255,200,50,${sunAlpha * 0.6})`);
      sunGrad.addColorStop(1, `rgba(255,150,0,0)`);
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(celestialX, celestialY, 40, 0, Math.PI*2);
      ctx.fill();
    }
  }
  if (night > 0.5) {
    // Bulan
    const moonAlpha = (night - 0.5) * 2;
    ctx.fillStyle = `rgba(220,220,200,${moonAlpha * 0.9})`;
    ctx.beginPath();
    ctx.arc(celestialX - 60, celestialY + 10, 22, 0, Math.PI*2);
    ctx.fill();
    // Shadow bulan sabit
    ctx.fillStyle = lerpColor('#05050f', '#05050f', 1);
    ctx.beginPath();
    ctx.arc(celestialX - 52, celestialY + 8, 18, 0, Math.PI*2);
    ctx.fill();
  }
}

// ── HUD sky tint ──────────────────────────────────────────────────────────────
function updateHudColor(night) {
  const hud = document.getElementById('hud-score');
  hud.style.color = night > 0.5 ? '#ffe066' : '#fff';
}

// ── Main draw ─────────────────────────────────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, W, H);
  const night = getNight();

  drawBackground(night);
  drawRoad(night);

  // Night overlay on road area (gelap sedikit)
  if (night > 0.1) {
    ctx.fillStyle = `rgba(0,0,10,${night * 0.45})`;
    ctx.fillRect(0, 0, W, H);
  }

  obstacles.forEach(obs => drawCar(obs.x, obs.y, obs.w, obs.h, obs.color, 0, false, night));
  drawCar(player.x, player.y, player.w, player.h, player.color, player.tilt, true, night);

  // Speed lines
  if (speed > 7) {
    const alpha = Math.min((speed - 7) / 6, 0.25);
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const lx = ROAD_X() + Math.random() * ROAD_W();
      const ly = Math.random() * H;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly + 30 + Math.random()*30); ctx.stroke();
    }
  }

  updateHudColor(night);
}

// ── Game loop ─────────────────────────────────────────────────────────────────
function loop() {
  if (state !== 'playing') return;
  update(); draw();
  frameId = requestAnimationFrame(loop);
}

// ── Game over ─────────────────────────────────────────────────────────────────
function triggerGameOver() {
  state = 'dead';
  SFX.crash();
  cancelAnimationFrame(frameId);
  ctx.fillStyle = 'rgba(232,69,69,0.45)';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.arc(player.x+(Math.random()-.5)*60, player.y+(Math.random()-.5)*60, 20+Math.random()*40, 0, Math.PI*2);
    ctx.fillStyle = `rgba(255,${Math.floor(Math.random()*150)},0,0.7)`;
    ctx.fill();
  }
  if (score > bestScore) bestScore = score;
  setTimeout(() => {
    document.getElementById('go-score').textContent = score;
    document.getElementById('go-best').textContent =
      score >= bestScore ? '🏆 Rekor Baru!' : `Rekor: ${bestScore}`;
    document.getElementById('overlay-gameover').classList.remove('hidden');
  }, 600);
}

let paused = false;

function togglePause() {
  if (state !== 'playing' && state !== 'paused') return;
  paused = !paused;
  state  = paused ? 'paused' : 'playing';
  document.getElementById('overlay-pause').classList.toggle('hidden', !paused);
  document.getElementById('pause-btn').textContent = paused ? '▶' : '⏸';
  if (!paused) { cancelAnimationFrame(frameId); loop(); }
}

// ── Start ─────────────────────────────────────────────────────────────────────
function startGame() {
  state = 'playing';
  document.getElementById('overlay-start').classList.add('hidden');
  document.getElementById('overlay-gameover').classList.add('hidden');
  cancelAnimationFrame(frameId);
  initGame(); loop();
}

document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-restart').addEventListener('click', startGame);
document.getElementById('joystick-zone').addEventListener('touchmove', e => e.preventDefault(), { passive:false });
