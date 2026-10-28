// 허브 · 라우팅 · 화면 틀. 각 미니게임 모듈은 view()/bind() 한 쌍만 내보낸다.
import {
  $, $$, esc, state, setState, data, freshState, load, save, wipe, log, announce,
  art, tier, allArtifactIds, identified, focusLeft, focusBudget,
  sfx, toast, speak, hush, toggleBgm, stopBgm, musicScene, musicLabel, hooks,
  SCENES, HUB_STEPS, HUB_LABELS
} from './core.js';
import * as dig from './dig.js';
import * as study from './study.js';
import * as cast from './cast.js';
import * as rebuild from './rebuild.js';
import * as story from './story.js';

const isPov = () => (state.scene === 'intro' && state.introPhase === 'story')
  || state.scene === 'rivalIntro'
  || (state.scene === 'talk' && state.activeTalk && state.codex.includes(state.activeTalk));

/* ---------- 허브 ---------- */
function hubStatus() {
  const total = allArtifactIds().length;
  const found = state.found.length;
  const idd = state.codex.length;
  const newTalks = state.codex.filter(id => !state.talked.includes(id)).length;
  const placed = Object.keys(state.reconstruction).length;
  return { total, found, idd, newTalks, placed, grade: state.cast?.grade || null };
}

function hubLine() {
  const s = hubStatus(), L = data.dialogue.hub.lines;
  if (s.found < s.total && !s.found) return L.start;
  if (s.found > s.idd) return L.studyPending;
  if (s.idd === s.total && !s.grade) return L.castReady;
  if (s.found < s.total) return L.digging;
  if (s.grade) return L.done;
  return L.start;
}

function hubCard({ id, icon, name, desc, status, badge, disabled, done }) {
  return `<button class="hub-card ${done ? 'done' : ''} ${disabled ? 'locked' : ''}" data-hub="${id}" ${disabled ? 'disabled' : ''}>
    ${badge ? `<span class="hub-badge">${esc(badge)}</span>` : ''}
    <span class="hub-icon" aria-hidden="true">${icon}</span>
    <span class="hub-body">
      <b>${esc(name)}</b>
      <small>${esc(desc)}</small>
      <span class="hub-status">${esc(status)}</span>
    </span>
  </button>`;
}

function hubView() {
  const s = hubStatus(), h = data.dialogue.hub;
  const t = tier();
  return `
    <header class="scene-head">
      <div class="eyebrow">${esc(h.title)} · 호감도 ${state.affection}/100 · ${esc(t.mood)}</div>
      <h1>어디로 갈까요?</h1>
      <p>${esc(h.lead)}</p>
    </header>
    <section class="hub-sayu">
      <img src="assets/character/sayu-reference-web.png" alt="캠프에서 기다리는 사유 캐릭터">
      <div><span class="fiction-label">창작 캐릭터 대사</span><p class="fiction">“${esc(hubLine())}”</p></div>
    </section>
    <div class="hub-grid">
      ${hubCard({ id: 'dig', icon: '⛏', name: '발굴장', desc: '솔로 토층을 쓸어내고 인접 단서로 조각을 추론합니다.',
        status: `조각 ${s.found}/${s.total} 발견${state.challengeMode === 'story' ? ` · 집중력 ${focusLeft()}/${focusBudget()}` : ''}`,
        badge: s.found < s.total ? '진행 가능' : '', done: s.found === s.total })}
      ${hubCard({ id: 'study', icon: '◎', name: '조사대', desc: '확대경·감마선·성분분석으로 직접 판독합니다.',
        status: s.found ? `감별 ${s.idd}/${s.found} 완료` : '발굴한 조각이 없습니다',
        badge: s.found > s.idd ? `${s.found - s.idd}개 대기` : '', disabled: !s.found, done: s.found > 0 && s.idd === s.total })}
      ${hubCard({ id: 'cast', icon: '🔥', name: '주조소', desc: '밀랍주조 네 공정을 선택해 상을 직접 만듭니다.',
        status: s.grade ? `주조 완료 · 등급 ${s.grade}` : s.idd === s.total ? '모든 조각 감별 완료 · 시작 가능' : `조각 ${s.total - s.idd}개 더 감별하면 열립니다`,
        badge: !s.grade && s.idd === s.total ? '신규' : '', disabled: s.idd < s.total, done: !!s.grade })}
      ${hubCard({ id: 'reconstruct', icon: '✥', name: '복원대', desc: '감별한 조각을 원래 자리로 되돌립니다.',
        status: s.idd ? `복원 ${s.placed}/${s.idd}` : '감별을 마치면 열립니다', disabled: !s.idd, done: s.idd > 0 && s.placed === s.idd })}
      ${hubCard({ id: 'talk', icon: '♥', name: '사유와 대화', desc: '감별한 조각마다 사유의 이야기가 열립니다.',
        status: s.idd ? `${state.talked.length}/${s.idd}개 이야기를 들었습니다` : '감별을 마치면 열립니다',
        badge: s.newTalks ? `새 이야기 ${s.newTalks}` : '', disabled: !s.idd })}
      ${hubCard({ id: 'codex', icon: '▦', name: '도감', desc: '지금까지 알아낸 것을 모아 봅니다.',
        status: `${s.idd}/${s.total} 등록`, disabled: !s.idd })}
    </div>
    <div class="actions">
      ${s.grade && s.placed === s.idd ? '<button class="btn primary" id="toComplete">오늘의 발굴을 마치기</button>' : ''}
    </div>`;
}

function hubBind() {
  $$('[data-hub]').forEach(b => b.onclick = () => {
    const to = b.dataset.hub;
    if (to === 'codex') { openCodex(); return; }
    go(to);
  });
  $('#toComplete')?.addEventListener('click', () => go('complete'));
}

function openCodex() {
  log('codex_open', { size: state.codex.length });
  const rows = data.artifacts.artifacts.map(a => {
    const on = state.codex.includes(a.id);
    return `<div class="codex-row ${on ? 'on' : ''}">
      <span class="artifact-icon">${on ? a.icon : '?'}</span>
      <div><b>${on ? esc(a.name) : '미등록 조각'}</b><p>${on ? esc(a.codex) : '감별을 마치면 내용이 열립니다.'}</p></div>
    </div>`;
  }).join('');
  const junkRows = state.junkFound.length
    ? `<h3>함께 나온 것들</h3>${state.junkFound.map(id => {
        const j = data.artifacts.junk.find(x => x.id === id);
        return `<div class="codex-row on small"><span class="artifact-icon">${j.icon}</span><div><b>${esc(j.name)}</b><p>${esc(j.fact)}</p></div></div>`;
      }).join('')}`
    : '';
  modal(`<div class="codex-sheet"><div class="eyebrow">도감 ${state.codex.length}/${allArtifactIds().length}</div><h2>알아낸 것</h2>${rows}${junkRows}</div>`);
}

/* ---------- 사전 질문 ---------- */
function pretestView() {
  return `
    <header class="scene-head">
      <div class="eyebrow">사전 질문</div>
      <h1>지금 알고 있는 만큼만 답해 주세요</h1>
      <p>정답을 알려 드리기 전의 생각을 기록합니다. 점수 경쟁에 쓰지 않습니다.</p>
    </header>
    ${story.quizHTML('pre')}
    <div class="actions"><button class="btn primary" id="preSubmit">발굴 캠프로</button></div>`;
}
function pretestBind() {
  $('#preSubmit').onclick = () => {
    if (!story.collectQuiz('pre')) { toast('모든 사전 질문에 답해 주세요.'); return; }
    log('pretest_complete', { score: story.score(state.preAnswers) });
    go('hub');
  };
}

/* ---------- 엔딩 ---------- */
function completeView() {
  const key = story.endingKey(), e = data.dialogue.endings[key];
  const pre = story.score(state.preAnswers), post = story.score(state.postAnswers);
  const kn = data.questions.knowledge.length;
  const graded = Object.keys(state.postAnswers).length === kn;
  const g = state.cast?.grade;
  return `
    <header class="scene-head">
      <div class="eyebrow">${esc(e.badge)}</div>
      <h1>${esc(e.title)}</h1>
      <p>${esc(e.text)}</p>
    </header>
    <section class="ending-card ${e.kind}">
      <img src="assets/character/sayu-reference-web.png" alt="사유 캐릭터">
      <div>
        <span class="eyebrow">최종 호감도 ${state.affection}/100 · ${esc(tier().mood)}</span>
        <h2>“${esc(e.line)}”</h2>
        <p>도감 ${state.codex.length}/${allArtifactIds().length}${g ? ` · 주조 등급 ${g}` : ' · 주조 미완'} · 복원 ${Object.keys(state.reconstruction).length}곳</p>
      </div>
    </section>
    <div class="complete-hero">
      <img class="restored" src="${data.artifacts.work.image}" alt="복원된 금동 반가사유상">
      <section class="panel">
        <div class="facts"><b>${esc(data.artifacts.work.factNote)}</b><br>${esc(data.artifacts.work.period)} · ${esc(data.artifacts.work.collection)}</div>
        <h2>내가 알아낸 것</h2>
        <div class="discovery-grid">
          ${data.artifacts.artifacts.filter(a => state.codex.includes(a.id)).map(a =>
            `<div class="discovery-card"><b>${a.icon} ${esc(a.name)}</b>${esc(a.codex)}</div>`).join('') || '<p>감별을 마친 조각이 없습니다.</p>'}
        </div>
      </section>
    </div>
    <section class="panel mt">
      <h2>사후 지식 질문</h2>
      ${story.quizHTML('post')}
      <button class="btn primary" id="postScore">결과 확인</button>
      <div id="scoreBox">${graded ? `<p class="score-card">사전 ${pre}/${kn} → 사후 ${post}/${kn}</p>` : ''}</div>
    </section>
    <section class="panel mt">
      <h2>경험 평가</h2>
      ${data.questions.experience.map((q, i) => `
        <fieldset class="question">
          <legend>${esc(q)}</legend>
          <div class="scale" role="radiogroup" aria-label="1 전혀 아니다, 5 매우 그렇다">
            ${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="rating-${i}" value="${n}" ${state.ratings[i] == n ? 'checked' : ''}>${n}</label>`).join('')}
          </div>
        </fieldset>`).join('')}
      <label for="reflection"><b>가장 기억나는 발견과 그 이유</b></label>
      <textarea id="reflection" placeholder="예: 밀랍을 두껍게 깎는 쪽을 골랐더니 결함이 생겼는데, 실제 국보도 그랬다는 게 기억에 남았다.">${esc(state.reflection)}</textarea>
      <div class="actions">
        <button class="btn primary" id="finishBtn">회고 저장</button>
        <button class="btn secondary" id="downloadBtn">행동 로그 JSON 다운로드</button>
        <button class="btn secondary" id="backHub">캠프로 돌아가기</button>
        <button class="btn danger" id="restartBtn">처음부터 다시 하기</button>
      </div>
    </section>`;
}

function completeBind() {
  $('#postScore').onclick = () => {
    if (!story.collectQuiz('post')) { toast('모든 사후 질문에 답해 주세요.'); return; }
    log('posttest_complete', { score: story.score(state.postAnswers) });
    render();
  };
  $$('[name^="rating-"]').forEach(r => r.onchange = () => { state.ratings[r.name.split('-')[1]] = Number(r.value); save(); });
  $('#reflection').oninput = e => { state.reflection = e.target.value; save(); };
  $('#finishBtn').onclick = () => {
    story.collectQuiz('post');
    state.completedAt = Date.now();
    state.reflection = $('#reflection').value.trim();
    log('game_complete', {
      total_time_ms: state.completedAt - state.startedAt,
      pre_score: story.score(state.preAnswers),
      post_score: story.score(state.postAnswers),
      ending: story.endingKey(),
      affection: state.affection,
      codex: state.codex.length,
      casting_grade: state.cast?.grade || null,
      revisit_count: state.logs.filter(x => x.action === 'revisit_artifact' || x.action === 'revisit_dialogue').length,
      brush_strokes: state.logs.filter(x => x.action === 'brush_stroke').length,
      tool_uses: state.logs.filter(x => x.action === 'tool_used').length
    });
    toast('회고와 평가를 저장했습니다. 로그를 다운로드할 수 있습니다.');
    speak('오늘 나를 처음부터 끝까지 봐 줘서 고마워.');
  };
  $('#downloadBtn').onclick = downloadLog;
  $('#backHub').onclick = () => go('hub');
  $('#restartBtn').onclick = restart;
}

function downloadLog() {
  const payload = {
    project: '사유상 복원 프로젝트',
    version: '2.1.0',
    exported_at: new Date().toISOString(),
    settings: {
      challenge_mode: state.challengeMode, audio: state.audio, bgm: state.bgm, contrast: state.contrast,
      sfx: state.sfx, haptics: state.haptics, dig_stage: state.digStage, dig_stage_manual: state.digStageManual,
      // 보기 순서는 이 값으로 정해진다(core.js order). 답은 원래 보기 번호로 기록한다.
      option_order_seed: state.startedAt
    },
    outcome: {
      ending: story.endingKey(), affection: state.affection,
      codex: state.codex, casting: state.cast, reconstruction: state.reconstruction,
      focus_used: state.focusUsed, junk_found: state.junkFound
    },
    scores: { pre: story.score(state.preAnswers), post: story.score(state.postAnswers), total: data.questions.knowledge.length },
    answers: { pre: state.preAnswers, post: state.postAnswers, ratings: state.ratings, reflection: state.reflection },
    readings: state.readings,
    logs: state.logs
  };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  a.download = `sayu-session-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  log('log_downloaded');
}

function restart() {
  if (!confirm('현재 기록을 지우고 처음부터 다시 시작할까요?')) return;
  cast.stopPour(); stopBgm(); hush(); wipe();
  setState(freshState());
  render();
}

/* ---------- 라우팅 ---------- */
const views = {
  intro: story.introView, rivalIntro: story.rivalView, pretest: pretestView,
  hub: hubView, dig: dig.view, study: study.view, reconstruct: rebuild.view,
  cast: cast.view, talk: story.talkView, complete: completeView
};
const binds = {
  intro: story.introBind, rivalIntro: story.rivalBind, pretest: pretestBind,
  hub: hubBind, dig: dig.bind, study: study.bind, reconstruct: rebuild.bind,
  cast: cast.bind, talk: story.talkBind, complete: completeBind
};

function go(name) {
  if (!SCENES.includes(name)) return;
  cast.stopPour();
  if (state.scene === 'dig' && name !== 'dig') dig.leave();
  state.scene = name;
  musicScene(name);
  log('scene_enter', { target: name });
  if (name === 'hub') log('hub_enter', { codex: state.codex.length, found: state.found.length });
  render();
  window.scrollTo(0, 0);
  requestAnimationFrame(() => $('#scene').focus());
}

function hubStep() {
  if (state.scene === 'intro' || state.scene === 'rivalIntro') return 0;
  if (state.scene === 'pretest') return 1;
  if (state.scene === 'dig') return 2;
  if (state.scene === 'study' || state.scene === 'reconstruct') return 3;
  if (state.scene === 'cast') return 4;
  if (state.scene === 'complete') return 5;
  return state.codex.length === allArtifactIds().length ? 4 : 2;
}

function updateChrome() {
  const pov = isPov();
  const inGame = state.scene !== 'pretest' && state.scene !== 'complete';
  document.body.classList.toggle('game-active', inGame);
  document.body.classList.toggle('research-active', !inGame);
  document.body.classList.toggle('pov-active', pov);
  document.body.classList.toggle('high-contrast', state.contrast);
  document.body.dataset.scene = state.scene;

  $('#audioBtn').setAttribute('aria-pressed', state.audio);
  $('#audioBtn').textContent = state.audio ? '🔊 음성 켬' : '🔇 음성 끔';
  $('#bgmBtn').setAttribute('aria-pressed', state.bgm);
  $('#bgmBtn').textContent = state.bgm ? '♫ BGM 켬' : '♫ BGM 끔';
  $('#bgmBtn').title = state.bgm ? `재생 중: ${musicLabel()} BGM` : 'BGM 켜기';
  $('#contrastBtn').setAttribute('aria-pressed', state.contrast);

  const now = hubStep();
  $('#stageProgress').innerHTML = HUB_STEPS.map((s, i) =>
    `<li class="${i < now ? 'done' : i === now ? 'current' : ''}" ${i === now ? 'aria-current="step"' : ''}>${i < now ? '✓ ' : ''}${HUB_LABELS[s]}</li>`).join('');

  const hud = $('#gameHud');
  const showHud = !pov && state.scene !== 'intro' && state.scene !== 'pretest' && state.scene !== 'complete';
  hud.hidden = !showHud;
  if (showHud) {
    const v = state.affection;
    $('#affectionText').textContent = `호감도 ${v}/100 · ${tier().mood}`;
    $('#affectionBar').style.width = `${v}%`;
    hud.querySelector('[role="meter"]').setAttribute('aria-valuenow', v);
    $('#objectiveText').textContent = objective();
    const fw = $('#focusWrap');
    if (state.challengeMode === 'story' && state.scene === 'dig') {
      fw.hidden = false;
      $('#focusText').textContent = `집중력 ${focusLeft()}/${focusBudget()}`;
    } else fw.hidden = true;
    $('#codexText').textContent = `도감 ${state.codex.length}/${allArtifactIds().length}`;
  }
}

function objective() {
  const total = allArtifactIds().length;
  return ({
    hub: '다음 장소 고르기',
    dig: `조각 찾기 ${state.found.length}/${total}`,
    study: `감별 ${state.codex.length}/${Math.max(1, state.found.length)}`,
    reconstruct: `원래 자리로 ${Object.keys(state.reconstruction).length}/${Math.max(1, state.codex.length)}`,
    cast: state.cast?.done ? `주조 완료 · 등급 ${state.cast.grade}` : '밀랍주조 공정 진행',
    talk: `사유의 이야기 ${state.talked.length}/${Math.max(1, state.codex.length)}`,
    rivalIntro: '수집가에게 대응하기'
  })[state.scene] || '복원 진행';
}

/* ---------- 다시 그린 뒤 포커스 되돌리기 ----------
   장면은 innerHTML로 통째로 다시 그린다. 그대로 두면 키보드 포커스가 매번 문서 맨 앞으로 날아가,
   발굴장에서 Enter 한 번마다 Tab으로 다시 찾아와야 했다. 같은 data-* 값을 가진 요소로 되돌린다. */
const FOCUS_KEYS = ['cell', 'stage', 'use', 'answer', 'study', 'piece', 'zone', 'talk', 'option', 'choice', 'repair', 'hub'];
function focusKey() {
  const el = document.activeElement, scene = $('#scene');
  if (!el || el === scene || !scene.contains(el)) return null;
  for (const k of FOCUS_KEYS) {
    if (el.dataset?.[k] !== undefined) return `[data-${k}="${CSS.escape(el.dataset[k])}"]`;
  }
  return el.id ? `#${CSS.escape(el.id)}` : '';
}
function restoreFocus(key) {
  const scene = $('#scene');
  const el = key ? scene.querySelector(key) : null;
  (el && !el.disabled ? el : scene).focus({ preventScroll: true });
}

function render() {
  const key = focusKey();
  updateChrome();
  const fn = views[state.scene] || views.intro;
  $('#scene').innerHTML = fn();
  binds[state.scene]?.();
  if (key !== null && !$('#modal').open) restoreFocus(key);
  save();
}

/* ---------- 모달 ---------- */
let afterModal = null;
function modal(html, after = null) {
  $('#modalBody').innerHTML = html;
  afterModal = after;
  if (!$('#modal').open) $('#modal').showModal();
}
function closeModal() {
  $('#modal').close();
  const fn = afterModal;
  afterModal = null;
  if (fn) fn();
  // 모달을 연 버튼이 그 사이 다시 그려져 사라졌다면 장면 처음으로
  if (document.activeElement === document.body) $('#scene').focus({ preventScroll: true });
}

hooks.render = render;
hooks.go = go;
hooks.modal = modal;
hooks.closeModal = closeModal;

/* ---------- 상단 컨트롤 ---------- */
$('#audioBtn').onclick = () => { state.audio = !state.audio; if (!state.audio) hush(); log('audio_toggle', { enabled: state.audio }); render(); };
$('#bgmBtn').onclick = () => { toggleBgm(); render(); };
$('#contrastBtn').onclick = () => { state.contrast = !state.contrast; log('contrast_toggle', { enabled: state.contrast }); render(); };
$('#helpBtn').onclick = () => modal(`
  <div class="help-sheet">
    <h2>조작법</h2>
    <ul>
      <li><kbd>Tab</kbd> 다음 조작 요소로 이동, <kbd>Enter</kbd> 또는 <kbd>Space</kbd>로 실행</li>
      <li><b>발굴장</b> 방향키로 칸을 옮기고 Enter로 붓질합니다. 한 칸은 토층 겹수만큼 쓸어야 드러납니다. 조사가 끝난 칸의 숫자는 맞닿은 여덟 칸에 묻힌 조각 수이고, 그 칸을 누르면 둘레 여덟 칸을 다시 비춰 줍니다.</li>
      <li><b>소리 단서</b> 손끝으로 블록 위를 끌거나 방향키로 옮기면 칸의 자리가 소리로 들립니다. 화면에서 위쪽 블록일수록 높은 음, 왼쪽 블록일수록 왼쪽 귀에서 납니다. 흙이 두꺼울수록 둔탁하고, 다 캔 숫자 칸은 조각 수만큼 한 번 더 두드립니다. 진동을 지원하는 기기(주로 Android)에서는 같은 단서가 진동으로도 옵니다.</li>
      <li><b>도움 단계</b> 처음에는 사유가 칸을 짚어 주고(안내), 조각을 찾으면 가까운 조각이 두근거리는 소리로만 알려 주고(힌트), 그다음에는 숫자만 읽습니다(자율). 언제든 단계를 직접 바꿀 수 있습니다.</li>
      <li><b>조사대</b> 도구를 눌러 판독 결과를 읽고, 그 결과에서 결론을 고릅니다. 틀려도 진행이 막히지 않습니다.</li>
      <li><b>주조소</b> 네 공정을 고릅니다. 쇳물 주입은 <kbd>Space</kbd>로 멈추거나, "직접 맞추기"로 온도를 입력할 수 있습니다.</li>
      <li><b>복원대</b> 드래그 대신 조각 선택 후 위치 버튼으로도 배치할 수 있습니다.</li>
    </ul>
    <p>캐릭터 음성은 상단에서 끌 수 있고, 모든 대사는 자막으로 함께 제공됩니다.</p>
  </div>`);
$('#homeBtn').onclick = () => { if (state.scene !== 'intro') go('hub'); };
$('#modalClose').onclick = closeModal;
$('#modal').addEventListener('cancel', e => { e.preventDefault(); closeModal(); });

/* ---------- 시작 ---------- */
Promise.all([
  fetch('data/artifacts.json').then(r => r.json()),
  fetch('data/dialogue.json').then(r => r.json()),
  fetch('data/casting.json').then(r => r.json()),
  fetch('study/questions.json').then(r => r.json())
]).then(([a, d, c, q]) => {
  data.artifacts = a; data.dialogue = d; data.casting = c; data.questions = q;
  load();
  render();
}).catch(err => {
  $('#scene').innerHTML = `<section class="panel"><h1>데이터를 불러오지 못했습니다</h1>
    <p>브라우저 설정 때문에 파일을 직접 열지 못했을 수 있습니다. 예비 방법으로 여세요 — Windows는 <code>run-windows.bat</code>, macOS·Linux는 <code>sh run.sh</code>(Python 3 필요).</p>
    <pre>${esc(err.message)}</pre></section>`;
});

if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => { if (state.scene === 'intro' && state.introPhase === 'setup') render(); };
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
window.addEventListener('pagehide', () => {
  if (data.artifacts) {
    state.logs.push({ time: new Date().toISOString(), elapsed_ms: Date.now() - state.startedAt, scene: state.scene, action: 'session_end' });
    save();
  }
});
