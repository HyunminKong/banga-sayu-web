// 주조 미니게임 — "유물 만들기". 실제 밀랍주조 공정을 선택으로 재현한다.
// 근거: 국립중앙박물관 국보 78·83호 조사 — 밀랍법 기본, 분할주조법, 쇠못으로 속틀 고정,
// 83호는 속틀을 하나로 만들고 밀랍을 두껍게 입힌 뒤 깎아 조각 → 쇳물 유동성 저하 → 주조 결함 → 재주조·부분 주조 수리.
import {
  $, $$, esc, state, data, log, announce, clamp,
  sfx, burst, shake, toast, speak, addAffection, hooks, save
} from './core.js';
import * as sense from './sense.js';

const C = () => data.casting;
const METERS = ['detail', 'flow', 'stability'];
const reduceMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** B등급은 "결함을 수리한 완성"을 말하지만, 결함 없이 섬세도만 모자라 B가 되는 공정 조합도 있다 */
function gradeLines(c) {
  const g = C().grades[c.grade];
  const clean = c.defectsPeak === 0;
  return {
    text: clean && g.textNoDefect ? g.textNoDefect : g.text,
    sayu: clean && g.sayuNoDefect ? g.sayuNoDefect : g.sayu
  };
}

export function fresh() {
  return { stage: 0, choices: {}, meters: { ...C().start }, pourValue: null, pourResult: null, defects: 0, defectsPeak: 0, accepted: false, repairs: [], grade: null, done: false };
}
function cast() {
  if (!state.cast) state.cast = fresh();
  return state.cast;
}

/* ---------- 결함 · 등급 ---------- */
function computeDefects() {
  const m = cast().meters;
  let d = 0;
  if (m.flow < 40) d += Math.ceil((40 - m.flow) / 8);
  if (m.stability < 40) d += Math.ceil((40 - m.stability) / 10);
  if (cast().pourResult === 'hot') d += 1;
  return d;
}
/**
 * A는 "한 번도 결함이 없었던" 주조에만 준다. 수리로는 A에 닿을 수 없다 —
 * 국보 83호가 결함을 수리해 완성된 상이라는 사실을 등급 규칙 자체에 담았다.
 */
function gradeOf() {
  const c = cast(), m = c.meters;
  if (c.defectsPeak === 0 && m.detail >= 70) return 'A';
  if (c.defects >= 3 || m.detail < 45) return 'C';
  return 'B';
}

/* ---------- 미터 표시 ---------- */
function meterRow() {
  const m = cast().meters;
  return `<div class="cast-meters">${C().intro.meters.map(def => {
    const v = clamp(m[def.id], 0, 100);
    const warn = v < 40 ? 'warn' : v >= 70 ? 'good' : '';
    return `<div class="cast-meter ${warn}">
      <div class="row"><b>${esc(def.name)}</b><span>${v}</span></div>
      <div class="meter" role="meter" aria-label="${esc(def.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}"><i style="--p:${v}%"></i></div>
      <small>${esc(def.desc)}</small>
    </div>`;
  }).join('')}</div>`;
}

function stepRail(current) {
  const names = [...C().stages.map(s => s.name), C().pour.name, '완성'];
  return `<ol class="cast-rail" aria-label="주조 공정 진행">${names.map((n, i) =>
    `<li class="${i < current ? 'done' : i === current ? 'current' : ''}" ${i === current ? 'aria-current="step"' : ''}>${i < current ? '✓ ' : ''}${esc(n)}</li>`).join('')}</ol>`;
}

/* ---------- 화면 ---------- */
export function view() {
  const c = cast();
  if (c.done) return result();
  if (c.stage < C().stages.length) return stageView(C().stages[c.stage]);
  if (c.pourResult === null) return pourView();
  return repairView();
}

function stageView(stage) {
  const c = cast();
  const chosen = c.choices[stage.id];
  const opt = chosen ? stage.options.find(o => o.id === chosen) : null;
  return `
    <header class="scene-head">
      <div class="eyebrow">MINIGAME 3 · 주조 · 공정 ${stage.step}/4</div>
      <h1>${esc(stage.name)}</h1>
      <p>${esc(stage.prompt)}</p>
    </header>
    ${stepRail(c.stage)}
    ${meterRow()}
    <section class="panel cast-panel">
      <p class="cast-note">${esc(stage.note)}</p>
      ${opt ? `
        <div class="cast-outcome">
          <div class="eyebrow">선택: ${esc(opt.label)}</div>
          <div class="reading-fact"><b>${esc(data.artifacts.work.factNote)}</b><p>${esc(opt.fact)}</p></div>
          <p class="fiction">사유: “${esc(opt.sayu)}”</p>
          <div class="effect-row">${METERS.filter(k => opt.effects[k]).map(k => {
            const v = opt.effects[k], name = C().intro.meters.find(m => m.id === k).name;
            return `<span class="effect ${v > 0 ? 'up' : 'down'}">${esc(name)} ${v > 0 ? '+' : ''}${v}</span>`;
          }).join('')}</div>
          <div class="actions"><button class="btn primary" id="castNext">다음 공정으로</button></div>
        </div>`
      : `<div class="cast-options">${stage.options.map(o => `
          <button class="cast-option" data-choice="${esc(o.id)}">
            <b>${esc(o.label)}</b>
            <small>${esc(o.sub)}</small>
          </button>`).join('')}</div>`}
    </section>
    <div class="actions"><button class="btn secondary" id="backHub">캠프로 돌아가기</button></div>`;
}

function pourView() {
  const p = C().pour, c = cast();
  // 동작 줄이기를 켜면 바늘이 움직이지 않는다. 멈춤 버튼을 살려 두면 늘 "저온"으로 끝나므로 직접 맞추기만 남긴다.
  const still = reduceMotion();
  return `
    <header class="scene-head">
      <div class="eyebrow">MINIGAME 3 · 주조 · 공정 4/4</div>
      <h1>${esc(p.name)}</h1>
      <p>${esc(p.prompt)}</p>
    </header>
    ${stepRail(C().stages.length)}
    ${meterRow()}
    <section class="panel cast-panel">
      <p class="cast-note">${esc(p.note)}</p>
      <div class="pour-gauge" aria-hidden="true">
        <div class="pour-zone" style="--min:${p.zone.min}%;--max:${p.zone.max}%"></div>
        <i class="pour-needle" id="pourNeedle" style="--v:0%"></i>
        <div class="pour-scale"><span>저온</span><span>적정</span><span>과열</span></div>
      </div>
      <p class="pour-live" id="pourLive" role="status">${still ? '동작 줄이기 설정이 켜져 있어 눈금이 움직이지 않습니다. 아래에서 온도를 직접 맞추세요.' : '온도 상승 중'}</p>
      ${still ? '' : `<div class="actions">
        <button class="btn primary big" id="pourStop">여기서 멈춘다 <kbd>Space</kbd></button>
      </div>`}
      <details class="pour-alt" ${still ? 'open' : ''}>
        <summary>움직이는 눈금 대신 직접 맞추기</summary>
        <p>동작을 줄이고 싶거나 타이밍 조작이 어려우면 이 방법을 쓰세요. 결과는 동일하게 계산됩니다.</p>
        <label for="pourRange">쇳물 온도 (적정 구간 ${p.zone.min}–${p.zone.max})</label>
        <input id="pourRange" class="pour-range" type="range" min="0" max="100" value="50" step="1" aria-describedby="pourRangeOut">
        <output id="pourRangeOut" class="pour-range-out">50</output>
        <button class="btn secondary" id="pourManual">이 온도로 주입</button>
      </details>
      <p class="cast-guide">${esc(p.guide)}</p>
    </section>`;
}

function repairView() {
  const c = cast(), r = C().repair;
  if (c.defects <= 0 || c.accepted) return finishView();
  return `
    <header class="scene-head">
      <div class="eyebrow">MINIGAME 3 · 주조 · 수리</div>
      <h1>결함 ${c.defects}곳</h1>
      <p>${esc(r.prompt)}</p>
    </header>
    ${stepRail(C().stages.length + 1)}
    ${meterRow()}
    <section class="panel cast-panel">
      <div class="defect-row" aria-label="발견된 주조 결함 ${c.defects}곳">${'◍'.repeat(c.defects)}</div>
      <p class="cast-note">${esc(C().pour.results[c.pourResult].text)}</p>
      <div class="cast-options">${r.options.map(o => `
        <button class="cast-option" data-repair="${esc(o.id)}">
          <b>${esc(o.label)}</b>
          <small>${o.effects.defects ? `결함 ${o.effects.defects}곳` : '결함을 남긴다'}${o.effects.detail ? ` · 조형 섬세도 ${o.effects.detail}` : ''}</small>
        </button>`).join('')}</div>
      ${c.repairs.length ? `<div class="repair-log"><b>수리 기록</b><ul>${c.repairs.map(id => `<li>${esc(r.options.find(o => o.id === id).fact)}</li>`).join('')}</ul></div>` : ''}
    </section>`;
}

function finishView() {
  const c = cast();
  c.grade = gradeOf();
  return `
    <header class="scene-head">
      <div class="eyebrow">MINIGAME 3 · 주조 완료</div>
      <h1>거푸집을 깨 봅니다</h1>
      <p>선택한 공정의 결과가 그대로 나옵니다.</p>
    </header>
    ${stepRail(C().stages.length + 1)}
    <div class="actions"><button class="btn primary big" id="castReveal">거푸집 깨기</button></div>`;
}

function result() {
  const c = cast(), g = C().grades[c.grade], lines = gradeLines(c);
  return `
    <header class="scene-head">
      <div class="eyebrow">주조 결과 · ${esc(g.badge)}</div>
      <h1>${esc(g.title)}</h1>
      <p>${esc(lines.text)}</p>
    </header>
    <section class="cast-result grade-${c.grade}">
      <img class="restored" src="${data.artifacts.work.image}" alt="주조를 마친 금동 반가사유상">
      <div>
        <div class="grade-badge">${c.grade}</div>
        <p class="fiction">사유: “${esc(lines.sayu)}”</p>
        ${meterRow()}
        <ul class="result-list">
          <li>발생한 결함 ${c.defectsPeak}곳 · 남은 결함 ${c.defects}곳</li>
          <li>수리 ${c.repairs.filter(r => r !== 'keep').length}회${c.accepted ? ' · 남은 결함을 그대로 둠' : ''}</li>
          <li>쇳물 주입: ${esc(C().pour.results[c.pourResult].text)}</li>
        </ul>
      </div>
    </section>
    <section class="panel">
      <h2>내가 고른 공정</h2>
      <div class="choice-recap">${C().stages.map(s => {
        const o = s.options.find(x => x.id === c.choices[s.id]);
        return o ? `<div class="recap-card"><b>${esc(s.name)}</b><span>${esc(o.label)}</span><small>${esc(o.fact)}</small></div>` : '';
      }).join('')}</div>
    </section>
    <div class="actions">
      <button class="btn primary" id="toReconstruct">복원대로 가기</button>
      <button class="btn secondary" id="castAgain">공정을 바꿔 다시 주조</button>
      <button class="btn secondary" id="backHub">캠프로</button>
    </div>`;
}

/* ---------- 동작 ---------- */
function choose(stage, optId) {
  const c = cast(), o = stage.options.find(x => x.id === optId);
  c.choices[stage.id] = optId;
  METERS.forEach(k => { if (o.effects[k]) c.meters[k] = clamp(c.meters[k] + o.effects[k], 0, 100); });
  log('casting_choice', { stage: stage.id, option_id: optId, meters: { ...c.meters } });
  sfx('tool'); save(); hooks.render();
  $('#castNext')?.focus({ preventScroll: true });
  announce(`${o.label} 선택. ${o.fact}`);
  speak(o.sayu);
}

let raf = null, dir = 1, val = 0;
export function stopPour() { if (raf) cancelAnimationFrame(raf); raf = null; }

function startPour() {
  const needle = $('#pourNeedle');
  if (!needle || reduceMotion()) return;
  val = 0; dir = 1;
  let last = performance.now();
  const loop = now => {
    const dt = Math.min(48, now - last); last = now;
    val += dir * dt * 0.055;
    if (val >= 100) { val = 100; dir = -1; }
    if (val <= 0) { val = 0; dir = 1; }
    needle.style.setProperty('--v', `${val}%`);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

function resolvePour(value) {
  stopPour();
  const c = cast(), p = C().pour;
  c.pourValue = Math.round(value);
  let key;
  if (value >= p.zone.min && value <= p.zone.max) key = 'perfect';
  else if (value >= p.zone.min - p.near && value <= p.zone.max + p.near) key = 'near';
  else key = value < p.zone.min ? 'cold' : 'hot';
  c.pourResult = key;
  const eff = p.results[key];
  c.meters.flow = clamp(c.meters.flow + eff.flow, 0, 100);
  c.defects = computeDefects();
  c.defectsPeak = Math.max(c.defectsPeak || 0, c.defects);
  log('pour_result', { value: c.pourValue, result: key, flow: c.meters.flow, defects: c.defects });
  sense.sizzle();
  if (key === 'perfect') sfx('correct');
  if (c.defects) { sfx('defect'); shake(); log('defect_generated', { count: c.defects }); }
  save(); hooks.render();
  ($('[data-repair]') || $('#castReveal'))?.focus({ preventScroll: true });
  announce(`${eff.text} 결함 ${c.defects}곳.`);
  speak(c.defects ? `${eff.text} 결함이 ${c.defects}곳 생겼어. 수리할 수 있어.` : eff.text);
}

function repair(optId) {
  const c = cast(), o = C().repair.options.find(x => x.id === optId);
  if (optId === 'keep') {
    c.accepted = true;
  } else {
    c.defects = Math.max(0, c.defects + o.effects.defects);
    c.meters.detail = clamp(c.meters.detail + (o.effects.detail || 0), 0, 100);
  }
  c.repairs.push(optId);
  log('repair_performed', { option_id: optId, defects_left: c.defects, accepted: c.accepted });
  sfx('tool'); save(); hooks.render();
  ($('[data-repair]') || $('#castReveal'))?.focus({ preventScroll: true });
  announce(o.fact);
  speak(o.fact);
}

function reveal() {
  const c = cast();
  c.grade = gradeOf();
  c.done = true;
  const g = C().grades[c.grade];
  // 다시 주조해도 등급 호감도는 한 번만 — 더 높은 등급을 받으면 그 차이만큼만 더한다
  const gain = Math.max(0, g.affection - (state.castAffection || 0));
  if (gain) addAffection(gain, `casting_grade_${c.grade}`);
  state.castAffection = Math.max(state.castAffection || 0, g.affection);
  log('casting_complete', { grade: c.grade, defects_peak: c.defectsPeak, defects_left: c.defects, accepted: c.accepted, repairs: c.repairs.length, meters: { ...c.meters }, affection_gain: gain });
  sense.crack();
  sfx('grade');
  save(); hooks.render();
  $('#toReconstruct')?.focus({ preventScroll: true });
  burst($('.grade-badge'), '✦', 18);
  announce(`${g.badge}. ${g.title}`);
  speak(gradeLines(c).sayu);
}

export function bind() {
  const c = cast();
  $('#backHub')?.addEventListener('click', () => { stopPour(); hooks.go('hub'); });

  if (c.done) {
    $('#toReconstruct')?.addEventListener('click', () => hooks.go('reconstruct'));
    $('#castAgain')?.addEventListener('click', () => {
      if (!confirm('공정 선택을 처음부터 다시 할까요? 지금까지의 주조 결과는 기록에 남습니다.')) return;
      log('casting_restart', { previous_grade: c.grade });
      state.cast = fresh(); save(); hooks.render();
    });
    return;
  }

  if (c.stage < C().stages.length) {
    const stage = C().stages[c.stage];
    $$('[data-choice]').forEach(b => b.onclick = () => choose(stage, b.dataset.choice));
    $('#castNext')?.addEventListener('click', () => {
      c.stage++; save(); hooks.render();
      ($('[data-choice]') || $('#pourStop') || $('#pourRange'))?.focus({ preventScroll: true });
    });
    return;
  }

  if (c.pourResult === null) {
    startPour();
    const stop = () => resolvePour(val);
    $('#pourStop')?.addEventListener('click', stop);
    const range = $('#pourRange'), out = $('#pourRangeOut');
    if (range) range.oninput = () => { out.textContent = range.value; };
    $('#pourManual')?.addEventListener('click', () => resolvePour(Number(range.value)));
    return;
  }

  // 조건은 repairView()와 반드시 같아야 한다. 어긋나면 완성 버튼에 핸들러가 붙지 않는다.
  if (c.defects > 0 && !c.accepted) {
    $$('[data-repair]').forEach(b => b.onclick = () => repair(b.dataset.repair));
    return;
  }

  $('#castReveal')?.addEventListener('click', reveal);
}

/* 스페이스바로 주입 정지 — 주조 장면에서만 반응 */
window.addEventListener('keydown', e => {
  if (e.code !== 'Space' || state.scene !== 'cast') return;
  const c = state.cast;
  if (!c || c.done || c.stage < C().stages.length || c.pourResult !== null) return;
  if (document.activeElement?.tagName === 'INPUT' || reduceMotion()) return;
  if ($('#modal')?.open) return;
  e.preventDefault();
  resolvePour(val);
});
