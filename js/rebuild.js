// 복원대 — 감별한 조각을 원래 관계로 되돌린다. 드래그와 버튼 두 경로를 모두 제공한다.
import {
  $, $$, esc, state, data, log, announce, art,
  sfx, burst, shake, toast, speak, addAffection, hooks, save
} from './core.js';

let picked = null;

const placeable = () => data.artifacts.artifacts.filter(a => state.codex.includes(a.id));
const placedZones = () => Object.values(state.reconstruction);

export function view() {
  const list = placeable();
  if (!list.length) {
    return `
      <header class="scene-head"><div class="eyebrow">복원대</div><h1>복원할 조각이 없습니다</h1>
      <p>감별을 마친 조각만 복원할 수 있습니다. 조사대에서 먼저 판독해 주세요.</p></header>
      <div class="actions"><button class="btn primary" id="toStudy">조사대로</button><button class="btn secondary" id="backHub">캠프로</button></div>`;
  }
  const done = Object.keys(state.reconstruction).length;
  return `
    <header class="scene-head">
      <div class="eyebrow">복원대</div>
      <h1>관찰한 조각을 원래 관계로</h1>
      <p>조각을 끌어 놓거나, 조각을 선택한 뒤 위치 버튼을 누르세요. 오답은 실패가 아니라 다시 관찰할 단서입니다.</p>
    </header>
    <div class="recon-layout">
      <section class="statue-stage" aria-label="반가사유상 복원 위치">
        <img src="${data.artifacts.work.image}" alt="금동 반가사유상의 전체 모습">
        ${data.artifacts.zones.map(z => {
          const filled = placedZones().includes(z.id);
          return `<button class="zone ${filled ? 'correct' : ''}" data-zone="${z.id}" style="left:${z.x}%;top:${z.y}%" ${filled ? 'disabled' : ''}>${esc(z.label)}</button>`;
        }).join('')}
      </section>
      <aside class="panel">
        <h2>복원 ${done}/${list.length}</h2>
        <div class="pieces">
          ${list.map(a => `<button class="piece ${state.reconstruction[a.id] ? 'placed' : ''}" draggable="${!state.reconstruction[a.id]}"
            data-piece="${a.id}" aria-pressed="${picked === a.id}" ${state.reconstruction[a.id] ? 'disabled' : ''}>
            <span>${a.icon}</span>${esc(a.name)}</button>`).join('')}
        </div>
        <div class="hint-box" id="hintBox" role="status">${done ? '배치된 조각과 남은 조각의 관계를 살펴보세요.' : '조각 하나를 먼저 선택하세요.'}</div>
        <div class="actions">
          <button class="btn secondary" id="revisitBtn">조사대에서 다시 보기</button>
          ${done === list.length ? '<button class="btn primary" id="toComplete">완성 기록 보기</button>' : ''}
          <button class="btn secondary" id="backHub">캠프로</button>
        </div>
      </aside>
    </div>`;
}

function select(id) {
  picked = id;
  log('piece_selected', { artifact_id: id });
  hooks.render();
  requestAnimationFrame(() => document.querySelector(`[data-piece="${id}"]`)?.focus());
}

function place(zone, el) {
  if (!picked) { toast('먼저 조각을 선택하세요.'); return; }
  const a = art(picked), correct = a.zone === zone;
  log('reconstruction_attempt', { artifact_id: a.id, target: zone, correct });
  if (!correct) {
    sfx('wrong'); shake();
    el.classList.add('wrong');
    $('#hintBox').textContent = a.hint;
    speak(a.hint);
    setTimeout(() => el.classList.remove('wrong'), 450);
    return;
  }
  state.reconstruction[a.id] = zone;
  addAffection(5, 'reconstruction_correct');
  sfx('correct'); burst(el, '♥', 12);
  announce(`${a.name}을 올바른 위치에 배치했습니다.`);
  speak(`좋아. ${a.name}의 자리를 찾았어.`);
  picked = null;
  save();
  setTimeout(() => hooks.render(), 240);
}

export function bind() {
  $$('[data-piece]').forEach(b => {
    b.onclick = () => select(b.dataset.piece);
    b.ondragstart = e => { picked = b.dataset.piece; e.dataTransfer.setData('text/plain', picked); };
  });
  $$('[data-zone]').forEach(z => {
    z.onclick = () => place(z.dataset.zone, z);
    z.ondragover = e => e.preventDefault();
    z.ondrop = e => { e.preventDefault(); picked = e.dataTransfer.getData('text/plain'); place(z.dataset.zone, z); };
  });
  $('#revisitBtn')?.addEventListener('click', () => { log('revisit_artifact', { source: 'reconstruction' }); hooks.go('study'); });
  $('#toStudy')?.addEventListener('click', () => hooks.go('study'));
  $('#toComplete')?.addEventListener('click', () => hooks.go('complete'));
  $('#backHub')?.addEventListener('click', () => hooks.go('hub'));
}
