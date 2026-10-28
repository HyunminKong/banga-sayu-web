// 발굴 미니게임 — 붓질로 토층을 걷어내고 인접 단서로 조각 위치를 추론한다.
// 참조: Minecraft 1.20 고고학(솔로 수상한 모래를 점진적으로 공개, 꽝 아이템 혼재) + 마인스위퍼(인접 추론)
// 감각 단서: 손끝으로 블록 위를 끌거나 방향키로 옮기면 칸의 위치·남은 흙이 소리와 진동으로 온다(sense.js).
// 도움 단계: 안내(사유가 칸을 짚음) → 힌트(가까운 조각이 두근거림) → 자율(숫자만). 조각을 찾을 때마다 한 단계 오른다.
import {
  $, $$, esc, state, data, log, announce, art, junk, allArtifactIds, identified, order,
  sfx, burst, shake, toast, speak, speakRival, addAffection,
  focusBudget, focusLeft, spendFocus, restoreFocus, hooks, save
} from './core.js';
import * as sense from './sense.js';

const COLS = () => data.artifacts.grid.cols;
const ROWS = () => data.artifacts.grid.rows;
const CELLS = () => ROWS() * COLS();
const D = () => data.dialogue.dig;
const artifactAt = i => data.artifacts.grid.artifactCells[String(i)] || null;
const junkAt = i => data.artifacts.grid.junkCells[String(i)] || null;
const cellOf = id => Number(Object.keys(data.artifacts.grid.artifactCells).find(k => data.artifacts.grid.artifactCells[k] === id));
const rowOf = i => Math.floor(i / COLS());
const colOf = i => i % COLS();

function depthOf(i) {
  const a = artifactAt(i);
  if (a) return art(a).depth || 3;
  return junkAt(i) ? 2 : 1;
}
const strokesOn = i => state.strokes[String(i)] || 0;
const isOpen = i => strokesOn(i) >= depthOf(i);
const layersLeft = i => Math.max(0, depthOf(i) - strokesOn(i));
const limited = () => state.challengeMode === 'story';

function neighbors(i) {
  const cols = COLS(), r = rowOf(i), c = colOf(i), out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= ROWS() || cc >= cols) continue;
      out.push(rr * cols + cc);
    }
  }
  return out;
}
/** 인접 8칸의 유물 조각 수 — 마인스위퍼식 단서 */
const adjacency = i => neighbors(i).filter(artifactAt).length;

const remaining = () => allArtifactIds().filter(id => !state.found.includes(id) && state.stolenArtifact !== id);
const pendingStudy = () => state.found.some(id => !identified(id));
/** 수집가도 이미 다녀갔고, 감별로 회복할 조각도 없는데 집중력이 0 — 쉬어 가기만 남은 상태 */
const stuck = () => limited() && focusLeft() <= 0 && remaining().length > 0
  && state.rivalOutcome && state.rivalOutcome !== 'stole' && !pendingStudy();

/** 남은 조각까지의 체비쇼프 거리 — 힌트 단계의 두근거림에 쓴다 */
function nearest(i) {
  const r = rowOf(i), c = colOf(i);
  return remaining().reduce((m, id) => {
    const k = cellOf(id);
    return Math.min(m, Math.max(Math.abs(rowOf(k) - r), Math.abs(colOf(k) - c)));
  }, Infinity);
}

/** 아이소 화면에서 앞줄(아래·오른쪽·대각선 앞)의 더 높은 블록에 윗면이 가려지는지 */
function hiddenBehind(i) {
  const r = rowOf(i), c = colOf(i), mine = layersLeft(i);
  return [[1, 0], [0, 1], [1, 1]].some(([dr, dc]) => {
    const rr = r + dr, cc = c + dc;
    return rr < ROWS() && cc < COLS() && layersLeft(rr * COLS() + cc) > mine;
  });
}

/** 안내 단계에서 사유가 짚어 주는 칸: 먼저 조각 옆 빈칸(가려지지 않고 앞쪽에 있는 칸), 그 숫자를 본 뒤에는 조각 자리 */
function guideTarget() {
  const id = remaining()[0];
  if (!id) return null;
  const a = cellOf(id), around = neighbors(a);
  if (around.some(isOpen)) return isOpen(a) ? null : a;
  const plain = around.filter(i => !artifactAt(i) && !junkAt(i))
    .sort((x, y) => hiddenBehind(x) - hiddenBehind(y) || (rowOf(y) + colOf(y)) - (rowOf(x) + colOf(x)));
  return plain[0] ?? a;
}

function cellLabel(i) {
  const row = rowOf(i) + 1, col = colOf(i) + 1;
  if (!isOpen(i)) return `${row}행 ${col}열, 토층 ${layersLeft(i)}겹 남음`;
  const a = artifactAt(i);
  if (a) return `${row}행 ${col}열, ${art(a).name} 발견`;
  const j = junkAt(i);
  if (j) return `${row}행 ${col}열, ${junk(j).name}`;
  return `${row}행 ${col}열, 조사 완료. 인접한 조각 ${adjacency(i)}개. 누르면 둘레 여덟 칸을 보여 줍니다`;
}

// 아이소메트릭 2:1 타일 — 윗면 마름모 + 좌/우 벽면으로 큐브 하나를 그린다.
// 남은 층수가 큐브 높이가 되므로, 캘수록 블록이 실제로 낮아진다.
const TW = 96, TH = 48, LAYER = 21;

function cellFaces(i) {
  if (isOpen(i)) {
    const a = artifactAt(i);
    if (a) return `<span class="f-top" aria-hidden="true"><span class="cell-find artifact">${art(a).icon}</span></span>`;
    const j = junkAt(i);
    if (j) return `<span class="f-top" aria-hidden="true"><span class="cell-find junk">${junk(j).icon}</span></span>`;
    const n = adjacency(i);
    return `<span class="f-top" aria-hidden="true"><span class="cell-clue n${n}">${n || '·'}</span></span>`;
  }
  const done = strokesOn(i);
  return `<span class="f-left" aria-hidden="true"></span>
          <span class="f-right" aria-hidden="true"></span>
          <span class="f-top" aria-hidden="true">
            <span class="block-face"></span>
            <span class="block-crack" data-crack="${done}"></span>
            <span class="block-depth">${layersLeft(i)}</span>
          </span>`;
}

// 키보드는 격자 전체를 Tab 한 번으로 들어가 방향키로 옮긴다(로빙 tabindex).
let cursor = null;
const currentCell = () => (cursor !== null && cursor < CELLS() ? cursor : 0);

function grid() {
  const cols = COLS(), rows = ROWS();
  // 가장 높은 블록이 위로 잘리지 않도록 여유를 둔다
  const maxH = 3 * LAYER;
  const width = (rows + cols) * (TW / 2);
  const height = (rows + cols) * (TH / 2) + TH + maxH;
  const originX = (rows - 1) * (TW / 2);
  const guide = state.digStage === 0 ? guideTarget() : null;
  const focusAt = currentCell();

  const cells = Array.from({ length: rows * cols }, (_, i) => {
    const r = rowOf(i), c = colOf(i);
    const open = isOpen(i), a = artifactAt(i), j = junkAt(i);
    const layers = open ? 0 : layersLeft(i);
    const h = layers * LAYER;
    const x = originX + (c - r) * (TW / 2);
    const y = maxH + (c + r) * (TH / 2) - h;
    const cls = ['soil', open ? 'open' : 'buried',
                 open && a ? 'has-artifact' : '', open && j ? 'has-junk' : '',
                 i === guide ? 'guide' : ''].filter(Boolean).join(' ');
    return `<button class="${cls}" data-cell="${i}" data-left="${layers}" tabindex="${i === focusAt ? 0 : -1}"
              style="--x:${x}px; --y:${y}px; --h:${h}px; z-index:${r + c}"
              aria-label="${esc(cellLabel(i))}">${cellFaces(i)}</button>`;
  }).join('');

  return `<div class="iso-field" data-w="${width}" style="--tw:${TW}px; --th:${TH}px; width:${width}px; height:${height}px">${cells}</div>`;
}

/* ---------- 사유의 짧은 안내 ---------- */
let coachMsg = '';
function coach(text) {
  coachMsg = text;
  announce(text);
  speak(text);
}
const fill = (text, n) => text.replaceAll('{n}', String(n));

function stageRow() {
  const stages = D().stages;
  return `<div class="dig-stage" role="group" aria-label="도움 단계">
    <span class="dig-stage-label">도움 단계</span>
    ${stages.map((s, i) => `<button class="stage-chip" data-stage="${i}" aria-pressed="${state.digStage === i}">${esc(s.name)}</button>`).join('')}
    <small>${esc(stages[state.digStage].desc)}</small>
  </div>`;
}

function focusHelp() {
  if (focusLeft() > 0 || !remaining().length || state.rivalOutcome === 'stole') return '';
  if (stuck()) return `<p class="focus-help">${esc(D().stuck)}</p><button class="btn primary" id="restBtn">${esc(D().restButton)}</button>`;
  if (pendingStudy()) return `<p class="focus-help">${esc(D().noFocusStudy)}</p>`;
  return '';
}

export function view() {
  const total = allArtifactIds().length, got = state.found.length;
  const left = focusLeft(), budget = focusBudget();
  const pct = Math.round((got / total) * 100);
  const focusPct = limited() ? Math.round((left / budget) * 100) : 100;
  const focusRow = limited()
    ? `<div class="focus-bar ${left <= 6 ? 'low' : ''}">
         <div class="row"><b>집중력 ${left} / ${budget}</b><small>붓질 1회에 1 소모 · 감별에 성공하면 3 회복</small></div>
         <div class="meter" role="meter" aria-label="남은 집중력" aria-valuemin="0" aria-valuemax="${budget}" aria-valuenow="${left}"><i style="--p:${focusPct}%"></i></div>
         ${focusHelp()}
       </div>`
    : `<div class="focus-bar calm"><div class="row"><b>차분한 감상 모드</b><small>집중력 제한 없이 원하는 만큼 붓질할 수 있습니다.</small></div></div>`;
  const line = coachMsg || (state.digStage === 0 && remaining().length ? D().guide : '');

  return `
    <header class="scene-head">
      <div class="eyebrow">MINIGAME 1 · 발굴</div>
      <h1>흙을 쓸어내기</h1>
      <p>마인크래프트처럼 <b>블록을 한 겹씩 캐냅니다</b>. 블록 위의 숫자는 남은 층수이고, 다 캐낸 자리에 뜨는 숫자는 <b>맞닿은 여덟 칸에 묻힌 조각 수</b>입니다. 그 숫자를 읽으면 아무 데나 파지 않아도 됩니다.</p>
    </header>
    ${focusRow}
    <div class="dig-layout">
      <section class="panel dig-panel">
        <div class="row"><b>발견한 조각 ${got}/${total}</b><span>조사한 칸 ${Object.keys(state.strokes).filter(k => isOpen(Number(k))).length}/${CELLS()}</span></div>
        <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${got}" aria-label="발견한 조각"><i style="--p:${pct}%"></i></div>
        ${stageRow()}
        ${line ? `<p class="dig-coach"><span class="fiction-label">사유</span>${esc(line)}</p>` : ''}
        <div class="iso-stage"><div class="dig-grid" role="group" aria-label="${ROWS()}행 ${COLS()}열 발굴지. 방향키로 칸을 옮기고 Enter 또는 Space로 캡니다.">${grid()}</div></div>
        <p class="dig-guide">방향키로 블록을 옮기고 <kbd>Enter</kbd> 또는 <kbd>Space</kbd>로 캡니다. 손끝으로 블록 위를 끌면 <b>칸의 자리가 소리로</b> 들립니다 — 화면 위쪽 블록일수록 높은 음, 왼쪽 블록일수록 왼쪽 귀. 흙이 두꺼울수록 소리가 둔탁합니다. 다 캔 칸을 누르면 둘레 여덟 칸을 다시 보여 줍니다.</p>
        <div class="actions"><button class="btn secondary" id="ruleBtn">숫자 규칙 다시 듣기</button></div>
      </section>
      <aside class="panel">
        <h2>발견 기록</h2>
        <div class="collection">
          ${data.artifacts.artifacts.map(a => state.found.includes(a.id)
            ? `<div class="found-card"><span class="artifact-icon">${a.icon}</span><span><b>${esc(a.name)}</b><small>${state.codex.includes(a.id) ? '감별 완료' : '감별 필요'}</small></span></div>`
            : `<div class="empty-slot">${state.stolenArtifact === a.id ? '수집가가 가져간 조각' : '아직 흙 속에 있음'}</div>`).join('')}
        </div>
        ${state.junkFound.length ? `<h2 class="mt">함께 나온 것들</h2><div class="junk-list">${state.junkFound.map(id => `<div class="junk-card"><b>${junk(id).icon} ${esc(junk(id).name)}</b><small>${esc(junk(id).fact)}</small></div>`).join('')}</div>` : ''}
        <div class="actions">
          ${state.found.length ? `<button class="btn primary" id="toStudy">조사대로 가기 (${state.found.filter(id => !state.codex.includes(id)).length}개 대기)</button>` : ''}
          <button class="btn secondary" id="backHub">캠프로 돌아가기</button>
        </div>
      </aside>
    </div>`;
}

/** 발굴장을 떠날 때 — 지난 안내가 다음 방문에 남지 않게 */
export function leave() { coachMsg = ''; }

/* ---------- 도움 단계 ---------- */
function setStage(n, auto) {
  if (n === state.digStage) return;
  state.digStage = n;
  log('dig_stage', { stage: n, auto });
  const s = D().stages[n];
  if (auto) toast(`도움 단계가 '${s.name}'(으)로 바뀌었습니다. ${s.desc}`);
}
/** 조각을 찾을 때마다 한 단계씩 손을 뗀다. 플레이어가 직접 고른 뒤에는 건드리지 않는다. */
function advanceStage() {
  if (state.digStageManual) return;
  const target = Math.min(2, state.found.length);
  if (target > state.digStage) setStage(target, true);
}

/* ---------- 붓질 ---------- */
function brush(i, el) {
  if (isOpen(i)) { inspect(i); return; }
  if (limited() && focusLeft() <= 0) { outOfFocus(); return; }
  const key = String(i);
  const before = layersLeft(i);
  state.strokes[key] = strokesOn(i) + 1;
  if (limited()) spendFocus(1);
  log('brush_stroke', { cell_id: i, strokes: state.strokes[key], depth: depthOf(i), focus_left: focusLeft() });
  coachMsg = '';
  const where = { row: rowOf(i), col: colOf(i), rows: ROWS(), cols: COLS() };

  if (!isOpen(i)) {
    sense.brush({ ...where, left: before });
    burst(el, '·', 4);
    announce(`붓질. 토층 ${layersLeft(i)}겹 남음`);
    hooks.render();
    if (limited() && focusLeft() <= 0 && remaining().length) outOfFocus();
    return;
  }

  sense.brush({ ...where, left: before });
  const a = artifactAt(i), j = junkAt(i);
  if (a && !state.found.includes(a)) {
    state.found.push(a);
    log('artifact_found', { artifact_id: a, focus_used: state.focusUsed });
    advanceStage();
    sfx('found'); burst(el, '✦', 16);
    announce(`${art(a).name} 발견`);
    hooks.render();
    revealFind(art(a).name, `${art(a).brief} 조사대에서 도구로 감별해 주세요.`, art(a).icon, 'artifact');
    speak(`${art(a).name}을 찾았어. 바로 답을 보지 말고 조사대에서 직접 살펴봐 줘.`);
  } else if (a) {
    sense.floor(where);
    announce(`${art(a).name} 자리. 이미 되찾은 조각입니다.`);
    hooks.render();
  } else if (j) {
    if (!state.junkFound.includes(j)) state.junkFound.push(j);
    log('junk_found', { junk_id: j });
    sfx('dig'); burst(el, junk(j).icon, 8);
    announce(`${junk(j).name} 발견`);
    hooks.render();
    revealFind(junk(j).name, junk(j).fact, junk(j).icon, 'junk');
  } else {
    const n = adjacency(i);
    sense.clue({ n, ...where });
    // 숫자 규칙은 설명문을 놓치면 숨은 어포던스가 된다 — 처음 숫자가 뜨는 순간 그 자리에서 알려 준다
    if (!state.coach.clue) {
      state.coach.clue = true;
      log('coach_shown', { kind: 'clue', cell_id: i, n });
      coach(fill(n ? D().clue : D().clueZero, n));
    } else announce(`조사 완료. 인접한 조각 ${n}개`);
    hooks.render();
    glow(i);
  }
  if (limited() && focusLeft() <= 0 && remaining().length) outOfFocus();
}

/** 다 캔 칸을 누르면 — 둘레 8칸을 비추고, 조각 수만큼 소리·진동으로 두드린다 */
function inspect(i) {
  const where = { row: rowOf(i), col: colOf(i), rows: ROWS(), cols: COLS() };
  const label = cellLabel(i);
  log('clue_inspect', { cell_id: i });
  if (artifactAt(i) || junkAt(i)) sense.floor(where);
  else sense.clue({ n: adjacency(i), ...where });
  announce(label);
  glow(i);
}

function glow(i) {
  requestAnimationFrame(() => {
    const els = [i, ...neighbors(i)].map(k => document.querySelector(`[data-cell="${k}"]`)).filter(Boolean);
    els.forEach((el, n) => el.classList.add(n ? 'near' : 'origin'));
    setTimeout(() => els.forEach(el => el.classList.remove('near', 'origin')), 1800);
  });
}

/** 손끝으로 끌거나 방향키로 옮길 때 — 칸의 자리와 흙을 소리로, 힌트 단계면 조각과의 거리도 */
function explore(i) {
  const where = { row: rowOf(i), col: colOf(i), rows: ROWS(), cols: COLS() };
  if (!isOpen(i)) {
    sense.cell({ ...where, left: layersLeft(i) });
    if (state.digStage === 1) {
      const d = nearest(i);
      sense.heartbeat(d <= 1 ? 2 : d === 2 ? 1 : 0, where);
    }
  } else if (artifactAt(i) || junkAt(i)) sense.floor(where);
  else sense.clue({ n: adjacency(i), ...where });
}

function revealFind(title, body, icon, kind) {
  hooks.modal(`
    <div class="find-reveal ${kind}">
      <div class="find-icon" aria-hidden="true">${icon}</div>
      <div>
        <div class="eyebrow">${kind === 'artifact' ? '유물 조각 발견' : '함께 나온 흔적'}</div>
        <h2>${esc(title)}</h2>
        <p>${esc(body)}</p>
      </div>
    </div>`);
}

/* ---------- 집중력 소진 → 수집가가 조각을 가져간다 ---------- */
function outOfFocus() {
  if (state.rivalOutcome === 'stole') { duel(state.stolenArtifact); return; }
  if (state.rivalOutcome) {
    // 예전에는 여기서 아무 반응 없이 붓질이 무시됐다
    toast(stuck() ? D().stuck : D().noFocusStudy);
    hooks.render();
    return;
  }
  if (!remaining().length) return;
  const target = remaining()[0];
  state.stolenArtifact = target;
  state.rivalOutcome = 'stole';
  log('rival_stole', { artifact_id: target });
  sfx('rival'); shake();
  hooks.render();
  duel(target);
  speakRival(data.dialogue.rival.steal);
}

function duel(id) {
  const a = art(id);
  const r = a.readings.lens;
  hooks.modal(`
    <div class="rival-duel">
      <img src="Tae.png" alt="플레이어 앞을 막아선 ${esc(data.dialogue.rival.name)}(${esc(data.dialogue.rival.role)})">
      <div>
        <div class="eyebrow">수집가 등장 · 집중력 소진</div>
        <h2>${esc(a.name)}을 가져갔습니다</h2>
        <p class="fiction">“${esc(data.dialogue.rival.steal)}”</p>
        <p class="duel-reading">${esc(r.text)}</p>
        <p><b>${esc(r.question)}</b></p>
        <div class="choices">${order(`duel:${id}`, r.choices.length).map(i => `<button class="choice" data-duel="${i}">${esc(r.choices[i])}</button>`).join('')}</div>
        <p id="duelStatus" role="status"></p>
      </div>
    </div>`);
  $$('[data-duel]').forEach(btn => {
    btn.onclick = () => {
      const correct = Number(btn.dataset.duel) === r.answer;
      log('rival_duel_attempt', { artifact_id: id, correct });
      if (!correct) {
        sfx('wrong'); shake();
        $('#duelStatus').textContent = data.dialogue.rival.duelFail;
        speakRival(data.dialogue.rival.duelFail);
        return;
      }
      if (!state.found.includes(id)) state.found.push(id);
      // 되찾은 조각의 칸은 바로 드러낸다. 덮인 채로 두면 다시 캐서 같은 조각을 두 번 얻었다.
      const k = cellOf(id);
      state.strokes[String(k)] = depthOf(k);
      state.stolenArtifact = null;
      state.rivalOutcome = 'recovered';
      addAffection(6, 'duel_won');
      advanceStage();
      sfx('correct'); save();
      $('#modalBody').innerHTML = `
        <div class="duel-win">
          <div class="eyebrow">조각 회수</div>
          <h2>관찰로 되찾았습니다 · 호감도 +6</h2>
          <p class="fiction">“${esc(data.dialogue.rival.duelWin)}”</p>
          <p>${esc(r.fact)}</p>
        </div>`;
      hooks.render();
      speak('내 모습을 제대로 봐 줘서 되찾았어. 고마워.');
    };
  });
}

/* ---------- 화면 폭에 맞추기 ---------- */
// 격자는 픽셀 좌표로 그리므로, 좁은 화면에서는 통째로 줄여 가로 스크롤 없이 한눈에 보이게 한다.
function fitField() {
  const stage = document.querySelector('.iso-stage'), field = document.querySelector('.iso-field');
  if (!stage || !field) return;
  const w = Number(field.dataset.w) || field.offsetWidth;
  field.style.zoom = String(Math.min(1, (stage.clientWidth - 4) / w));
}
window.addEventListener('resize', fitField);

/* ---------- 키보드 · 손끝 ---------- */
function moveFocus(from, dr, dc) {
  const cols = COLS(), r = rowOf(from) + dr, c = colOf(from) + dc;
  if (r < 0 || c < 0 || r >= ROWS() || c >= cols) return;
  const i = r * cols + c;
  const next = document.querySelector(`[data-cell="${i}"]`);
  if (!next) return;
  $$('[data-cell]').forEach(b => { b.tabIndex = -1; });
  next.tabIndex = 0;
  cursor = i;
  next.focus();
  explore(i);
}

let pointerId = null, dragged = false, lastCell = null, suppressClick = false;
function cellAtPoint(x, y) {
  const el = document.elementFromPoint(x, y)?.closest?.('[data-cell]');
  return el ? Number(el.dataset.cell) : null;
}

function bindExplore(field) {
  field.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointerId = e.pointerId; dragged = false;
    lastCell = cellAtPoint(e.clientX, e.clientY);
  });
  field.addEventListener('pointermove', e => {
    // 끄는 동안에는 늘, 마우스를 그냥 올려 둘 때는 힌트 단계에서만 소리를 낸다
    const hover = e.pointerType === 'mouse' && pointerId === null && state.digStage === 1;
    if (e.pointerId !== pointerId && !hover) return;
    const i = cellAtPoint(e.clientX, e.clientY);
    if (i === null || i === lastCell) return;
    if (!hover) dragged = true;
    lastCell = i;
    explore(i);
  });
  const end = e => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    if (dragged) {
      if (!state.coach.explore) { state.coach.explore = true; log('explore_drag'); }
      // 끌어서 살펴본 손을 떼는 것은 붓질이 아니다
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
    }
  };
  field.addEventListener('pointerup', end);
  field.addEventListener('pointercancel', end);
  field.addEventListener('pointerleave', () => { if (pointerId === null) lastCell = null; });
}

export function bind() {
  $$('[data-cell]').forEach(btn => {
    const i = Number(btn.dataset.cell);
    btn.onclick = e => {
      if (suppressClick) { suppressClick = false; return; }
      cursor = i;
      brush(i, e.currentTarget);
    };
    btn.onfocus = () => { cursor = i; };
    btn.onkeydown = e => {
      const map = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (map[e.key]) { e.preventDefault(); moveFocus(i, ...map[e.key]); }
    };
  });
  const field = $('.iso-field');
  if (field) { bindExplore(field); fitField(); }

  $$('[data-stage]').forEach(b => b.onclick = () => {
    state.digStageManual = true;
    setStage(Number(b.dataset.stage), false);
    hooks.render();
  });
  $('#ruleBtn')?.addEventListener('click', () => {
    log('rule_replay');
    coach(D().rule);
    hooks.render();
  });
  $('#restBtn')?.addEventListener('click', () => {
    restoreFocus(D().restAmount);
    log('focus_rest', { amount: D().restAmount });
    coachMsg = D().rest;
    speak(D().rest);
    hooks.render();
  });
  $('#toStudy')?.addEventListener('click', () => hooks.go('study'));
  $('#backHub')?.addEventListener('click', () => { coachMsg = ''; hooks.go('hub'); });
  if (state.stolenArtifact && state.rivalOutcome === 'stole') duel(state.stolenArtifact);
}
