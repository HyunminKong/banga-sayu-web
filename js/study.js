// 감별 미니게임 — 3지선다 퀴즈 대신 실제 박물관 조사 도구로 정보를 얻고 결론을 내린다.
// 확대경(형태) · 감마선 촬영(내부 구조) · XRF(재질). 세 판독을 마치면 도감에 등록된다.
import {
  $, $$, esc, state, data, log, announce, art, tool, allArtifactIds, order,
  sfx, burst, toast, speak, addAffection, restoreFocus, identified, hooks, save
} from './core.js';
import { SAY } from './lines.js';

const TOOLS = () => data.artifacts.tools;
function slot(id, toolId) {
  state.readings[id] = state.readings[id] || {};
  state.readings[id][toolId] = state.readings[id][toolId] || { used: false, tries: 0, correct: false, resolved: false };
  return state.readings[id][toolId];
}
const resolvedCount = id => TOOLS().filter(t => state.readings[id]?.[t.id]?.resolved).length;

export function view() {
  const found = data.artifacts.artifacts.filter(a => state.found.includes(a.id));
  const pending = found.filter(a => !identified(a.id));
  const active = state.activeStudy && found.some(a => a.id === state.activeStudy) ? state.activeStudy : null;

  if (!found.length) {
    return `
      <header class="scene-head">
        <div class="eyebrow">MINIGAME 2 · 감별</div>
        <h1>조사대</h1>
        <p>아직 조사할 조각이 없습니다. 먼저 발굴장에서 조각을 찾아 주세요.</p>
      </header>
      <div class="actions"><button class="btn primary" id="toDig">발굴장으로</button><button class="btn secondary" id="backHub">캠프로</button></div>`;
  }

  if (active) return bench(art(active));

  return `
    <header class="scene-head">
      <div class="eyebrow">MINIGAME 2 · 감별</div>
      <h1>어떤 조각을 조사할까요?</h1>
      <p>도구 세 개로 직접 읽어 내는 과정입니다. 설명을 먼저 보여 주지 않습니다. 판독에 성공하면 집중력이 회복되고 사유의 이야기가 열립니다.</p>
    </header>
    <div class="study-select">
      ${found.map(a => {
        const done = identified(a.id), n = resolvedCount(a.id);
        return `<button class="study-card ${done ? 'done' : ''}" data-study="${a.id}">
          <span class="artifact-icon">${a.icon}</span>
          <span class="study-card-body">
            <b>${esc(a.name)}</b>
            <small>${done ? '감별 완료 · 다시 보기' : `판독 ${n}/${TOOLS().length}`}</small>
            <span class="pip-row" aria-hidden="true">${TOOLS().map(t => `<i class="${state.readings[a.id]?.[t.id]?.resolved ? 'on' : ''}">${t.icon}</i>`).join('')}</span>
          </span>
        </button>`;
      }).join('')}
    </div>
    <div class="actions">
      ${pending.length ? '' : '<button class="btn primary" id="toCast">주조소로 가기</button>'}
      <button class="btn secondary" id="toDig">발굴장으로</button>
      <button class="btn secondary" id="backHub">캠프로</button>
    </div>`;
}

function bench(a) {
  const done = identified(a.id);
  return `
    <header class="scene-head">
      <div class="eyebrow">조사대 · ${esc(a.name)}</div>
      <h1>도구를 골라 직접 읽어 보세요</h1>
      <p>세 도구는 서로 다른 것을 알려 줍니다. 판독 결과를 보고 결론을 고르면 됩니다. 틀려도 진행은 막히지 않습니다.</p>
    </header>
    <div class="bench-layout">
      <section class="bench-stage">
        <div class="artifact-crop" role="img" aria-label="전체 이미지에서 확대한 ${esc(a.name)}"
             style="background-image:url('${data.artifacts.work.image}');background-position:${a.crop}"></div>
        <div class="bench-progress" role="status">판독 ${resolvedCount(a.id)} / ${TOOLS().length}${done ? ' · 감별 완료' : ''}</div>
      </section>
      <div class="bench-tools">
        ${TOOLS().map(t => {
          const s = slot(a.id, t.id);
          return `<section class="tool-card ${s.resolved ? 'resolved' : ''} ${s.used ? 'used' : ''}">
            <header><span class="tool-icon" aria-hidden="true">${t.icon}</span><div><b>${esc(t.name)}</b><small>${esc(t.label)}</small></div>${s.resolved ? '<span class="tool-badge">판독 완료</span>' : ''}</header>
            <div class="tool-body" id="tool-${t.id}">
              ${s.used ? readingBlock(a, t, s) : `<p class="tool-desc">${esc(t.desc)}</p><button class="btn secondary" data-use="${t.id}">${esc(t.name)} 사용</button>`}
            </div>
          </section>`;
        }).join('')}
      </div>
    </div>
    <div class="actions">
      ${done ? `<button class="btn primary" id="talkNow">사유와 이 조각에 대해 이야기하기</button>` : ''}
      <button class="btn secondary" id="studyBack">다른 조각 조사하기</button>
      <button class="btn secondary" id="backHub">캠프로</button>
    </div>`;
}

function readingBlock(a, t, s) {
  const r = a.readings[t.id];
  const head = `<div class="reading-out"><span class="eyebrow">판독 결과</span><p>${esc(r.text)}</p></div>`;
  if (s.resolved) {
    return `${head}<div class="reading-fact"><b>${esc(data.artifacts.work.factNote)}</b><p>${esc(r.fact)}</p></div>
            <p class="reading-pick">선택한 결론: ${esc(r.choices[r.answer])}${s.correct ? '' : ' (첫 시도에서는 다른 답을 골랐습니다)'}</p>`;
  }
  return `${head}
    <p class="reading-q"><b>${esc(r.question)}</b></p>
    <div class="choices">${order(`${a.id}:${t.id}`, r.choices.length).map(i => `<button class="choice" data-answer="${t.id}:${i}">${esc(r.choices[i])}</button>`).join('')}</div>
    <p class="reading-status" id="status-${t.id}" role="status">${s.tries ? `${s.tries}회 시도. 판독 결과를 다시 읽어 보세요.` : ''}</p>`;
}

function useTool(aId, toolId) {
  const s = slot(aId, toolId);
  s.used = true;
  log('tool_used', { artifact_id: aId, tool_id: toolId });
  sfx('tool');
  save();
  hooks.render();
  // 도구 버튼은 판독 결과로 바뀐다 — 키보드 포커스를 그 결과의 첫 보기로 옮긴다
  $(`#tool-${toolId} [data-answer]`)?.focus({ preventScroll: true });
  const r = art(aId).readings[toolId];
  announce(`${tool(toolId).name} 판독: ${r.text}`);
  speak(r.text);
}

function answer(aId, toolId, pick) {
  const a = art(aId), r = a.readings[toolId], s = slot(aId, toolId);
  s.tries++;
  const correct = pick === r.answer;
  log('reading_judgement', { artifact_id: aId, tool_id: toolId, correct, tries: s.tries });

  if (!correct && s.tries < 2) {
    sfx('wrong');
    const el = $(`#status-${toolId}`);
    if (el) el.textContent = '다시 보세요. 판독 결과 안에 답의 근거가 있습니다.';
    speak(SAY.retry);
    save();
    return;
  }

  s.resolved = true;
  s.correct = correct && s.tries === 1;
  sfx('correct');
  if (s.correct) addAffection(2, `reading_first_try:${toolId}`);
  save();
  hooks.render();
  ($('[data-use]') || $('#talkNow'))?.focus({ preventScroll: true });
  announce(`판독 완료. ${r.fact}`);
  speak(r.fact);

  if (identified(aId) && !state.codex.includes(aId)) register(aId);
}

function register(aId) {
  const a = art(aId);
  state.codex.push(aId);
  const firstTry = TOOLS().every(t => state.readings[aId][t.id].correct);
  const gain = addAffection(firstTry ? 12 : 8, 'identification_complete');
  if (state.challengeMode === 'story') restoreFocus(3);
  log('codex_unlock', { artifact_id: aId, all_first_try: firstTry, codex_size: state.codex.length });
  sfx('grade');
  save();
  hooks.modal(`
    <div class="codex-unlock">
      <div class="eyebrow">도감 등록</div>
      <h2>${a.icon} ${esc(a.name)} 감별 완료</h2>
      <p>${esc(a.codex)}</p>
      <ul class="unlock-list">
        <li>호감도 +${gain}${firstTry ? ' (세 판독 모두 첫 시도 정답)' : ''}</li>
        ${state.challengeMode === 'story' ? '<li>집중력 +3 회복</li>' : ''}
        <li>사유의 전용 이야기 해금</li>
      </ul>
    </div>`, () => { hooks.render(); });
  speak(SAY.identified(a.name));
}

export function bind() {
  $$('[data-study]').forEach(btn => btn.onclick = () => {
    const id = btn.dataset.study;
    if (state.codex.includes(id)) log('revisit_artifact', { artifact_id: id, source: 'study_list' });
    state.activeStudy = id;
    log('study_open', { artifact_id: id });
    hooks.render();
  });

  const active = state.activeStudy;
  if (active) {
    $$('[data-use]').forEach(btn => btn.onclick = () => useTool(active, btn.dataset.use));
    $$('[data-answer]').forEach(btn => btn.onclick = () => {
      const [toolId, idx] = btn.dataset.answer.split(':');
      answer(active, toolId, Number(idx));
    });
    $('#studyBack')?.addEventListener('click', () => { state.activeStudy = null; hooks.render(); });
    $('#talkNow')?.addEventListener('click', () => { state.activeTalk = active; hooks.go('talk'); });
  }

  $('#toDig')?.addEventListener('click', () => hooks.go('dig'));
  $('#toCast')?.addEventListener('click', () => hooks.go('cast'));
  $('#backHub')?.addEventListener('click', () => { state.activeStudy = null; hooks.go('hub'); });
}
