// 사유와 라이벌이 소리 내어 말하는 문장을 한곳에 둔다.
// 게임은 이 틀로 문장을 만들고, voice/voice_lines.mjs는 같은 틀로 녹음할 문장 목록을 뽑는다
// → 녹음 목록과 실제로 말하는 문장이 한 글자도 어긋나지 않는다. (이 파일은 다른 모듈을 import하지 않는다)

export const SAY = {
  found: name => `${name}을 찾았어. 바로 답을 보지 말고 조사대에서 직접 살펴봐 줘.`,
  identified: name => `${name}을 완전히 알아봤어. 이 조각 이야기, 들어 줄래?`,
  placed: name => `좋아. ${name}의 자리를 찾았어.`,
  defects: n => `결함이 ${n}곳 생겼어. 수리할 수 있어.`,
  clue: (template, n) => template.replaceAll('{n}', String(n)),
  duelWon: '내 모습을 제대로 봐 줘서 되찾았어. 고마워.',
  retry: '조금 달라. 판독 결과를 한 번 더 읽어 봐.',
  voicePicked: '이 목소리로 당신과 함께할게.',
  voiceTest: '나에 대해 알고 싶지 않아? 당신과 함께라면 잃어버린 기억도 찾을 수 있을 것 같아.',
  farewell: '오늘 나를 처음부터 끝까지 봐 줘서 고마워.'
};

// 주조 결함은 공정에 따라 최대 10곳까지 생길 수 있다(cast.js computeDefects)
export const MAX_DEFECTS = 10;
// 한 칸을 둘러싼 여덟 칸에 묻힐 수 있는 조각 수(조각은 다섯 개)
export const MAX_CLUE = 5;

/** 녹음 키 — 띄어쓰기 차이로 녹음을 못 찾는 일이 없게 공백을 하나로 모은다 */
export const voiceKey = text => String(text ?? '').replace(/\s+/g, ' ').trim();

/** 게임이 말하는 모든 고정 문장 → { sayu: [...], rival: [...] } (처음 나오는 순서, 중복 없음) */
export function voiceLines({ artifacts, dialogue, casting }) {
  const out = { sayu: [], rival: [] };
  const add = (who, t) => { const k = voiceKey(t); if (k && !out[who].includes(k)) out[who].push(k); };
  const sayu = t => add('sayu', t), rival = t => add('rival', t);
  const d = dialogue, arts = artifacts.artifacts;

  // 설정 · 프롤로그 · 라이벌
  sayu(SAY.voiceTest); sayu(SAY.voicePicked);
  sayu(d.prologue.greeting);
  d.prologue.choices.forEach(c => sayu(c.response));
  d.rival.steps.forEach(rival);
  d.rival.choices.forEach(c => rival(c.reply));
  sayu(d.rival.sayuReturn);
  // 발굴장
  sayu(d.dig.rule);
  sayu(d.dig.clueZero);
  for (let n = 1; n <= MAX_CLUE; n++) sayu(SAY.clue(d.dig.clue, n));
  sayu(d.dig.rest);
  arts.forEach(a => sayu(SAY.found(a.name)));
  rival(d.rival.steal); rival(d.rival.duelFail);
  sayu(SAY.duelWon);
  // 조사대
  arts.forEach(a => {
    artifacts.tools.forEach(t => { const r = a.readings[t.id]; sayu(r.text); sayu(r.fact); });
    sayu(SAY.identified(a.name));
  });
  sayu(SAY.retry);
  // 사유와 대화
  Object.values(d.unlocked).forEach(u => {
    sayu(u.prompt);
    if (u.embodied) sayu(u.embodied.after);
    u.options.forEach(o => sayu(o.response));
  });
  // 복원대
  arts.forEach(a => { sayu(a.hint); sayu(SAY.placed(a.name)); });
  // 주조소
  casting.stages.forEach(s => s.options.forEach(o => sayu(o.sayu)));
  Object.values(casting.pour.results).forEach(r => sayu(r.text));
  for (let n = 1; n <= MAX_DEFECTS; n++) sayu(SAY.defects(n));
  casting.repair.options.forEach(o => sayu(o.fact));
  Object.values(casting.grades).forEach(g => { sayu(g.sayu); if (g.sayuNoDefect) sayu(g.sayuNoDefect); });
  // 엔딩
  sayu(SAY.farewell);
  return out;
}
