// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  STATE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const API = 'https://anonsay-production.up.railway.app/api'; // Drogon backend base URL
// In-memory store (no DB, data resets on refresh as per spec)
const rooms = {}; // rooms[feature][code] = RoomData

let currentFeature = null;
let currentRoomCode = null;
let isAdmin = false;
let myUsername = null;  // for anonforum
let timerInterval = null;
let pollInterval  = null;
let myVotedChoice = null; // AnonVote: which choice user voted
let myVotedItems  = {};   // AnonForum: map msgId -> 'up'/'down'
let resultChartInstance = null;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function showToast(msg, dur=2500) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), dur);
}
function randId(len=6) {
  return Math.random().toString(36).substr(2, len).toUpperCase();
}
function randomUsername() {
  const prefixes = ['USER','ANON','MASK','ECHO','VOID','FLUX','GLOW','STAR'];
  const suffix = Math.floor(Math.random()*900+100);
  return prefixes[Math.floor(Math.random()*prefixes.length)] + suffix;
}
function fmtTime(sec) {
  if (sec < 0) sec = 0;
  const m = String(Math.floor(sec/60)).padStart(2,'0');
  const s = String(sec%60).padStart(2,'0');
  return `${m}:${s}`;
}

// Simple Indonesian profanity filter (sample list — extend as needed)
const PROFANITY = ['anjing','bangsat','brengsek','bajingan','keparat','goblok','tolol','bego','idiot','bodoh','ngentot','kontol','memek','babi'];
function filterProfanity(text) {
  let out = text;
  PROFANITY.forEach(w => {
    const re = new RegExp(w, 'gi');
    out = out.replace(re, '*'.repeat(w.length));
  });
  return out;
}

function getRoom(feature, code) {
  return rooms[feature] && rooms[feature][code];
}
function setRoom(feature, code, data) {
  if (!rooms[feature]) rooms[feature] = {};
  rooms[feature][code] = data;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  NAVIGATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function showPage(id) {
  document.querySelectorAll('.app-page').forEach(p => p.classList.remove('active-page'));
  document.getElementById(id).classList.add('active-page');
}

function goToRoomSelect(feature) {
  currentFeature = feature;
  // Update modal title
  const titles = {anonvote:'Buat Room AnonVote',anonfess:'Buat Room AnonFess',anonforum:'Buat Room AnonForum'};
  document.getElementById('modal-buat-title').textContent = titles[feature] || 'Buat Room';
  // Show/hide vote-specific fields
  document.getElementById('vote-extra').style.display = feature === 'anonvote' ? 'block' : 'none';
  if (feature === 'anonvote') renderVoteItems();
  showPage('page-room');
}

function backToHome() {
  clearInterval(timerInterval);
  clearInterval(pollInterval);
  timerInterval = null; pollInterval = null;
  currentFeature = null; currentRoomCode = null;
  isAdmin = false; myUsername = null; myVotedChoice = null;
  myVotedItems = {};
  document.getElementById('lock-icon').style.display = 'none';
  showPage('page-home');
}

function switchFitur(feature) {
  if (!currentRoomCode) { showToast('Masuk ke room dulu.'); return; }
  // check if room exists in target feature
  const room = getRoom(feature, currentRoomCode);
  if (!room) { showToast('Room '+currentRoomCode+' tidak ada di '+feature+'.'); return; }
  clearInterval(timerInterval); clearInterval(pollInterval);
  currentFeature = feature;
  isAdmin = false; // switching feature => become anon user
  myUsername = randomUsername();
  enterFeaturePage(feature, currentRoomCode, false);
  document.querySelectorAll('.sidebar').forEach(s=>s.classList.remove('open'));
}

function openSidebar(feat)  { document.getElementById('sb-'+feat).classList.add('open'); }
function closeSidebar(feat) { document.getElementById('sb-'+feat).classList.remove('open'); }

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ROOM MANAGEMENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function renderVoteItems() {
  const n = Math.min(6, Math.max(2, parseInt(document.getElementById('buat-jml-objek').value)||3));
  const cont = document.getElementById('vote-items-container');
  cont.innerHTML = '';
  for (let i=1; i<=n; i++) {
    cont.innerHTML += `<div class="vote-item-row"><span class="item-num">${i}.</span><input type="text" placeholder="Nama objek ${i}" id="vobjek-${i}"/></div>`;
  }
}

function buatRoom() {
  const code = document.getElementById('buat-kode').value.trim().toUpperCase();
  if (code.length !== 5) { showToast('Kode harus tepat 5 karakter!'); return; }
  const desc = document.getElementById('buat-desc').value.trim();
  const durMins = parseInt(document.getElementById('buat-durasi').value);
  const expiresAt = Date.now() + durMins * 60 * 1000;

  let roomData = { code, desc, expiresAt, closed: false, feature: currentFeature };

  if (currentFeature === 'anonvote') {
    const n = parseInt(document.getElementById('buat-jml-objek').value)||3;
    const items = [];
    for (let i=1; i<=n; i++) {
      const val = (document.getElementById('vobjek-'+i)?.value||'').trim() || `Objek ${i}`;
      items.push({ label: val, votes: 0 });
    }
    roomData.items = items;
    roomData.showEarlyResult = document.getElementById('buat-hasil-early').value === '1';
    roomData.votesCast = {}; // userId -> itemIndex
  } else if (currentFeature === 'anonfess') {
    roomData.messages = []; // only admin can see
  } else if (currentFeature === 'anonforum') {
    roomData.posts = []; // everyone sees
  }

  setRoom(currentFeature, code, roomData);
  isAdmin = true;
  currentRoomCode = code;
  myUsername = 'ADMIN';
  closeModal('modal-buat');
  enterFeaturePage(currentFeature, code, true);
  // Attempt to sync with backend if available
  syncRoomToBackend(currentFeature, code, roomData);
}

function masukRoom() {
  const code = document.getElementById('masuk-kode').value.trim().toUpperCase();
  if (code.length !== 5) { showToast('Kode harus tepat 5 karakter!'); return; }
  // Try to fetch from backend first; fallback to in-memory
  fetchRoomFromBackend(currentFeature, code).then(found => {
    if (!found) {
      const local = getRoom(currentFeature, code);
      if (!local) { showToast('Room tidak ditemukan!'); return; }
    }
    isAdmin = false;
    currentRoomCode = code;
    myUsername = randomUsername();
    closeModal('modal-masuk');
    enterFeaturePage(currentFeature, code, false);
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ENTER FEATURE PAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function enterFeaturePage(feature, code, adminRole) {
  const room = getRoom(feature, code);
  if (!room) { showToast('Room tidak valid!'); return; }

  showPage('page-'+feature);
  document.getElementById('lock-icon').style.display = 'block';

  // update room-code badges
  document.querySelectorAll('.room-code-badge').forEach(el => el.textContent = code);
  // admin class
  const pg = document.getElementById('page-'+feature);
  pg.classList.toggle('role-admin', adminRole);

  if (feature === 'anonvote')   setupVotePage(room, adminRole);
  else if (feature === 'anonfess') setupFessPage(room, adminRole);
  else if (feature === 'anonforum') setupForumPage(room, adminRole);

  startTimer(feature, room);
  startPolling(feature, code);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TIMER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function startTimer(feature, room) {
  clearInterval(timerInterval);
  const timerId = {anonvote:'vtimer', anonfess:'ftimer', anonforum:'ortimer'}[feature];
  const timerEl = document.getElementById(timerId);
  function tick() {
    const rem = Math.floor((room.expiresAt - Date.now()) / 1000);
    if (room.closed || rem <= 0) {
      timerEl.textContent = '00:00';
      timerEl.classList.add('expired');
      onRoomExpired(feature, room);
      clearInterval(timerInterval);
    } else {
      timerEl.textContent = fmtTime(rem);
      timerEl.classList.remove('expired');
    }
  }
  tick();
  timerInterval = setInterval(tick, 1000);
}

function onRoomExpired(feature, room) {
  room.closed = true;
  const banners = {anonvote:'vclosed-banner', anonfess:'fclosed-banner', anonforum:'orclosed-banner'};
  const banner = document.getElementById(banners[feature]);
  if (banner) banner.classList.add('show');

  if (feature === 'anonvote') {
    showVoteLoadingThenResult(room);
  } else {
    // Disable input
    const wrap = {anonfess:'fess-input-wrap', anonforum:'forum-input-wrap'}[feature];
    if (wrap) document.getElementById(wrap)?.classList.add('disabled');
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  POLLING (simulate real-time from backend)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function startPolling(feature, code) {
  clearInterval(pollInterval);
  pollInterval = setInterval(() => {
    fetchUpdatesFromBackend(feature, code);
  }, 3000);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ANONVOTE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function setupVotePage(room, adminRole) {
  document.getElementById('vote-title-text').textContent = room.desc || 'AnonVote';
  document.getElementById('vote-desc-text').textContent = '';
  document.getElementById('bar-chart-area').innerHTML = '';
  document.getElementById('chart-wrapper').style.display = 'none';
  document.getElementById('bar-chart-area').style.display = 'flex';
  document.getElementById('voted-notice').style.display = 'none';
  document.getElementById('vclosed-banner').classList.remove('show');
  document.getElementById('vote-loading').classList.remove('show');
  if (resultChartInstance) { resultChartInstance.destroy(); resultChartInstance = null; }
  myVotedChoice = null;

  // Render bars
  renderBars(room, adminRole);
  // Render vote buttons
  renderVoteBtns(room, adminRole);
}

function renderBars(room, adminRole) {
  const area = document.getElementById('bar-chart-area');
  area.innerHTML = '';
  const total = room.items.reduce((s,it)=>s+it.votes,0);
  room.items.forEach((item, i) => {
    const pct = total > 0 ? Math.round(item.votes/total*100) : 0;
    const h = Math.max(40, pct/100*220);
    // Admin or showEarlyResult sees percentages; anon sees "?" during voting
    const label = (adminRole || room.showEarlyResult || room.closed) ? pct+'%' : '?';
    const countLabel = (adminRole || room.showEarlyResult || room.closed) ? `(${item.votes})` : '';
    area.innerHTML += `
      <div class="bar-group">
        <div class="bar" id="vbar-${i}" style="height:${h}px">${label}</div>
        <div class="bar-label">${escHtml(item.label)}<br><small style="font-size:.7rem;font-weight:400">${countLabel}</small></div>
      </div>`;
  });
}

function renderVoteBtns(room, adminRole) {
  const row = document.getElementById('vote-btns-row');
  row.innerHTML = '';
  if (room.closed) return;
  if (adminRole) {
    // Admin sees bar chart, no vote buttons
    return;
  }
  room.items.forEach((item, i) => {
    const btn = document.createElement('button');
    btn.className = 'btn-vote';
    btn.id = 'vbtn-'+i;
    btn.textContent = 'VOTE: '+item.label;
    btn.onclick = () => castVote(i);
    if (i < 3) btn.style.animationDelay = (0.4+i*0.1)+'s';
    row.appendChild(btn);
  });
}

function castVote(idx) {
  if (myVotedChoice !== null) { showToast('Kamu sudah voting!'); return; }
  const room = getRoom(currentFeature, currentRoomCode);
  if (!room || room.closed) { showToast('Room sudah ditutup.'); return; }
  myVotedChoice = idx;
  room.items[idx].votes++;
  // Disable all btns
  room.items.forEach((_,i) => {
    const b = document.getElementById('vbtn-'+i);
    if (b) { b.disabled = true; b.classList.toggle('voted', i===idx); }
  });
  document.getElementById('voted-notice').style.display = 'block';
  updateBars(room, false);
  // Send to backend
  postVoteToBackend(currentRoomCode, idx);
  showToast('Vote terkirim! ✔');
}

function updateBars(room, adminRole) {
  const total = room.items.reduce((s,it)=>s+it.votes,0);
  room.items.forEach((item, i) => {
    const bar = document.getElementById('vbar-'+i);
    if (!bar) return;
    const pct = total > 0 ? Math.round(item.votes/total*100) : 0;
    const h = Math.max(40, pct/100*220);
    bar.style.height = h+'px';
    const showResult = adminRole || room.showEarlyResult || room.closed;
    bar.textContent = showResult ? pct+'%' : '?';
    const small = bar.nextElementSibling?.querySelector('small');
    if (small) small.textContent = showResult ? `(${item.votes})` : '';
  });
}

function closeVoteEarly() {
  const room = getRoom(currentFeature, currentRoomCode);
  if (!room || room.closed) return;
  room.closed = true;
  room.expiresAt = Date.now();
  onRoomExpired('anonvote', room);
}

function showVoteLoadingThenResult(room) {
  const loading = document.getElementById('vote-loading');
  loading.classList.add('show');
  setTimeout(() => {
    loading.classList.remove('show');
    showFinalResult(room);
  }, 2200);
}

function showFinalResult(room) {
  document.getElementById('bar-chart-area').style.display = 'none';
  document.getElementById('vote-btns-row').innerHTML = '';
  const wrapper = document.getElementById('chart-wrapper');
  wrapper.style.display = 'flex';
  if (resultChartInstance) { resultChartInstance.destroy(); resultChartInstance = null; }
  const labels = room.items.map(it=>it.label);
  const data   = room.items.map(it=>it.votes);
  const colors = ['#1a2d8a','#8a9bc4','#2ecc40','#e67e22','#9b59b6','#e74c3c'];
  const ctx = document.getElementById('result-chart').getContext('2d');
  resultChartInstance = new Chart(ctx, {
    type: 'pie',
    data: { labels, datasets:[{ data, backgroundColor: colors.slice(0,data.length), borderWidth:2, borderColor:'#cfc5bb' }] },
    options: { plugins:{ legend:{ labels:{ font:{family:"'Lora', serif",size:13}, color:'#1a1a1a' } } }, animation:{ duration:900 } }
  });
  showToast('Voting selesai! Hasil final ditampilkan.');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ANONFESS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function setupFessPage(room, adminRole) {
  document.getElementById('fess-desc-text').textContent = room.desc || 'Kirim pesan anonim kamu.';
  document.getElementById('fess-list').innerHTML = '';
  document.getElementById('fclosed-banner').classList.remove('show');
  document.getElementById('fess-anon-notice').style.display = 'none';
  document.getElementById('fess-input-wrap').classList.remove('disabled');
  if (adminRole) {
    document.getElementById('fess-anon-notice').style.display = 'none';
    // show existing messages
    (room.messages||[]).forEach(m => appendFessItem(m.text, m.sender, true));
  } else {
    // Anon user cannot see messages
    document.getElementById('fess-anon-notice').style.display = 'block';
    document.getElementById('fess-list').innerHTML = '<p style="font-family:Lora,serif;color:#888;text-align:center;padding:2rem;font-style:italic">Pesanmu akan terkirim anonim ke admin. Kamu tidak bisa melihat pesan orang lain.</p>';
  }
}

function appendFessItem(text, sender, prepend=false) {
  const list = document.getElementById('fess-list');
  const item = document.createElement('div');
  item.className = 'fess-item';
  item.innerHTML = `<div class="fess-sender">${escHtml(sender)}</div><div class="fess-bubble">${escHtml(text)}</div>`;
  if (prepend) list.prepend(item); else list.appendChild(item);
}

function sendFess() {
  const inp = document.getElementById('fess-input');
  const text = inp.value.trim();
  if (!text) return;
  const room = getRoom(currentFeature, currentRoomCode);
  if (!room || room.closed) { showToast('Room sudah ditutup.'); return; }
  const msg = { text, sender: myUsername||'Anon', ts: Date.now() };
  room.messages.push(msg);
  inp.value = '';
  // Only admin sees the msg in list
  if (isAdmin) appendFessItem(msg.text, msg.sender, true);
  else { showToast('Pesan terkirim! ✔'); }
  postFessToBackend(currentRoomCode, msg);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ANONFORUM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function setupForumPage(room, adminRole) {
  document.getElementById('forum-title-text').textContent = room.desc || 'AnonForum';
  document.getElementById('forum-list').innerHTML = '';
  document.getElementById('orclosed-banner').classList.remove('show');
  document.getElementById('forum-input-wrap').classList.remove('disabled');
  myVotedItems = {};
  // Show existing posts sorted by upvotes
  const sorted = [...(room.posts||[])].sort((a,b)=>b.score-a.score);
  sorted.forEach(p => appendForumPost(p, false));
}

function appendForumPost(post, prepend=false) {
  const list = document.getElementById('forum-list');
  const item = document.createElement('div');
  item.className = 'forum-item';
  item.id = 'fpost-'+post.id;
  item.innerHTML = `
    <div class="forum-sender">${escHtml(post.sender)}</div>
    <div class="forum-bubble">
      <div class="msg-text">${escHtml(post.text)}</div>
      <div class="updown">
        <button onclick="votePost('${post.id}',1)">▲</button>
        <span class="vote-score" id="score-${post.id}">${post.score}</span>
        <button onclick="votePost('${post.id}',-1)">▼</button>
      </div>
    </div>`;
  if (prepend) list.prepend(item); else list.appendChild(item);
}

function sendForum() {
  const inp = document.getElementById('forum-input');
  let text = inp.value.trim();
  if (!text) return;
  const room = getRoom(currentFeature, currentRoomCode);
  if (!room || room.closed) { showToast('Room sudah ditutup.'); return; }
  text = filterProfanity(text);
  const post = { id: randId(8), text, sender: myUsername||randomUsername(), score: 0, ts: Date.now() };
  room.posts.push(post);
  inp.value = '';
  appendForumPost(post, true);
  postForumToBackend(currentRoomCode, post);
}

function votePost(postId, val) {
  const prev = myVotedItems[postId]; // 'up', 'down', or undefined
  const room = getRoom(currentFeature, currentRoomCode);
  if (!room) return;
  const post = room.posts.find(p=>p.id===postId);
  if (!post) return;

  if (prev === 'up' && val===1)   { return; } // already upvoted
  if (prev === 'down' && val===-1){ return; } // already downvoted
  if (prev === 'up'   && val===-1){ post.score -= 2; myVotedItems[postId]='down'; }
  else if (prev === 'down' && val===1){ post.score += 2; myVotedItems[postId]='up'; }
  else { post.score += val; myVotedItems[postId] = val===1?'up':'down'; }

  const scoreEl = document.getElementById('score-'+postId);
  if (scoreEl) scoreEl.textContent = post.score;
  resortForumList(room);
  // Send vote delta to backend so score persists across polls
  const delta = (prev === 'up' && val===-1) ? -2
              : (prev === 'down' && val===1) ? 2
              : val;
  postForumVoteToBackend(currentRoomCode, postId, delta);
}

function resortForumList(room) {
  const list = document.getElementById('forum-list');
  const sorted = [...room.posts].sort((a,b)=>b.score-a.score);
  sorted.forEach(p => {
    const el = document.getElementById('fpost-'+p.id);
    if (el) list.appendChild(el);
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  BACKEND COMMUNICATION (Drogon)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// These functions send/receive data to/from the Drogon C++ backend.
// If the backend is unavailable, the app works purely in-memory.

async function syncRoomToBackend(feature, code, data) {
  try {
    await fetch(`${API}/room`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ feature, code, desc: data.desc, expiresAt: data.expiresAt,
        items: data.items||null, showEarlyResult: data.showEarlyResult||false })
    });
  } catch(_) {}
}

async function fetchRoomFromBackend(feature, code) {
  try {
    const res = await fetch(`${API}/room/${feature}/${code}`);
    if (!res.ok) return false;
    const data = await res.json();
    if (!data || !data.code) return false;
    setRoom(feature, code, {
      code: data.code, desc: data.desc, expiresAt: data.expiresAt,
      closed: data.closed||false, feature,
      items: data.items||[],
      messages: data.messages||[],
      posts: data.posts||[],
      showEarlyResult: data.showEarlyResult||false,
      votesCast: {}
    });
    return true;
  } catch(_) { return false; }
}

async function fetchUpdatesFromBackend(feature, code) {
  if (!code) return;
  try {
    const res = await fetch(`${API}/updates/${feature}/${code}`);
    if (!res.ok) return;
    const data = await res.json();
    const room = getRoom(feature, code);
    if (!room) return;
    if (feature === 'anonvote' && data.items) {
      data.items.forEach((it,i)=>{ if(room.items[i]) room.items[i].votes = it.votes; });
      updateBars(room, isAdmin);
    } else if (feature === 'anonfess' && data.messages && isAdmin) {
      data.messages.forEach(m => {
        const exists = room.messages.find(x=>x.ts===m.ts&&x.sender===m.sender);
        if (!exists) { room.messages.push(m); appendFessItem(m.text, m.sender, true); }
      });
    } else if (feature === 'anonforum' && data.posts) {
      data.posts.forEach(p => {
        const exists = room.posts.find(x=>x.id===p.id);
        if (!exists) { room.posts.push(p); appendForumPost(p, true); }
        else {
          // Only sync score from server if user hasn't locally voted this post
          // to avoid overwriting optimistic local updates
          if (!myVotedItems[p.id]) {
            exists.score = p.score;
            const el=document.getElementById('score-'+p.id);
            if(el) el.textContent=p.score;
          }
        }
      });
      resortForumList(room);
    }
    if (data.closed && !room.closed) {
      room.closed = true; room.expiresAt = Date.now();
      onRoomExpired(feature, room);
    }
  } catch(_) {}
}

async function postVoteToBackend(code, idx) {
  try {
    await fetch(`${API}/vote`, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ feature:'anonvote', code, itemIndex: idx }) });
  } catch(_) {}
}

async function postFessToBackend(code, msg) {
  try {
    await fetch(`${API}/fess`, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ code, text: msg.text, sender: msg.sender, ts: msg.ts }) });
  } catch(_) {}
}

async function postForumToBackend(code, post) {
  try {
    await fetch(`${API}/forum/post`, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ code, id: post.id, text: post.text, sender: post.sender, ts: post.ts }) });
  } catch(_) {}
}

async function postForumVoteToBackend(code, postId, val) {
  try {
    await fetch(`${API}/forum/vote`, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ code, postId, val }) });
  } catch(_) {}
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  UTILITIES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Init vote items on load
renderVoteItems();