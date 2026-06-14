'use strict';
/* ══════════════════════════════════════════════════
   PAC-MAN — RaffzGames
   Procedural maze (beda tiap kalah) · Web Audio SFX
   Mobile-first · Hub compatible (postMessage)
══════════════════════════════════════════════════ */

// ── Cell types ───────────────────────────────────
const WALL=0, DOT=1, POWER=2, EMPTY=3, DOOR=4;

// ── Maze dimensions ──────────────────────────────
const COLS=21, ROWS=23;

// ── Ghost house bounds ───────────────────────────
// Outer walls:  row GH_T, GH_B  /  col GH_L, GH_R
// Interior:     rows GH_T+1..GH_B-1  ×  cols GH_L+1..GH_R-1
// Door:         g[GH_T][GH_DC] = DOOR
const GH_T=9, GH_B=13, GH_L=8, GH_R=12, GH_DC=10;

// ── Tunnel row (wraps col 0 ↔ col 20) ───────────
const TR=11;

// ── Pac-man start ────────────────────────────────
const PR=17, PC=10;

// ── Ghost data ───────────────────────────────────
const G_COLORS=['#FF3333','#FFB8FF','#00FFFF','#FFB852'];
// Scatter corners [row,col] per ghost id
const G_CORNER=[[0,COLS-1],[0,0],[ROWS-1,COLS-1],[ROWS-1,0]];
// Initial positions
const G_SR=[GH_T-1, GH_T+2, GH_T+2, GH_T+2]; // rows
const G_SC=[GH_DC,  GH_DC-1, GH_DC, GH_DC+1]; // cols
const G_M0=['chase','house','house','house'];   // modes

// ── Timing (ms) ──────────────────────────────────
const PAC_TICK=155, G_TICK=230, G_FRIGHT=400;
const ENERGY_DUR=8000, GH_REL=3500;
const DEATH_DUR=1500, CLEAR_DUR=2000, READY_DUR=1400;

// ════════════════════════════════════════════════
//  SOUND EFFECTS  (Web Audio API)
// ════════════════════════════════════════════════
const SFX=(()=>{
  let _ac, flip=0;
  function ac(){
    if(!_ac) _ac=new(window.AudioContext||window.webkitAudioContext)();
    if(_ac.state==='suspended') _ac.resume();
    return _ac;
  }
  function tone(f,type,vol,dur,delay=0){
    try{
      const c=ac(),now=c.currentTime;
      const o=c.createOscillator(),g=c.createGain();
      o.type=type; o.frequency.value=f;
      g.gain.setValueAtTime(vol,now+delay);
      g.gain.exponentialRampToValueAtTime(0.001,now+delay+dur);
      o.connect(g); g.connect(c.destination);
      o.start(now+delay); o.stop(now+delay+dur+0.05);
    }catch(e){}
  }
  function noise(vol,dur,freq=180){
    try{
      const c=ac(),now=c.currentTime;
      const len=Math.ceil(c.sampleRate*dur);
      const buf=c.createBuffer(1,len,c.sampleRate);
      const d=buf.getChannelData(0);
      for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
      const s=c.createBufferSource(),filt=c.createBiquadFilter(),g=c.createGain();
      s.buffer=buf; filt.type='bandpass'; filt.frequency.value=freq;
      g.gain.setValueAtTime(vol,now);
      g.gain.exponentialRampToValueAtTime(0.001,now+dur);
      s.connect(filt); filt.connect(g); g.connect(c.destination);
      s.start(); s.stop(now+dur+0.05);
    }catch(e){}
  }
  return{
    // Alternating chomp
    chomp(){ tone(flip?220:260,'square',0.09,0.04); flip=1-flip; },
    // Eat ghost: rising arpeggio
    ghost(){ [500,650,800,1000].forEach((f,i)=>tone(f,'square',0.17,0.07,i*0.05)); },
    // Power pellet: bass swell
    power(){ [140,185,230].forEach((f,i)=>tone(f,'sawtooth',0.14,0.13,i*0.08)); },
    // Death: descending slide
    death(){
      for(let i=0;i<14;i++) tone(500-i*25,'sawtooth',0.12,0.08,i*0.07);
      noise(0.07,0.4,100);
    },
    // Level clear: ascending fanfare
    win(){ [523,659,784,1047,1319].forEach((f,i)=>tone(f,'sine',0.18,0.18,i*0.09)); },
    // Start jingle: Pac-Man intro approximation
    start(){
      [[587,0],[440,.15],[587,.3],[698,.45],[698,.55],[784,.65],[698,.8],[784,.95]]
        .forEach(([f,t])=>tone(f,'square',0.12,0.12,t));
    },
  };
})();

// ════════════════════════════════════════════════
//  MAZE GENERATOR  (procedural, beda tiap game)
// ════════════════════════════════════════════════
function inGH(r,c){ return r>=GH_T&&r<=GH_B&&c>=GH_L&&c<=GH_R; }
function inGHInt(r,c){ return r>GH_T&&r<GH_B&&c>GH_L&&c<GH_R; }

function generateMaze(){
  const g=Array.from({length:ROWS},()=>new Array(COLS).fill(WALL));

  // ── 1. DFS on left half (odd cells, col 1–9) ──
  const vis=new Uint8Array(ROWS*COLS);
  const stk=[[1,1]];
  vis[1*COLS+1]=1; g[1][1]=DOT;
  const D4=[[-2,0],[2,0],[0,2],[0,-2]];

  while(stk.length){
    const [r,c]=stk[stk.length-1];
    const nbrs=D4.map(([dr,dc])=>[r+dr,c+dc,r+dr/2,c+dc/2])
      .filter(([nr,nc,wr,wc])=>
        nr>=1&&nr<ROWS-1&&nc>=1&&nc<=9&&
        !vis[nr*COLS+nc]&&!inGH(nr,nc)&&!inGH(wr,wc)
      );
    if(nbrs.length){
      const idx=Math.floor(Math.random()*nbrs.length);
      const [nr,nc,wr,wc]=nbrs[idx];
      vis[nr*COLS+nc]=1;
      g[wr][wc]=DOT; g[nr][nc]=DOT;
      stk.push([nr,nc]);
    } else stk.pop();
  }

  // ── 2. Extra loops (~20%) ─────────────────────
  for(let r=1;r<ROWS-1;r++){
    for(let c=2;c<=8;c++){
      if(g[r][c]!==WALL||inGH(r,c)) continue;
      const lr=g[r][c-1]!==WALL, rr=g[r][c+1]!==WALL;
      const ur=r>0&&g[r-1][c]!==WALL, dr2=r<ROWS-1&&g[r+1][c]!==WALL;
      if((lr&&rr||ur&&dr2)&&Math.random()<0.22) g[r][c]=DOT;
    }
  }

  // ── 3. Center column connectivity ─────────────
  for(let r=1;r<ROWS-1;r++){
    if(!inGH(r,10)&&g[r][9]===DOT&&Math.random()<0.65) g[r][10]=DOT;
  }
  if(g[1][9]===DOT)      g[1][10]=DOT;
  if(g[ROWS-2][9]===DOT) g[ROWS-2][10]=DOT;

  // ── 4. Mirror left → right ────────────────────
  for(let r=0;r<ROWS;r++)
    for(let c=1;c<=9;c++)
      if(!inGH(r,COLS-1-c)) g[r][COLS-1-c]=g[r][c];

  // ── 5. Ghost house ────────────────────────────
  // Outer walls
  for(let r=GH_T;r<=GH_B;r++){ g[r][GH_L]=WALL; g[r][GH_R]=WALL; }
  for(let c=GH_L;c<=GH_R;c++){ g[GH_T][c]=WALL; g[GH_B][c]=WALL; }
  // Interior (ghost spawn zone)
  for(let r=GH_T+1;r<=GH_B-1;r++)
    for(let c=GH_L+1;c<=GH_R-1;c++) g[r][c]=EMPTY;
  // Door
  g[GH_T][GH_DC]=DOOR;

  // ── 6. Guaranteed area above ghost house door ─
  // Force open a vertical corridor from door upward
  for(let r=GH_T-3;r<GH_T;r++) if(r>=1) g[r][GH_DC]=EMPTY;
  // Open col 9 & 11 at GH_T-2 to anchor the corridor
  const anch=GH_T-2; // row 7
  if(g[anch][9]===WALL) g[anch][9]=DOT;
  if(g[anch][11]===WALL) g[anch][11]=DOT;

  // ── 7. Tunnel row ─────────────────────────────
  for(let c=0;c<GH_L;c++)    g[TR][c]=EMPTY;
  for(let c=GH_R+1;c<COLS;c++) g[TR][c]=EMPTY;
  // Vertical connections at tunnel corners
  [TR-1,TR+1].forEach(r=>{
    if(r>=0&&r<ROWS){
      if(!inGH(r,GH_L-1)&&g[r][GH_L-1]===WALL) g[r][GH_L-1]=DOT; // col 7
      const mc=COLS-1-(GH_L-1); // col 13
      if(!inGH(r,mc)&&g[r][mc]===WALL) g[r][mc]=DOT;
    }
  });

  // ── 8. Pac-man start area (clear of dots) ─────
  [[PR,PC],[PR,PC-1],[PR,PC+1],[PR-1,PC],[PR+1,PC],
   [PR,PC-2],[PR,PC+2],[PR-2,PC]].forEach(([r,c])=>{
    if(r>=0&&r<ROWS&&c>=0&&c<COLS&&!inGH(r,c)) g[r][c]=EMPTY;
  });

  // ── 9. Power pellets ──────────────────────────
  [[1,1],[1,COLS-2],[ROWS-2,1],[ROWS-2,COLS-2],
   [TR-1,2],[TR-1,COLS-3]].forEach(([r,c])=>{
    if(g[r][c]===DOT) g[r][c]=POWER;
  });
  // Two more random power pellets for variety
  let placed=0;
  for(let attempts=0;attempts<200&&placed<2;attempts++){
    const r=1+Math.floor(Math.random()*(ROWS-2));
    const c=1+Math.floor(Math.random()*(COLS-2));
    if(g[r][c]===DOT&&Math.abs(r-PR)>4&&Math.abs(c-PC)>4){
      g[r][c]=POWER; placed++;
    }
  }

  // ── 10. Hard borders ──────────────────────────
  for(let c=0;c<COLS;c++){ g[0][c]=WALL; g[ROWS-1][c]=WALL; }
  for(let r=0;r<ROWS;r++){ g[r][0]=WALL; g[r][COLS-1]=WALL; }
  // Restore tunnel exits
  g[TR][0]=EMPTY; g[TR][COLS-1]=EMPTY;

  return g;
}

// ════════════════════════════════════════════════
//  CANVAS
// ════════════════════════════════════════════════
const canvas=document.getElementById('canvas');
const ctx=canvas.getContext('2d');
let CELL=16;

let wallCache=document.createElement('canvas');
let wallCtx=wallCache.getContext('2d');
let resizeQueued=false;

function getViewportSize(){
  const vv=window.visualViewport;
  return {
    w:Math.floor(vv?.width||window.innerWidth||document.documentElement.clientWidth||320),
    h:Math.floor(vv?.height||window.innerHeight||document.documentElement.clientHeight||560)
  };
}

function resize(){
  const hud=document.getElementById('hud');
  const dpad=document.getElementById('dpad');
  const hudH=hud?.offsetHeight||44;
  const dpadH=dpad?.offsetHeight||134;
  const vp=getViewportSize();
  const maxW=Math.min(vp.w,520);
  const maxH=Math.max(260,vp.h-hudH-dpadH-8);
  CELL=Math.max(10,Math.floor(Math.min(maxW/COLS,maxH/ROWS)));
  canvas.width=COLS*CELL;
  canvas.height=ROWS*CELL;
  buildWallCache();
}

function queueResize(){
  if(resizeQueued) return;
  resizeQueued=true;
  requestAnimationFrame(()=>{
    resizeQueued=false;
    resize();
  });
}

// ════════════════════════════════════════════════
//  GAME STATE
// ════════════════════════════════════════════════
let maze, dotsLeft;
let score=0, hi=+localStorage.getItem('pmHi')||0;
let lives=3, mapNo=1;
// States: idle | ready | playing | dying | gameover | cleared
let gs='idle';
let energized=false, energyTimer=0, stateTimer=0;
let ghostRelTimer=0, pacTimer=0, chompTimer=0;
let pac, ghosts;

function mkPac(){
  return{r:PR,c:PC,dr:0,dc:0,ndr:0,ndc:0,animT:0};
}
function mkGhost(id){
  return{
    id, r:G_SR[id], c:G_SC[id],
    dr:-1, dc:0,
    mode:G_M0[id],
    frightened:false, dead:false,
    moveTimer:id*55,
  };
}

// ════════════════════════════════════════════════
//  BFS PATHFINDING
// ════════════════════════════════════════════════
function bfsNext(sr,sc,tr,tc,canDoor){
  if(sr===tr&&sc===tc) return null;
  const vis=new Uint8Array(ROWS*COLS);
  vis[sr*COLS+sc]=1;
  // Queue entries: [r,c,firstR,firstC]
  const q=[[sr,sc,-1,-1]]; let qi=0;
  while(qi<q.length){
    const [r,c,fr,fc]=q[qi++];
    for(const[dr,dc]of[[-1,0],[1,0],[0,-1],[0,1]]){
      const nr=r+dr, nc=c+dc;
      if(nr<0||nr>=ROWS||nc<0||nc>=COLS) continue;
      const key=nr*COLS+nc;
      if(vis[key]) continue; vis[key]=1;
      const cell=maze[nr][nc];
      if(cell===WALL) continue;
      if(cell===DOOR&&!canDoor) continue;
      if(inGHInt(nr,nc)&&!canDoor) continue;
      const nfr=fr<0?nr:fr, nfc=fc<0?nc:fc;
      if(nr===tr&&nc===tc) return{r:nfr,c:nfc};
      q.push([nr,nc,nfr,nfc]);
    }
  }
  return null;
}

function rndMove(ghost,canDoor){
  const valid=[[-1,0],[1,0],[0,-1],[0,1]].filter(([dr,dc])=>{
    const nr=ghost.r+dr, nc=ghost.c+dc;
    if(nr<0||nr>=ROWS||nc<0||nc>=COLS) return false;
    const cell=maze[nr][nc];
    if(cell===WALL) return false;
    if(cell===DOOR&&!canDoor) return false;
    if(inGHInt(nr,nc)&&!canDoor) return false;
    return true;
  });
  if(!valid.length) return;
  const[dr,dc]=valid[Math.floor(Math.random()*valid.length)];
  ghost.r+=dr; ghost.c+=dc; ghost.dr=dr; ghost.dc=dc;
}

// ════════════════════════════════════════════════
//  UPDATE
// ════════════════════════════════════════════════
function update(dt){
  if(gs==='ready'){
    stateTimer-=dt;
    if(stateTimer<=0) gs='playing';

  } else if(gs==='playing'){
    // Energy countdown
    if(energized){
      energyTimer-=dt;
      if(energyTimer<=0){ energized=false; ghosts.forEach(gh=>gh.frightened=false); }
    }
    // Ghost house release
    ghostRelTimer-=dt;
    if(ghostRelTimer<=0){
      ghostRelTimer=GH_REL;
      const hg=ghosts.find(gh=>gh.mode==='house');
      if(hg) hg.mode='exiting';
    }
    movePac(dt);
    if(gs==='playing') moveGhosts(dt);

  } else if(gs==='dying'){
    stateTimer-=dt;
    if(stateTimer<=0){
      lives--;
      updateHUD();
      if(lives<=0){
        gs='gameover';
        showOv('GAME OVER',`Skor akhir: ${score}`,'MAIN LAGI');
      } else {
        resetPositions();
        gs='ready'; stateTimer=READY_DUR;
      }
    }

  } else if(gs==='cleared'){
    stateTimer-=dt;
    if(stateTimer<=0){
      mapNo++;
      initMaze(false); // new maze, keep score & lives
      gs='ready'; stateTimer=READY_DUR;
      SFX.start();
    }
  }
}

// ── Pac-man movement ─────────────────────────────
function movePac(dt){
  pacTimer+=dt; chompTimer+=dt;
  if(pacTimer<PAC_TICK) return;
  pacTimer-=PAC_TICK;
  pac.animT++;

  // Apply desired direction if walkable
  if(pac.ndr!==0||pac.ndc!==0){
    if(canPac(pac.r+pac.ndr, pac.c+pac.ndc)){
      pac.dr=pac.ndr; pac.dc=pac.ndc;
    }
  }

  if(pac.dr===0&&pac.dc===0) return;

  let nr=pac.r+pac.dr, nc=pac.c+pac.dc;
  // Tunnel wrap
  if(nc<0) nc=COLS-1;
  else if(nc>=COLS) nc=0;
  if(!canPac(nr,nc)) return;

  pac.r=nr; pac.c=nc;

  const cell=maze[nr][nc];
  if(cell===DOT){
    maze[nr][nc]=EMPTY; score+=10; dotsLeft--;
    if(chompTimer>100){ SFX.chomp(); chompTimer=0; }
    if(dotsLeft<=0){ SFX.win(); gs='cleared'; stateTimer=CLEAR_DUR; return; }
  } else if(cell===POWER){
    maze[nr][nc]=EMPTY; score+=50; dotsLeft--;
    energized=true; energyTimer=ENERGY_DUR;
    ghosts.forEach(gh=>{ if(!gh.dead&&gh.mode!=='house') gh.frightened=true; });
    SFX.power();
    if(dotsLeft<=0){ SFX.win(); gs='cleared'; stateTimer=CLEAR_DUR; return; }
  }
  updateHUD();
  checkCollision();
}

function canPac(r,c){
  if(r<0||r>=ROWS||c<0||c>=COLS) return false;
  const v=maze[r][c];
  return v!==WALL && v!==DOOR;
}

function checkCollision(){
  for(const gh of ghosts){
    if(gh.r!==pac.r||gh.c!==pac.c||gh.mode==='house') continue;
    if(gh.frightened&&!gh.dead){
      gh.dead=true; gh.frightened=false; gh.mode='dead';
      const n=ghosts.filter(g=>g.dead).length;
      score+=200*Math.pow(2,n-1); updateHUD();
      SFX.ghost();
    } else if(!gh.dead){
      SFX.death(); gs='dying'; stateTimer=DEATH_DUR; return;
    }
  }
}

// ── Ghost movement ───────────────────────────────
function moveGhosts(dt){
  for(const gh of ghosts){
    if(gh.mode==='house') continue;
    const tick=gh.frightened?G_FRIGHT:G_TICK;
    gh.moveTimer+=dt;
    if(gh.moveTimer<tick) continue;
    gh.moveTimer-=tick;
    stepGhost(gh);
    if(gs!=='playing') return;
    // Collision after ghost steps
    if(gh.r===pac.r&&gh.c===pac.c&&!gh.dead&&gh.mode!=='house'){
      if(gh.frightened){
        gh.dead=true; gh.frightened=false; gh.mode='dead';
        const n=ghosts.filter(g=>g.dead).length;
        score+=200*Math.pow(2,n-1); updateHUD();
        SFX.ghost();
      } else {
        SFX.death(); gs='dying'; stateTimer=DEATH_DUR; return;
      }
    }
  }
}

function stepGhost(gh){
  const{id,mode,frightened,r,c}=gh;

  // Dead: return to ghost house
  if(mode==='dead'){
    const tgt={r:GH_T+1,c:GH_DC};
    const nxt=bfsNext(r,c,tgt.r,tgt.c,true);
    if(nxt){ gh.r=nxt.r; gh.c=nxt.c; gh.dr=nxt.r-r; gh.dc=nxt.c-c; }
    else rndMove(gh,true);
    if(inGHInt(gh.r,gh.c)){ gh.dead=false; gh.mode='exiting'; }
    return;
  }

  // Exiting: move toward above-door position
  if(mode==='exiting'){
    const tgt={r:GH_T-1,c:GH_DC};
    const nxt=bfsNext(r,c,tgt.r,tgt.c,true);
    if(nxt){ gh.r=nxt.r; gh.c=nxt.c; gh.dr=nxt.r-r; gh.dc=nxt.c-c; }
    else rndMove(gh,true);
    if(gh.r<GH_T){ gh.mode='chase'; } // successfully exited
    return;
  }

  // Frightened: random walk
  if(frightened){ rndMove(gh,false); return; }

  // Chase / Scatter
  let tgt;
  switch(id){
    case 0: // Blinky — direct chase
      tgt={r:pac.r,c:pac.c}; break;
    case 1: // Pinky — 4 tiles ahead of pac-man
      tgt={r:Math.max(0,Math.min(ROWS-1,pac.r+pac.dr*4)),
           c:Math.max(0,Math.min(COLS-1,pac.c+pac.dc*4))}; break;
    case 2: // Inky — 50% chase, 50% corner
      tgt=Math.random()<0.5
        ?{r:pac.r,c:pac.c}
        :{r:G_CORNER[2][0],c:G_CORNER[2][1]}; break;
    case 3: // Clyde — chase if far, scatter if close
      tgt=Math.abs(r-pac.r)+Math.abs(c-pac.c)>8
        ?{r:pac.r,c:pac.c}
        :{r:G_CORNER[3][0],c:G_CORNER[3][1]}; break;
  }
  const nxt=bfsNext(r,c,tgt.r,tgt.c,false);
  if(nxt){ gh.r=nxt.r; gh.c=nxt.c; gh.dr=nxt.r-r; gh.dc=nxt.c-c; }
  else rndMove(gh,false);
}

// ════════════════════════════════════════════════
//  RENDER
// ════════════════════════════════════════════════
function render(){
  ctx.fillStyle='#000';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  if(!maze) return;
  drawMaze();
  drawGhosts();
  drawPac();
  drawStateText();
}

function gc(r,c){ // get cell safely
  if(r<0||r>=ROWS||c<0||c>=COLS) return WALL;
  return maze[r][c];
}

function buildWallCache(){
  if(!maze||!canvas.width||!canvas.height) return;
  wallCache.width=canvas.width;
  wallCache.height=canvas.height;
  wallCtx.clearRect(0,0,wallCache.width,wallCache.height);
  wallCtx.fillStyle='#000';
  wallCtx.fillRect(0,0,wallCache.width,wallCache.height);

  const W=Math.max(1,CELL>>3);
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      const x=c*CELL, y=r*CELL, cell=maze[r][c];
      if(cell===WALL){
        wallCtx.fillStyle='#001166';
        wallCtx.fillRect(x,y,CELL,CELL);
        wallCtx.fillStyle='#3355ee';
        if(gc(r-1,c)!==WALL) wallCtx.fillRect(x,y,CELL,W);
        if(gc(r+1,c)!==WALL) wallCtx.fillRect(x,y+CELL-W,CELL,W);
        if(gc(r,c-1)!==WALL) wallCtx.fillRect(x,y,W,CELL);
        if(gc(r,c+1)!==WALL) wallCtx.fillRect(x+CELL-W,y,W,CELL);
      }else if(cell===DOOR){
        wallCtx.fillStyle='#001166';
        wallCtx.fillRect(x,y,CELL,CELL);
        wallCtx.fillStyle='#ff88cc';
        wallCtx.fillRect(x,y+CELL/2-1,CELL,3);
      }
    }
  }
}

function drawMaze(){
  if(wallCache.width&&wallCache.height) ctx.drawImage(wallCache,0,0);
  const pulse=0.55+0.45*Math.sin((performance.now()/450)*Math.PI*2);
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      const x=c*CELL, y=r*CELL, cell=maze[r][c];
      if(cell===DOT){
        ctx.fillStyle='#ffb8ae';
        ctx.beginPath();
        ctx.arc(x+CELL/2,y+CELL/2,Math.max(1.5,CELL*0.12),0,Math.PI*2);
        ctx.fill();
      }else if(cell===POWER){
        ctx.save();
        ctx.shadowBlur=10; ctx.shadowColor='#ffff00';
        ctx.fillStyle=`rgba(255,255,80,${pulse})`;
        ctx.beginPath();
        ctx.arc(x+CELL/2,y+CELL/2,Math.max(3,CELL*0.30),0,Math.PI*2);
        ctx.fill();
        ctx.restore();
      }
    }
  }
}

function drawPac(){
  const x=pac.c*CELL+CELL/2, y=pac.r*CELL+CELL/2, rad=CELL*0.44;
  let mouth;
  if(gs==='dying'){
    const p=Math.max(0,1-stateTimer/DEATH_DUR);
    mouth=p*Math.PI*0.88;
  } else if(pac.dr===0&&pac.dc===0){
    mouth=0.18;
  } else {
    mouth=0.26*Math.abs(Math.sin(pac.animT*0.68));
  }
  let rot=0;
  if(pac.dc===1) rot=0;
  else if(pac.dc===-1) rot=Math.PI;
  else if(pac.dr===-1) rot=-Math.PI/2;
  else if(pac.dr===1) rot=Math.PI/2;

  ctx.save();
  ctx.translate(x,y); ctx.rotate(rot);
  ctx.shadowBlur=8; ctx.shadowColor='rgba(255,215,0,.55)';
  ctx.fillStyle='#FFD700';
  ctx.beginPath();
  ctx.moveTo(0,0);
  ctx.arc(0,0,rad,mouth,Math.PI*2-mouth);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawGhosts(){
  for(const gh of ghosts){
    drawGhost(gh, gh.mode==='house'?0.4:1.0);
  }
}

function drawGhost(gh,alpha){
  const x=gh.c*CELL+CELL/2, y=gh.r*CELL+CELL/2, r=CELL*0.42;
  ctx.save();
  ctx.globalAlpha=alpha;

  if(gh.dead){
    // Dead ghost: just floating eyes
    drawEyes(x,y,r,gh.dc,gh.dr);
    ctx.restore(); return;
  }

  let fill;
  if(gh.frightened){
    const flash=energyTimer<2000&&(Date.now()/200|0)%2;
    fill=flash?'#dddddd':'#2244cc';
  } else {
    fill=G_COLORS[gh.id];
  }

  // Body: dome + 3-bump skirt
  ctx.fillStyle=fill;
  ctx.beginPath();
  ctx.arc(x,y,r,Math.PI,0,false); // dome
  const by=y+r;
  ctx.lineTo(x+r,by);
  // 3 bumps (alternating up-down)
  ctx.quadraticCurveTo(x+r*.67,by+r*.28,x+r*.33,by);
  ctx.quadraticCurveTo(x,by-r*.16,x-r*.33,by);
  ctx.quadraticCurveTo(x-r*.67,by+r*.28,x-r,by);
  ctx.lineTo(x-r,y);
  ctx.closePath();
  ctx.fill();

  // Glow border for current ghost color
  if(!gh.frightened){
    ctx.strokeStyle=fill;
    ctx.lineWidth=1;
    ctx.globalAlpha=alpha*0.4;
    ctx.shadowBlur=6; ctx.shadowColor=fill;
    ctx.stroke();
    ctx.shadowBlur=0;
    ctx.globalAlpha=alpha;
  }

  if(gh.frightened){
    // Scared face (simple dot eyes + wavy mouth)
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.arc(x-r*.28,y-r*.15,r*.1,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x+r*.28,y-r*.15,r*.1,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#fff'; ctx.lineWidth=Math.max(1,r*.1);
    ctx.beginPath();
    ctx.moveTo(x-r*.3,y+r*.2);
    ctx.lineTo(x-r*.1,y+r*.35);
    ctx.lineTo(x+r*.1,y+r*.2);
    ctx.lineTo(x+r*.3,y+r*.35);
    ctx.stroke();
  } else {
    drawEyes(x,y,r,gh.dc,gh.dr);
  }

  ctx.restore();
}

function drawEyes(x,y,r,dc,dr){
  const eo=r*.27, er=r*.2, ey=y-r*.18;
  [-1,1].forEach(s=>{
    const ex=x+s*eo;
    ctx.fillStyle='#fff';
    ctx.beginPath();
    ctx.ellipse(ex,ey,er,er*1.25,0,0,Math.PI*2);
    ctx.fill();
    ctx.fillStyle='#0055ff';
    ctx.beginPath();
    ctx.arc(ex+dc*er*.42,ey+dr*er*.42,er*.55,0,Math.PI*2);
    ctx.fill();
  });
}

function drawStateText(){
  if(gs==='ready'){
    ctx.save();
    ctx.shadowBlur=14; ctx.shadowColor='#FFD700';
    ctx.fillStyle='#FFD700';
    ctx.font=`bold ${Math.round(CELL*1.5)}px sans-serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('READY!',canvas.width/2,canvas.height/2);
    ctx.restore();

  } else if(gs==='cleared'){
    const flash=Math.floor(Date.now()/280)%2;
    ctx.save();
    ctx.globalAlpha=flash?1:0.45;
    ctx.shadowBlur=16; ctx.shadowColor='#00ffff';
    ctx.fillStyle='#00ffff';
    ctx.font=`bold ${Math.round(CELL*1.35)}px sans-serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('CLEARED!',canvas.width/2,canvas.height/2);
    ctx.restore();
  }
}

// ════════════════════════════════════════════════
//  HUD
// ════════════════════════════════════════════════
function updateHUD(){
  document.getElementById('score').textContent=score;
  if(score>hi){ hi=score; localStorage.setItem('pmHi',String(hi)); }
  document.getElementById('hi').textContent=hi;
  document.getElementById('mapno').textContent=mapNo;
  document.getElementById('lives').textContent='💛'.repeat(Math.max(0,lives));
}

// ════════════════════════════════════════════════
//  OVERLAY
// ════════════════════════════════════════════════
function showOv(title,msg,btn='MAIN'){
  document.getElementById('ov-title').textContent=title;
  document.getElementById('ov-msg').textContent=msg;
  document.getElementById('ov-btn').textContent=btn;
  document.getElementById('overlay').classList.remove('hidden');
}
function hideOv(){ document.getElementById('overlay').classList.add('hidden'); }

// ════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════
function initMaze(full=true){
  maze=generateMaze();
  dotsLeft=0;
  for(let r=0;r<ROWS;r++)
    for(let c=0;c<COLS;c++)
      if(maze[r][c]===DOT||maze[r][c]===POWER) dotsLeft++;

  if(full){ score=0; lives=3; mapNo=1; }
  buildWallCache();
  resetPositions();
  ghostRelTimer=GH_REL;
  energized=false; energyTimer=0;
  pacTimer=0; chompTimer=0;
  updateHUD();
}

function resetPositions(){
  pac=mkPac();
  ghosts=[0,1,2,3].map(mkGhost);
  // If energized during respawn, re-apply frightened (except house ghosts)
  if(energized) ghosts.forEach(gh=>{if(gh.mode!=='house') gh.frightened=true;});
}

// ════════════════════════════════════════════════
//  INPUT
// ════════════════════════════════════════════════
function setDir(dr,dc){ if(pac) { pac.ndr=dr; pac.ndc=dc; } }

document.getElementById('dp-u').addEventListener('pointerdown',e=>{e.preventDefault();setDir(-1,0);},{passive:false});
document.getElementById('dp-d').addEventListener('pointerdown',e=>{e.preventDefault();setDir(1,0);},{passive:false});
document.getElementById('dp-l').addEventListener('pointerdown',e=>{e.preventDefault();setDir(0,-1);},{passive:false});
document.getElementById('dp-r').addEventListener('pointerdown',e=>{e.preventDefault();setDir(0,1);},{passive:false});

// Visual feedback on D-pad press
document.querySelectorAll('.dp').forEach(btn=>{
  btn.addEventListener('pointerdown',()=>btn.classList.add('pressed'));
  btn.addEventListener('pointerup',()=>btn.classList.remove('pressed'));
  btn.addEventListener('pointerleave',()=>btn.classList.remove('pressed'));
});

// Keyboard
document.addEventListener('keydown',e=>{
  const m={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1],
           w:[-1,0],s:[1,0],a:[0,-1],d:[0,1]};
  if(m[e.key]){setDir(...m[e.key]); e.preventDefault();}
});

// Swipe on canvas
let swipe0=null;
canvas.addEventListener('touchstart',e=>{
  swipe0={x:e.touches[0].clientX,y:e.touches[0].clientY};
  e.preventDefault();
},{passive:false});
canvas.addEventListener('touchend',e=>{
  if(!swipe0) return;
  const dx=e.changedTouches[0].clientX-swipe0.x;
  const dy=e.changedTouches[0].clientY-swipe0.y;
  swipe0=null;
  if(Math.abs(dx)<8&&Math.abs(dy)<8) return;
  if(Math.abs(dx)>Math.abs(dy)) setDir(0,dx>0?1:-1);
  else setDir(dy>0?1:-1,0);
  e.preventDefault();
},{passive:false});

// Back button — GameDex iframe compatible
function closePacman(){
  if(rafId) cancelAnimationFrame(rafId);
  try{
    if(window.parent&&window.parent!==window){
      window.parent.postMessage({type:'gamedex:game:close',source:'pacman'},'*');
      window.parent.postMessage('game:close','*');
      return;
    }
  }catch(e){}
  window.location.href='../../aula/home.html';
}
document.getElementById('btn-back').addEventListener('click',closePacman);

// Play / Restart button
document.getElementById('ov-btn').addEventListener('click',()=>{
  hideOv();
  initMaze(true);
  gs='ready'; stateTimer=READY_DUR;
  SFX.start();
});


// GameDex iframe launch hook
window.addEventListener('message',event=>{
  const data=event.data;
  if(!data||data.type!=='gamedex:game:launch') return;
  if(data.id&&data.id!=='pacman') return;
  queueResize();
});

// ════════════════════════════════════════════════
//  GAME LOOP
// ════════════════════════════════════════════════
let rafId=null, lastTs=0;
function loop(ts){
  const dt=Math.min(ts-lastTs,100);
  lastTs=ts;
  if(gs!=='idle') update(dt);
  render();
  rafId=requestAnimationFrame(loop);
}

// ════════════════════════════════════════════════
//  STARTUP
// ════════════════════════════════════════════════
window.addEventListener('resize',queueResize);
window.visualViewport?.addEventListener('resize',queueResize);
window.addEventListener('orientationchange',()=>setTimeout(queueResize,120));
window.addEventListener('load',()=>{
  resize();
  showOv('PAC-MAN','Makan semua titik · Hindari hantu!','MULAI');
  gs='idle';
  requestAnimationFrame(loop);
});
