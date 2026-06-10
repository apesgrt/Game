'use strict';

// ── Sound Effects (Web Audio API) ─────────────────────────────────────────────
const SFX = (() => {
  let _ac;
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
  function noise(vol, dur, freq = 250) {
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
    // Pilih buah catur
    select()    { tone(520, 'sine', 0.1, 0.05); },
    // Gerak biasa — suara "tok" kayu
    move()      { tone(280, 'sine', 0.22, 0.07); tone(400, 'sine', 0.08, 0.05, 0.04); },
    // Makan buah — lebih berat
    capture()   { tone(200, 'sine', 0.28, 0.09); noise(0.18, 0.12, 280); },
    // Skak — nada peringatan disonan
    check()     { tone(440, 'square', 0.12, 0.12); tone(554, 'square', 0.08, 0.12, 0.08); },
    // Skakmat — melodi dramatis turun
    checkmate() {
      [784, 698, 622, 466].forEach((f, i) => tone(f, 'sawtooth', 0.18, 0.28, i * 0.14));
      noise(0.1, 0.5, 150);
    },
    // Seri — nada netral
    stalemate() { [350, 320, 290].forEach((f, i) => tone(f, 'sine', 0.14, 0.25, i * 0.1)); },
  };
})();

const UNICODE = {
  wk:'♔',wq:'♕',wr:'♖',wb:'♗',wn:'♘',wp:'♙',
  bk:'♚',bq:'♛',br:'♜',bb:'♝',bn:'♞',bp:'♟',
};
const INIT_BACK = ['r','n','b','q','k','b','n','r'];

// ── Board helpers ─────────────────────────────────────────────────────────────

function initBoard() {
  const b = Array.from({length:8}, () => Array(8).fill(null));
  for (let c=0;c<8;c++) {
    b[0][c]={type:INIT_BACK[c],color:'b'};
    b[1][c]={type:'p',color:'b'};
    b[6][c]={type:'p',color:'w'};
    b[7][c]={type:INIT_BACK[c],color:'w'};
  }
  return b;
}

function cloneBoard(board) {
  return board.map(row => row.map(cell => cell ? {...cell} : null));
}

function inB(r,c) { return r>=0&&r<8&&c>=0&&c<8; }

function findKing(board,color) {
  for (let r=0;r<8;r++)
    for (let c=0;c<8;c++)
      if (board[r][c]?.type==='k'&&board[r][c]?.color===color) return [r,c];
  return null;
}

function pseudoMoves(board,r,c,ep) {
  const p=board[r][c]; if(!p) return [];
  const {type,color}=p, opp=color==='w'?'b':'w', moves=[];
  const slide=(dr,dc)=>{
    let tr=r+dr,tc=c+dc;
    while(inB(tr,tc)){const t=board[tr][tc];if(t){if(t.color!==color)moves.push([tr,tc]);break;}moves.push([tr,tc]);tr+=dr;tc+=dc;}
  };
  const add=(tr,tc)=>{if(!inB(tr,tc))return;const t=board[tr][tc];if(t&&t.color===color)return;moves.push([tr,tc]);};
  if(type==='p'){
    const dir=color==='w'?-1:1,start=color==='w'?6:1;
    if(inB(r+dir,c)&&!board[r+dir][c]){moves.push([r+dir,c]);if(r===start&&!board[r+2*dir][c])moves.push([r+2*dir,c]);}
    for(const dc of[-1,1]){const tr=r+dir,tc=c+dc;if(!inB(tr,tc))continue;if(board[tr][tc]?.color===opp)moves.push([tr,tc]);if(ep&&ep[0]===tr&&ep[1]===tc)moves.push([tr,tc]);}
  } else if(type==='n'){
    for(const [dr,dc] of[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])add(r+dr,c+dc);
  } else if(type==='b'){[[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([dr,dc])=>slide(dr,dc));
  } else if(type==='r'){[[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc])=>slide(dr,dc));
  } else if(type==='q'){[[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc])=>slide(dr,dc));
  } else if(type==='k'){for(const [dr,dc] of[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]])add(r+dr,c+dc);}
  return moves;
}

function isAttacked(board,r,c,byColor) {
  for(let pr=0;pr<8;pr++)
    for(let pc=0;pc<8;pc++){
      const p=board[pr][pc];
      if(p?.color===byColor&&pseudoMoves(board,pr,pc,null).some(([mr,mc])=>mr===r&&mc===c))return true;
    }
  return false;
}

function inCheck(board,color) {
  const k=findKing(board,color);
  return k?isAttacked(board,k[0],k[1],color==='w'?'b':'w'):false;
}

function legalMoves(board,r,c,ep,cr) {
  const p=board[r][c];if(!p)return[];
  const {color}=p,legal=[];
  for(const [tr,tc] of pseudoMoves(board,r,c,ep)){
    const next=cloneBoard(board);
    if(p.type==='p'&&ep&&tr===ep[0]&&tc===ep[1]&&!board[tr][tc])
      next[color==='w'?tr+1:tr-1][tc]=null;
    next[tr][tc]=next[r][c];next[r][c]=null;
    if(p.type==='p'&&(tr===0||tr===7))next[tr][tc]={type:'q',color};
    if(!inCheck(next,color))legal.push([tr,tc]);
  }
  if(p.type==='k'&&!inCheck(board,color)){
    const row=color==='w'?7:0,opp=color==='w'?'b':'w';
    if(cr[color+'K']&&!board[row][5]&&!board[row][6]&&!isAttacked(board,row,5,opp)&&!isAttacked(board,row,6,opp))legal.push([row,6,'ck']);
    if(cr[color+'Q']&&!board[row][3]&&!board[row][2]&&!board[row][1]&&!isAttacked(board,row,3,opp)&&!isAttacked(board,row,2,opp))legal.push([row,2,'cq']);
  }
  return legal;
}

function applyMove(board,from,to,ep,cr) {
  const [r,c]=from,[tr,tc,special]=to;
  const next=cloneBoard(board),p=next[r][c],newCR={...cr};
  let newEP=null;
  if(p.type==='p'&&ep&&tr===ep[0]&&tc===ep[1]&&!board[tr][tc])next[p.color==='w'?tr+1:tr-1][tc]=null;
  if(p.type==='p'&&Math.abs(tr-r)===2)newEP=[(r+tr)/2,tc];
  if(special==='ck'){const row=p.color==='w'?7:0;next[row][5]=next[row][7];next[row][7]=null;}
  if(special==='cq'){const row=p.color==='w'?7:0;next[row][3]=next[row][0];next[row][0]=null;}
  if(p.type==='k'){newCR[p.color+'K']=false;newCR[p.color+'Q']=false;}
  if(p.type==='r'){if(r===7&&c===7)newCR.wK=false;if(r===7&&c===0)newCR.wQ=false;if(r===0&&c===7)newCR.bK=false;if(r===0&&c===0)newCR.bQ=false;}
  next[tr][tc]=p;next[r][c]=null;
  if(p.type==='p'&&(tr===0||tr===7))next[tr][tc]={type:'q',color:p.color};
  return {board:next,ep:newEP,cr:newCR};
}

function hasAnyLegal(board,color,ep,cr) {
  for(let r=0;r<8;r++)
    for(let c=0;c<8;c++)
      if(board[r][c]?.color===color&&legalMoves(board,r,c,ep,cr).length>0)return true;
  return false;
}

// ── State ─────────────────────────────────────────────────────────────────────

function freshState() {
  return {
    board: initBoard(), turn:'w', ep:null,
    cr:{wK:true,wQ:true,bK:true,bQ:true},
    captured:{w:[],b:[]}, status:null,
    lastMove:null, sel:null, moves:[], history:[],
    promotion:false, pendingMove:null,
  };
}
let S = freshState();

// ── Render ────────────────────────────────────────────────────────────────────

function squareSize() {
  return Math.min(Math.floor((window.innerWidth - 60) / 8), 52);
}

function render() {
  const sz = squareSize();
  renderBoard(sz);
  renderRankFiles(sz);
  renderStatus();
  renderCaptured();
  document.getElementById('btn-undo').disabled = S.history.length === 0 || S.promotion;
}

function renderBoard(sz) {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
  boardEl.style.width = (sz*8) + 'px';

  let checkKing = null;
  if (S.status==='check'||S.status==='checkmate') checkKing=findKing(S.board,S.turn);

  for (let r=0;r<8;r++) {
    for (let c=0;c<8;c++) {
      const sq = document.createElement('div');
      sq.className = 'square ' + ((r+c)%2===0?'light':'dark');
      sq.style.width = sq.style.height = sz+'px';

      if (S.lastMove&&((S.lastMove[0][0]===r&&S.lastMove[0][1]===c)||(S.lastMove[1][0]===r&&S.lastMove[1][1]===c)))
        sq.classList.add('last-move');
      if (S.sel&&S.sel[0]===r&&S.sel[1]===c) sq.classList.add('selected');
      if (checkKing&&checkKing[0]===r&&checkKing[1]===c) sq.classList.add('in-check');

      const isLegal = S.moves.some(m=>m[0]===r&&m[1]===c);
      if (isLegal) {
        const isCap = S.board[r][c]!==null||
          (S.board[S.sel?.[0]]?.[S.sel?.[1]]?.type==='p'&&S.ep?.[0]===r&&S.ep?.[1]===c);
        const hint = document.createElement('div');
        hint.className = isCap?'capture-ring':'move-dot';
        sq.appendChild(hint);
      }

      const piece = S.board[r][c];
      if (piece) {
        const span = document.createElement('span');
        span.className='piece '+(piece.color==='w'?'white-piece':'black-piece');
        span.textContent=UNICODE[piece.color+piece.type];
        sq.appendChild(span);
      }

      const clickable = !S.status||S.status==='check';
      if (clickable||(S.status&&isLegal)) sq.classList.add('clickable');
      sq.addEventListener('click',()=>handleSquare(r,c));
      boardEl.appendChild(sq);
    }
  }
}

function renderRankFiles(sz) {
  const ranks = document.getElementById('rank-labels');
  ranks.innerHTML='';
  for (let r=0;r<8;r++) {
    const d=document.createElement('div');
    d.className='rank-label';
    d.style.height=sz+'px';
    d.textContent=8-r;
    ranks.appendChild(d);
  }
  const files=document.getElementById('file-labels');
  files.innerHTML='';
  'abcdefgh'.split('').forEach(f=>{
    const d=document.createElement('div');
    d.className='file-label';
    d.style.width=sz+'px';
    d.textContent=f;
    files.appendChild(d);
  });
}

function renderStatus() {
  const el=document.getElementById('status');
  el.innerHTML='';
  const {status,turn}=S;
  const tName=turn==='w'?'Putih':'Hitam';
  if (status==='checkmate') {
    const winner=turn==='w'?'Hitam':'Putih';
    const w=document.createElement('span');w.className='win';w.textContent=`🏆 ${winner} Menang!`;el.appendChild(w);
    const s=document.createElement('span');s.className='check';s.textContent='SKAKMAT';el.appendChild(s);
  } else if (status==='stalemate') {
    const d=document.createElement('span');d.className='draw';d.textContent='🤝 Seri — Stalemate';el.appendChild(d);
  } else if (status==='check') {
    const c=document.createElement('span');c.className='check';c.textContent='⚠ SKAK!';el.appendChild(c);
    el.appendChild(document.createTextNode('Giliran '));
    const s=document.createElement('span');s.className=turn==='w'?'label-w':'label-b';s.textContent=(turn==='w'?'♔ ':'♚ ')+tName;el.appendChild(s);
  } else {
    el.appendChild(document.createTextNode('Giliran '));
    const s=document.createElement('span');s.className=turn==='w'?'label-w':'label-b';s.textContent=(turn==='w'?'♔ ':'♚ ')+tName;el.appendChild(s);
  }
}

function renderCaptured() {
  const order=['q','r','b','n','p'];
  ['w','b'].forEach(color=>{
    const el=document.getElementById('captured-'+color);
    el.innerHTML='';
    [...S.captured[color]].sort((a,b)=>order.indexOf(a)-order.indexOf(b)).forEach(t=>{
      const span=document.createElement('span');
      span.className=color==='w'?'white-piece':'black-piece';
      span.style.fontSize='16px';
      const enemyColor = color === 'w' ? 'b' : 'w';
      span.textContent=UNICODE[enemyColor+t];
      el.appendChild(span);
    });
  });
}

// ── Logic ─────────────────────────────────────────────────────────────────────

function handleSquare(r,c) {
  if ((S.status==='checkmate'||S.status==='stalemate')||S.promotion) return;
  // Blokir input player saat giliran bot
  if (typeof aiEnabled !== 'undefined' && aiEnabled && S.turn === 'b') return;
  const {board,turn,sel,moves,ep,cr}=S;

  if (sel) {
    const mv=moves.find(m=>m[0]===r&&m[1]===c);
    if (mv) {
      if (board[sel[0]][sel[1]]?.type==='p'&&(r===0||r===7)) {
        S.pendingMove=mv;
        showPromoModal(turn);
        return;
      }
      executeMove(mv);
      return;
    }
    if (board[r][c]?.color===turn) {
      S.sel=[r,c];
      S.moves=legalMoves(board,r,c,ep,cr);
      render();return;
    }
    S.sel=null;S.moves=[];render();return;
  }
  if (board[r][c]?.color===turn) {
    S.sel=[r,c];
    S.moves=legalMoves(board,r,c,ep,cr);
    SFX.select();
    render();
  }
}

function executeMove(mv,promoType) {
  const {board,sel,turn,ep,cr,captured}=S;
  const [tr,tc]=mv;
  const p=board[sel[0]][sel[1]];

  S.history.push({
    board:cloneBoard(board),turn,ep:S.ep,cr:{...S.cr},
    captured:{w:[...captured.w],b:[...captured.b]},
    status:S.status,lastMove:S.lastMove,
  });

  const result=applyMove(board,sel,mv,ep,cr);
  if (promoType) result.board[tr][tc]={type:promoType,color:turn};

  const capPiece=board[tr][tc];
  const newCap={w:[...captured.w],b:[...captured.b]};
  if (capPiece) newCap[turn].push(capPiece.type);
  if (p?.type==='p'&&ep&&tr===ep[0]&&tc===ep[1]&&!board[tr][tc]) {
    const epPawn=board[turn==='w'?tr+1:tr-1][tc];
    if(epPawn)newCap[turn].push(epPawn.type);
  }

  const next=turn==='w'?'b':'w';
  const checked=inCheck(result.board,next);
  const hasLegal=hasAnyLegal(result.board,next,result.ep,result.cr);
  const status=!hasLegal?(checked?'checkmate':'stalemate'):checked?'check':null;

  S.board=result.board;S.turn=next;S.ep=result.ep;S.cr=result.cr;
  S.sel=null;S.moves=[];S.captured=newCap;S.status=status;
  S.lastMove=[sel,[tr,tc]];S.promotion=false;S.pendingMove=null;

  // Sound feedback based on what happened
  if      (status === 'checkmate') SFX.checkmate();
  else if (status === 'stalemate') SFX.stalemate();
  else if (status === 'check')     SFX.check();
  else if (capPiece)               SFX.capture();
  else                             SFX.move();

  render();

  // Panggil bot setelah giliran putih selesai
  if (typeof aiEnabled !== 'undefined' && aiEnabled && S.turn === 'b'
    && S.status !== 'checkmate' && S.status !== 'stalemate') {
    setTimeout(()=>{ if(typeof botMove==='function') botMove(); }, 600);
  }
}

function showPromoModal(color) {
  const modal=document.getElementById('promotion-modal');
  modal.querySelectorAll('.promo-btn').forEach(btn=>{
    btn.textContent=UNICODE[color+btn.dataset.type];
  });
  modal.style.display='flex';
  S.promotion=true;
  render();
}

function undo() {
  if (S.history.length===0) return;
  // Kalau mode AI, undo 2 langkah sekaligus (langkah bot + langkah player)
  if (typeof aiEnabled !== 'undefined' && aiEnabled) {
    if (S.history.length >= 2) { S.history.pop(); }
  }
  const prev=S.history.pop();
  S.board=prev.board;S.turn=prev.turn;S.ep=prev.ep;S.cr=prev.cr;
  S.captured=prev.captured;S.status=prev.status;S.lastMove=prev.lastMove;
  S.sel=null;S.moves=[];S.promotion=false;S.pendingMove=null;
  document.getElementById('promotion-modal').style.display='none';
  render();
}

function resetGame() {
  S=freshState();
  if (typeof aiEnabled !== 'undefined') { aiEnabled=false; botLevel=null; gameStarted=false; }
  document.getElementById('promotion-modal').style.display='none';
  const menu=document.getElementById('mode-menu');
  if(menu) menu.classList.remove('hidden');
  render();
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', ()=>{
  render();
  document.getElementById('btn-undo').addEventListener('click',undo);
  document.getElementById('btn-reset').addEventListener('click',resetGame);
  document.querySelectorAll('.promo-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.getElementById('promotion-modal').style.display='none';
      executeMove(S.pendingMove,btn.dataset.type);
    });
  });
  window.addEventListener('resize',render);
});
