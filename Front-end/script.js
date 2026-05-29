let selectedMode = 'anonvote';
let activeRoomCode = '';
const voteTracker = { a: 0, b: 0, c: 0 };
const MAX_CHART_HEIGHT = 300;

function showPage(pageId) {
  document.querySelectorAll('.app-page').forEach(page => page.classList.remove('active-page'));
  document.getElementById(pageId).classList.add('active-page');
}

function navigateToRoom(mode) {
  selectedMode = mode;
  showPage('page-room');
}

function backToHome() {
  showPage('page-home');
}

function switchFeature(feature) {
  toggleSidebar(false);
  showPage(`page-${feature}`);
  if (feature === 'anonvote') {
    updateChart();
  }
}

function toggleSidebar(isOpening) {
  document.querySelectorAll('.sidebar').forEach(sb => {
    if (isOpening) sb.classList.add('open');
    else sb.classList.remove('open');
  });
}

function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

function prosesRoom(isCreating) {
  const inputId = isCreating ? 'buat-kode' : 'masuk-kode';
  const codeValue = document.getElementById(inputId).value.trim();
  if (!codeValue) {
    alert('Harap isi kode room terlebih dahulu!');
    return;
  }
  activeRoomCode = codeValue.toUpperCase();
  document.querySelectorAll('.current-room-text').forEach(el => el.textContent = activeRoomCode);
  document.getElementById('fess-admin-name').textContent = "Host Room (" + activeRoomCode + ")";
  closeModal(isCreating ? 'buat-modal' : 'masuk-modal');
  switchFeature(selectedMode);
}

function submitVote(choice) {
  voteTracker[choice]++;
  updateChart();
}

function updateChart() {
  const total = voteTracker.a + voteTracker.b + voteTracker.c;
  const pctA = total ? Math.round((voteTracker.a / total) * 100) : 0;
  const pctB = total ? Math.round((voteTracker.b / total) * 100) : 0;
  const pctC = total ? Math.round((voteTracker.c / total) * 100) : 0;
  const highestValue = Math.max(voteTracker.a, voteTracker.b, voteTracker.c, 1);

  const elA = document.getElementById('bar-a');
  const elB = document.getElementById('bar-b');
  const elC = document.getElementById('bar-c');

  elA.style.height = Math.max(50, (voteTracker.a / highestValue) * MAX_CHART_HEIGHT) + 'px';
  elB.style.height = Math.max(50, (voteTracker.b / highestValue) * MAX_CHART_HEIGHT) + 'px';
  elC.style.height = Math.max(50, (voteTracker.c / highestValue) * MAX_CHART_HEIGHT) + 'px';

  elA.textContent = `${pctA}% (${voteTracker.a})`;
  elB.textContent = `${pctB}% (${voteTracker.b})`;
  elC.textContent = `${pctC}% (${voteTracker.c})`;
}

function generateRandomAnonName() {
  const adverbs = ['Shadow', 'Ghost', 'Secret', 'Cyber', 'Silent', 'Ninja', 'Masked'];
  const nouns = ['User', 'Hunter', 'Writer', 'Reader', 'Coder', 'Echo', 'Phantom'];
  return "Anon-" + adverbs[Math.floor(Math.random() * adverbs.length)] + nouns[Math.floor(Math.random() * nouns.length)] + (Math.floor(Math.random() * 90) + 10);
}

function sendFess() {
  const textInput = document.getElementById('input-fess');
  const msgText = textInput.value.trim();
  if (!msgText) return;
  const container = document.getElementById('fess-list-container');
  const item = document.createElement('div');
  item.className = 'fess-item';
  item.innerHTML = `<div class="fess-sender">${generateRandomAnonName()}</div><div class="fess-bubble">${msgText}</div>`;
  container.appendChild(item);
  textInput.value = '';
  document.getElementById('page-anonfess').querySelector('.main').scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
}

function sendForum() {
  const textInput = document.getElementById('input-forum');
  const msgText = textInput.value.trim();
  if (!msgText) return;
  const container = document.getElementById('forum-list-container');
  const item = document.createElement('div');
  item.className = 'forum-item';
  item.innerHTML = `<div class="forum-sender">${generateRandomAnonName()}</div><div class="forum-bubble"><span class="msg-text">${msgText}</span><div class="updown"><button onclick="handleForumVote(this, 1)">∧</button><span class="vote-score">0</span><button onclick="handleForumVote(this, -1)">∨</button></div></div>`;
  container.appendChild(item);
  textInput.value = '';
  document.getElementById('page-anonforum').querySelector('.main').scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
}

function handleForumVote(buttonEl, modifier) {
  const scoreLabel = buttonEl.parentElement.querySelector('.vote-score');
  let currentScore = parseInt(scoreLabel.textContent);
  currentScore += modifier;
  scoreLabel.textContent = currentScore;
  buttonEl.style.color = modifier > 0 ? '#2ecc40' : '#8a1a1a';
  setTimeout(() => { buttonEl.style.color = '#1a2d6e'; }, 300);
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('active');
  });
});
