// 서사 레이어 — 프롤로그, 수집가와의 조우, 도감 해금 대화, 엔딩.
// 호감도는 대화 선택보다 "관찰 정확도"에서 더 많이 오도록 배분했다.
import {
  $, $$, esc, state, data, log, announce, art, tier, allArtifactIds, order,
  sfx, burst, toast, speak, speakRival, addAffection, koreanVoices, canVibrate,
  toggleBgm, hooks, save, identified
} from './core.js';
import * as sense from './sense.js';

/* ---------- 설정 + 프롤로그 ---------- */
export function introView() {
  if (state.introPhase === 'setup') return setupView();
  const p = data.dialogue.prologue;
  const picked = p.choices.find(c => c.id === state.promiseChoice);
  const line = picked ? picked.response : p.greeting;
  return povStage({
    name: '사유',
    img: 'assets/character/sayu-reference-web.png',
    alt: '플레이어를 바라보며 턱을 괴고 앉은 사유 캐릭터',
    line,
    chapter: '조우 · 첫 만남',
    controls: picked
      ? `<button class="btn primary pov-continue" id="startBtn">약속하고 이야기 계속하기</button>`
      : `<p class="pov-hint">${esc(p.strokeHint)}</p>
         <div class="pov-choices" aria-label="대답 선택">${p.choices.map(c => `<button class="choice" data-promise="${esc(c.id)}">${esc(c.label)}</button>`).join('')}</div>`
  });
}

function setupView() {
  return `
    <header class="scene-head">
      <div class="eyebrow">GAME SETUP</div>
      <h1>이야기에 들어가기 전 준비</h1>
      <p>진행 방식과 소리, 화면을 먼저 고릅니다. 이야기 시작 후에는 1인칭 시점으로 진행됩니다.</p>
    </header>
    <section class="setup-screen">
      <img src="assets/character/sayu-reference-web.png" alt="이야기 속에서 만나게 될 사유 캐릭터">
      <div class="panel setup-card">
        <h2>플레이 설정</h2>
        <fieldset class="question">
          <legend>진행 방식</legend>
          <div class="radio-row">
            <label><input type="radio" name="challenge" value="story" ${state.challengeMode === 'story' ? 'checked' : ''}>
              스토리 모드 · 집중력이 제한되고 수집가가 조각을 노립니다</label>
            <label><input type="radio" name="challenge" value="calm" ${state.challengeMode === 'calm' ? 'checked' : ''}>
              차분한 감상 · 제한 없이 원하는 만큼 관찰합니다</label>
          </div>
        </fieldset>
        <label for="voiceSelect"><b>사유의 한국어 목소리</b></label>
        <select id="voiceSelect" class="select"><option value="">기기의 추천 한국어 음성</option></select>
        <div class="setup-toggles">
          <label><input id="setupAudio" type="checkbox" ${state.audio ? 'checked' : ''}> 캐릭터 음성</label>
          <label><input id="setupContrast" type="checkbox" ${state.contrast ? 'checked' : ''}> 고대비 화면</label>
          <label><input id="setupSfx" type="checkbox" ${state.sfx ? 'checked' : ''}> 효과음 · 소리 단서</label>
          <label><input id="setupHaptics" type="checkbox" ${state.haptics ? 'checked' : ''} ${canVibrate() ? '' : 'disabled'}> 진동</label>
        </div>
        <p class="setup-note">${canVibrate()
          ? '발굴장에서 칸의 자리와 흙의 두께를 소리와 진동으로 함께 알려 줍니다.'
          : '이 브라우저는 웹 진동을 지원하지 않습니다(iOS 등). 같은 단서를 소리로 알려 줍니다.'}</p>
        <div class="actions">
          <button class="btn secondary" id="voiceTest">🔊 목소리 시험</button>
          <button class="btn secondary" id="musicTest">${state.bgm ? '■ BGM 끄기' : '♫ BGM 미리 듣기'}</button>
        </div>
        <div class="control-card"><kbd>Tab</kbd><span>이동</span><kbd>방향키</kbd><span>발굴 격자</span><kbd>Enter</kbd><span>실행</span><kbd>Space</kbd><span>주입 정지</span></div>
        <button class="btn primary setup-enter" id="enterStory">설정 완료 · 이야기 속으로</button>
      </div>
    </section>`;
}

function povStage({ name, img, alt, line, controls, chapter = '', cls = '', alert = '' }) {
  return `
    <section class="pov-stage ${cls}" aria-label="${esc(name)}와의 1인칭 장면">
      <img src="${img}" alt="${esc(alt)}">
      <div class="pov-vignette"></div>
      ${alert ? `<div class="rival-alert">${esc(alert)}</div>` : ''}
      ${chapter ? `<div class="pov-chapter">${esc(chapter)}</div>` : ''}
      <div class="pov-bottom">
        <div class="pov-name">${esc(name)}</div>
        <div class="pov-dialogue" aria-live="polite">
          <span class="fiction-label">창작 캐릭터 대사</span>
          <p>“${esc(line)}”</p>
        </div>
        ${controls}
      </div>
    </section>`;
}

/**
 * 조우 장면의 쓰다듬기 — 목표도 실패도 없는 수동적 향유. 느린 손길일수록 따뜻한 소리·진동이 돌아온다.
 * 선택지 버튼 위에서는 반응하지 않는다.
 */
let strokeLogged = false;
function bindStroke() {
  const stage = $('.pov-stage');
  if (!stage || state.promiseChoice) return;
  let last = null;
  stage.addEventListener('pointermove', e => {
    if (e.target.closest('button, .pov-bottom')) { last = null; return; }
    if (e.pointerType !== 'mouse' && !e.pressure) return;
    const now = performance.now();
    if (last) {
      const dt = (now - last.t) / 1000;
      if (dt > 0) {
        const speed = Math.hypot(e.clientX - last.x, e.clientY - last.y) / dt;
        if (sense.stroke(speed) && !strokeLogged) { strokeLogged = true; log('stroke_slow', { px_per_sec: Math.round(speed) }); }
      }
    }
    last = { x: e.clientX, y: e.clientY, t: now };
  });
  stage.addEventListener('pointerleave', () => { last = null; });
}

function fillVoices() {
  const sel = $('#voiceSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">기기의 추천 한국어 음성</option>' +
    koreanVoices().map(v => `<option value="${esc(v.voiceURI)}" ${state.voiceURI === v.voiceURI ? 'selected' : ''}>${esc(v.name)}</option>`).join('');
}

export function introBind() {
  if (state.introPhase === 'setup') {
    fillVoices();
    $$('[name="challenge"]').forEach(r => r.onchange = () => { state.challengeMode = r.value; save(); });
    $('#voiceSelect').onchange = e => { state.voiceURI = e.target.value; save(); speak('이 목소리로 당신과 함께할게.'); };
    $('#setupAudio').onchange = e => { state.audio = e.target.checked; if (!state.audio) window.speechSynthesis?.cancel(); save(); hooks.render(); };
    $('#setupContrast').onchange = e => { state.contrast = e.target.checked; save(); hooks.render(); };
    $('#setupSfx').onchange = e => { state.sfx = e.target.checked; log('sfx_toggle', { enabled: state.sfx }); save(); };
    $('#setupHaptics').onchange = e => {
      state.haptics = e.target.checked;
      log('haptics_toggle', { enabled: state.haptics });
      save();
      sense.nearTouch();
    };
    $('#voiceTest').onclick = () => speak('나에 대해 알고 싶지 않아? 당신과 함께라면 잃어버린 기억도 찾을 수 있을 것 같아.');
    $('#musicTest').onclick = () => { toggleBgm(); hooks.render(); };
    $('#enterStory').onclick = () => {
      state.introPhase = 'story';
      log('story_enter', { challenge_mode: state.challengeMode, audio: state.audio, bgm: state.bgm, sfx: state.sfx, haptics: state.haptics });
      hooks.render();
      speak(data.dialogue.prologue.greeting);
      // 조우: 사유가 먼저 숨을 쉰다. 플레이어는 듣기만 해도 되는 수동 단계에서 시작한다.
      sense.breath();
    };
    return;
  }
  bindStroke();
  $$('[data-promise]').forEach(b => b.onclick = () => {
    const c = data.dialogue.prologue.choices.find(x => x.id === b.dataset.promise);
    state.promiseChoice = c.id;
    addAffection(c.affection, 'prologue_choice');
    log('prologue_choice', { option_id: c.id });
    sfx('correct'); hooks.render(); speak(c.response);
  });
  $('#startBtn')?.addEventListener('click', () => {
    log('session_start', { promise_choice: state.promiseChoice, challenge_mode: state.challengeMode });
    hooks.go('rivalIntro');
  });
}

/* ---------- 수집가와의 조우 ---------- */
export function rivalView() {
  const r = data.dialogue.rival, step = state.rivalStep || 0;
  if (step === 0) {
    return povStage({
      name: r.name, img: 'Tae.png', alt: '플레이어의 앞을 막아선 유물 수집가',
      line: r.steps[0], cls: 'rival-pov', alert: 'RIVAL ENCOUNTER',
      controls: `<button class="btn danger pov-continue" id="rivalNext">마주 선다</button>`
    });
  }
  if (step === 1) {
    return povStage({
      name: r.name, img: 'Tae.png', alt: '대답을 기다리는 유물 수집가',
      line: r.steps[1], cls: 'rival-pov',
      controls: `<div class="pov-choices rival-choices" aria-label="대답 선택">${r.choices.map(c => `<button class="choice" data-rival="${esc(c.id)}">${esc(c.label)}</button>`).join('')}</div>`
    });
  }
  if (step === 2) {
    const picked = r.choices.find(c => c.id === state.rivalChoice);
    return povStage({
      name: r.name, img: 'Tae.png', alt: '돌아서는 유물 수집가',
      line: picked.reply, cls: 'rival-pov',
      controls: `<button class="btn danger pov-continue" id="rivalNext">사유에게 돌아간다</button>`
    });
  }
  return povStage({
    name: '사유', img: 'assets/character/sayu-reference-web.png',
    alt: '걱정스럽게 플레이어를 바라보는 사유 캐릭터',
    line: r.sayuReturn, cls: 'sayu-return',
    controls: `<button class="btn primary pov-continue" id="toPretest">사전 질문으로</button>`
  });
}

export function rivalBind() {
  const r = data.dialogue.rival, step = state.rivalStep || 0;
  if (step === 0) {
    sfx('rival'); speakRival(r.steps[0]);
    $('#rivalNext').onclick = () => { state.rivalStep = 1; log('rival_advance', { step: 1 }); hooks.render(); };
    return;
  }
  if (step === 1) {
    speakRival(r.steps[1]);
    $$('[data-rival]').forEach(b => b.onclick = () => {
      const c = r.choices.find(x => x.id === b.dataset.rival);
      state.rivalChoice = c.id;
      addAffection(c.affection, 'rival_choice');
      state.rivalStep = 2;
      log('rival_choice', { option_id: c.id });
      hooks.render();
    });
    return;
  }
  if (step === 2) {
    speakRival(r.choices.find(c => c.id === state.rivalChoice).reply);
    $('#rivalNext').onclick = () => { state.rivalStep = 3; hooks.render(); };
    return;
  }
  speak(r.sayuReturn);
  $('#toPretest').onclick = () => hooks.go('pretest');
}

/* ---------- 해금 대화 ---------- */
export function talkView() {
  const open = state.codex.filter(id => data.dialogue.unlocked[id]);
  if (!open.length) {
    return `
      <header class="scene-head"><div class="eyebrow">대화</div><h1>아직 열린 이야기가 없습니다</h1>
      <p>조사대에서 조각을 감별하면 그 조각에 대한 사유의 이야기가 열립니다.</p></header>
      <div class="actions"><button class="btn primary" id="toStudy">조사대로</button><button class="btn secondary" id="backHub">캠프로</button></div>`;
  }
  const active = state.activeTalk && open.includes(state.activeTalk) ? state.activeTalk : null;
  if (!active) {
    return `
      <header class="scene-head">
        <div class="eyebrow">대화 · 호감도 ${state.affection}/100 · ${esc(tier().mood)}</div>
        <h1>어떤 조각에 대해 이야기할까요?</h1>
        <p>감별을 마친 조각마다 사유의 이야기가 하나씩 열립니다. 이미 나눈 이야기도 다시 들을 수 있습니다.</p>
      </header>
      <div class="talk-select">
        ${open.map(id => `<button class="talk-card ${state.talked.includes(id) ? 'done' : 'new'}" data-talk="${id}">
          <span class="artifact-icon">${art(id).icon}</span>
          <span><b>${esc(art(id).name)}</b><small>${state.talked.includes(id) ? '다시 듣기' : '새로운 이야기'}</small></span>
        </button>`).join('')}
      </div>
      <div class="actions"><button class="btn secondary" id="backHub">캠프로</button></div>`;
  }

  const d = data.dialogue.unlocked[active];
  const fb = state.talkFeedback?.id === active ? state.talkFeedback : null;
  // 몸으로 먼저 겪어 보는 장면(예: 손끝과 뺨 사이) — 진동이 없는 기기에서는 소리로만 전한다
  const body = d.embodied && !fb
    ? `<div class="pov-embodied"><p>${esc(d.embodied.cue)}</p><button class="btn secondary" id="embodiedBtn">✋ ${esc(d.embodied.button)}</button></div>`
    : '';
  return povStage({
    name: '사유', img: 'assets/character/sayu-reference-web.png',
    alt: '플레이어에게 질문하는 사유 캐릭터',
    line: fb ? fb.text : d.prompt,
    chapter: `${art(active).name} · 호감도 ${state.affection}`,
    controls: fb
      ? `<button class="btn primary pov-continue" id="talkNext">이야기 마치기${fb.gain ? ` · 호감도 +${fb.gain}` : ''}</button>`
      : `${body}<div class="pov-choices" aria-label="대답 선택">${order(`talk:${active}`, d.options.length).map(i => `<button class="choice" data-option="${esc(d.options[i].id)}">${esc(d.options[i].label)}</button>`).join('')}</div>
         <div class="pov-tools"><button class="btn secondary" id="replayTalk">🔊 다시 듣기</button><button class="btn secondary" id="talkBack">나중에</button></div>`
  });
}

export function talkBind() {
  $('#toStudy')?.addEventListener('click', () => hooks.go('study'));
  $('#backHub')?.addEventListener('click', () => { state.activeTalk = null; state.talkFeedback = null; hooks.go('hub'); });
  $$('[data-talk]').forEach(b => b.onclick = () => {
    const id = b.dataset.talk;
    if (state.talked.includes(id)) log('revisit_dialogue', { artifact_id: id });
    state.activeTalk = id; state.talkFeedback = null; hooks.render();
  });

  const active = state.activeTalk;
  if (!active || !data.dialogue.unlocked[active]) return;
  const d = data.dialogue.unlocked[active];

  if (state.talkFeedback?.id === active) {
    $('#talkNext').onclick = () => {
      state.talkFeedback = null; state.activeTalk = null; hooks.render();
    };
    return;
  }
  speak(d.prompt);
  $('#replayTalk')?.addEventListener('click', () => speak(d.prompt));
  $('#talkBack')?.addEventListener('click', () => { state.activeTalk = null; hooks.render(); });
  $('#embodiedBtn')?.addEventListener('click', () => {
    sense.nearTouch();
    log('embodied_cue', { artifact_id: active });
    announce(d.embodied.after);
    speak(d.embodied.after);
  });
  $$('[data-option]').forEach(b => b.onclick = () => {
    const o = d.options.find(x => x.id === b.dataset.option);
    // 호감도는 조각마다 처음 나눈 이야기에서만 오른다. 다시 듣기로 쌓이면 "대화 최대 35점" 설계가 무너진다.
    const first = !state.talked.includes(active);
    const gain = first ? addAffection(o.gain, `talk:${active}`) : 0;
    if (first) state.talked.push(active);
    state.talkFeedback = { id: active, text: o.response, gain };
    log('dialogue_choice', { artifact_id: active, option_id: o.id, affection_gain: gain, revisit: !first });
    sfx('correct'); hooks.render(); speak(o.response);
    $('#talkNext')?.focus({ preventScroll: true });
  });
}

/* ---------- 엔딩 ---------- */
export function endingKey() {
  const full = state.codex.length === allArtifactIds().length;
  const grade = state.cast?.grade;
  if (full && (grade === 'A' || grade === 'B') && state.affection >= 70) return 'true';
  if (state.affection >= 45) return 'good';
  return 'normal';
}

export function score(answers) {
  return data.questions.knowledge.reduce((s, q) => s + (Number(answers[q.id]) === q.answer ? 1 : 0), 0);
}
export function quizHTML(kind) {
  const answers = kind === 'pre' ? state.preAnswers : state.postAnswers;
  return `<div class="quiz-list">${data.questions.knowledge.map((q, i) => `
    <fieldset class="question">
      <legend>${i + 1}. ${esc(q.question)}</legend>
      <div class="radio-row">${order(`${kind}:${q.id}`, q.options.length).map(j =>
        `<label><input type="radio" name="${kind}-${q.id}" value="${j}" ${answers[q.id] == j ? 'checked' : ''}>${esc(q.options[j])}</label>`).join('')}</div>
    </fieldset>`).join('')}</div>`;
}
export function collectQuiz(kind) {
  const target = kind === 'pre' ? state.preAnswers : state.postAnswers;
  data.questions.knowledge.forEach(q => {
    const x = document.querySelector(`input[name="${kind}-${q.id}"]:checked`);
    if (x) target[q.id] = Number(x.value);
  });
  return Object.keys(target).length === data.questions.knowledge.length;
}
