// 상태 · 저장 · 로그 · 오디오 · 음성 · 공용 유틸
import * as music from './music.js';
import { voiceKey } from './lines.js';
export const $ = s => document.querySelector(s);
export const $$ = s => Array.from(document.querySelectorAll(s));
export const esc = (s = '') => String(s).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export const SAVE_KEY = 'sayu-restoration-v2';
export const SCENES = ['intro', 'rivalIntro', 'pretest', 'hub', 'dig', 'study', 'reconstruct', 'cast', 'talk', 'complete'];
export const HUB_STEPS = ['intro', 'pretest', 'dig', 'study', 'cast', 'complete'];
export const HUB_LABELS = { intro: '만남', pretest: '사전 질문', dig: '발굴', study: '감별', cast: '주조', complete: '엔딩' };

export const data = { artifacts: null, dialogue: null, casting: null, questions: null, voice: null };

export function freshState() {
  return {
    scene: 'intro', introPhase: 'setup',
    audio: true, bgm: false, contrast: false, voiceURI: '', voiceMode: 'human', challengeMode: 'story',
    sfx: true, haptics: true, coach: {}, digStage: 0, digStageManual: false, castAffection: 0,
    promiseChoice: '', rivalStep: 0, rivalChoice: '', affection: 0,
    focusUsed: 0, strokes: {}, revealed: [], found: [], junkFound: [], hintsUsed: 0,
    stolenArtifact: null, rivalOutcome: null,
    readings: {}, codex: [], activeStudy: null,
    reconstruction: {},
    cast: null,
    talked: [], activeTalk: null, talkFeedback: null,
    preAnswers: {}, postAnswers: {}, reflection: '', ratings: {},
    startedAt: Date.now(), completedAt: null, logs: []
  };
}

export let state = freshState();
export function setState(next) { state = next; }

export function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* 저장 불가 환경 */ } }
export function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (saved && SCENES.includes(saved.scene)) {
      state = { ...freshState(), ...saved, startedAt: saved.startedAt || Date.now(), bgm: false };
      // 예전 버전에서는 수집가에게 되찾은 조각을 다시 캐면 같은 조각이 두 번 들어갔다
      state.found = [...new Set(state.found)];
    }
  } catch { /* 손상된 저장값 무시 */ }
}
export function wipe() { try { localStorage.removeItem(SAVE_KEY); } catch {} }

export function log(action, detail = {}) {
  state.logs.push({ time: new Date().toISOString(), elapsed_ms: Date.now() - state.startedAt, scene: state.scene, action, ...detail });
  save();
}

export function announce(text) {
  const live = $('#live');
  if (!live) return;
  live.textContent = '';
  requestAnimationFrame(() => { live.textContent = text; });
}

/* ---------- 호감도 ---------- */
export function addAffection(amount, reason) {
  const before = state.affection;
  state.affection = clamp(state.affection + amount, 0, 100);
  if (state.affection !== before) log('affection_change', { delta: state.affection - before, total: state.affection, reason });
  return state.affection - before;
}
export function tier() {
  const tiers = data.dialogue?.tiers || [];
  return tiers.filter(t => state.affection >= t.min).pop() || tiers[0] || { mood: '-', line: '' };
}

/* ---------- 집중력 ---------- */
export function focusBudget() { return data.artifacts?.grid.focusBudget ?? 40; }
export function focusLeft() { return Math.max(0, focusBudget() - state.focusUsed); }
export function spendFocus(n = 1) { state.focusUsed += n; }
export function restoreFocus(n) {
  state.focusUsed = Math.max(0, state.focusUsed - n);
  log('focus_restored', { amount: n, left: focusLeft() });
}

/* ---------- 음성 ---------- */
// 대사는 미리 녹음한 목소리(data/voice.json → voice/*.mp3)로 읽는다. 녹음이 없는 문장이나
// 녹음 파일을 못 찾았을 때, 또는 플레이어가 기기 음성을 골랐을 때만 브라우저 음성 합성으로 읽는다.
export function koreanVoices() {
  return 'speechSynthesis' in window ? speechSynthesis.getVoices().filter(v => /^ko/i.test(v.lang)) : [];
}
export function preferredVoice() {
  const vs = koreanVoices();
  return vs.find(v => v.voiceURI === state.voiceURI)
    || vs.find(v => /Yuna|Heami|Sora|SunHi|Google.*한국|Natural|Premium/i.test(v.name))
    || vs[0];
}
const DEVICE = { sayu: { rate: 0.93, pitch: 1.16, volume: 0.96 }, rival: { rate: 0.98, pitch: 0.72, volume: 1 } };
const SILENT = 'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YaAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';
const player = typeof Audio === 'function' ? new Audio() : null;
let voiceSeq = 0;          // 새 말이 시작되면 이전 말(남은 이어 읽기 포함)은 버린다
let voiceBroken = false;   // 녹음 파일을 한 번 못 읽으면 그 뒤로는 기기 음성으로
const blobs = new Map();   // 웹에서 연 경우 받은 녹음(최근 30개) — 서비스 워커가 통째로 캐시해 오프라인에서도 읽힌다

export const hasRecordedVoice = () => !!data.voice && Object.values(data.voice.lines || {}).some(m => Object.keys(m).length);
const recorded = (who, text) => state.voiceMode !== 'device' && !voiceBroken && data.voice?.lines?.[who]?.[voiceKey(text)];

// 모바일 브라우저는 첫 누름 전에는 소리를 막는다. 첫 누름에서 무음을 한 번 재생해 두면 이후 녹음이 재생된다(iOS)
function unlock() {
  ['pointerdown', 'keydown', 'touchend'].forEach(t => document.removeEventListener(t, unlock, true));
  if (!player) return;
  try { player.src = SILENT; player.play()?.catch(() => {}); } catch {}
}
if (typeof document !== 'undefined') ['pointerdown', 'keydown', 'touchend'].forEach(t => document.addEventListener(t, unlock, true));

function clipSrc(file) {
  const url = new URL((data.voice.base || 'voice/') + file, location.href).href;
  if (!/^https?:$/.test(location.protocol) || !window.fetch) return Promise.resolve(url);   // 파일을 직접 연 경우는 그대로 재생
  if (blobs.has(url)) return blobs.get(url);
  const p = fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); })
    .then(b => URL.createObjectURL(b)).catch(() => url);
  blobs.set(url, p);
  while (blobs.size > 30) { const [k, old] = blobs.entries().next().value; blobs.delete(k); old.then(u => u.startsWith('blob:') && URL.revokeObjectURL(u)); }
  return p;
}

function deviceSay(who, text, my, done) {
  if (!('speechSynthesis' in window)) { done(); return; }
  const { rate, pitch, volume } = DEVICE[who];
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR'; u.voice = preferredVoice() || null;
  u.rate = rate; u.pitch = pitch; u.volume = volume;
  u.onend = u.onerror = () => { if (my === voiceSeq) done(); };
  speechSynthesis.speak(u);
}

// 녹음은 묶음 파일(voice/pNN.mp3) 안의 구간 [파일, 시작 초, 끝 초]이다. 문장 사이에는 0.5초 쉼이 있어
// 끝 지점을 조금 넘겨 멈춰도 다음 문장이 새어 나오지 않는다. 문장 하나짜리 파일 이름(문자열)도 그대로 재생한다.
function playLine(who, text, my, done) {
  const clip = recorded(who, text);
  if (!clip || !player) { deviceSay(who, text, my, done); return; }
  const [file, a, b] = Array.isArray(clip) ? clip : [clip, null, null];
  const seg = a != null;
  let finished = false, fellBack = false, stopT = 0, guardT = 0;
  const fin = () => {
    if (finished || my !== voiceSeq) return;
    finished = true; clearTimeout(stopT); clearTimeout(guardT); player.ontimeupdate = player.onplaying = null;
    done();
  };
  const stop = () => { if (my !== voiceSeq) return; try { player.pause(); } catch {} fin(); };
  // 파일 오류와 play() 실패가 함께 올 수 있다 — 기기 음성으로는 한 번만 넘어간다
  const fallback = () => { if (finished || fellBack || my !== voiceSeq) return; fellBack = voiceBroken = true; clearTimeout(guardT); deviceSay(who, text, my, fin); };
  const seek = () => { if (seg && Math.abs(player.currentTime - a) > 0.05) { try { player.currentTime = a; } catch {} } };
  clipSrc(file).then(src => {
    if (my !== voiceSeq) return;
    player.onended = fin;
    player.onerror = fallback;
    player.onloadedmetadata = () => { if (my === voiceSeq) seek(); };
    player.ontimeupdate = seg ? () => { if (my === voiceSeq && player.currentTime >= b) stop(); } : null;
    // timeupdate는 0.25초 간격이라 끝을 넘길 수 있다 — 재생이 시작되면 남은 길이만큼 타이머도 건다.
    // 'playing' 순간의 위치가 실제 소리보다 조금 앞설 수 있어 0.15초 여유를 둔다(문장 사이 쉼 0.5초 안)
    player.onplaying = seg ? () => { if (my !== voiceSeq) return; clearTimeout(stopT); stopT = setTimeout(stop, Math.max(0, b - player.currentTime) * 1000 + 150); } : null;
    if (player.src !== src) player.src = src;
    seek();
    player.play()?.catch(err => { if (err?.name === 'NotAllowedError') fin(); else fallback(); });
    // 재생이 멈춰 버려도 다음 말과 BGM이 묶이지 않게
    guardT = setTimeout(fin, (seg ? (b - a) * 1000 : 30000) + 8000);
  });
}

/** text가 배열이면 차례로 이어 읽는다(예: 쇳물 결과 + 결함 수) */
function say(who, text) {
  hush();
  if (!state.audio) return;
  const parts = (Array.isArray(text) ? text : [text]).filter(Boolean);
  if (!parts.length) return;
  const my = voiceSeq;
  // 말소리와 BGM이 겹치면 듣기 어렵다 — 말하는 동안 BGM을 낮춘다
  music.duck(true);
  const next = i => {
    if (my !== voiceSeq) return;
    if (i >= parts.length) { music.duck(false); return; }
    playLine(who, parts[i], my, () => next(i + 1));
  };
  next(0);
}
export const speak = text => say('sayu', text);
export const speakRival = text => say('rival', text);
export function hush() {
  voiceSeq++;
  try { window.speechSynthesis?.cancel(); } catch {}
  try { if (player && !player.paused) player.pause(); } catch {}
  music.duck(false);
}

/* ---------- 효과음 · BGM ---------- */
const ctx = music.getContext;
const SFX = { brush: 150, dig: 105, found: 660, correct: 520, wrong: 125, rival: 82, tool: 400, pour: 190, defect: 96, grade: 720 };
// 효과음마다 같은 결의 진동을 붙인다 — 소리를 못 들어도 손으로 같은 사건을 느끼게
const HAPTIC = { brush: [12], dig: [18], found: [40, 60, 40, 60, 120], correct: [25, 40, 25], wrong: [70], rival: [220], tool: [10], pour: [30, 30, 30], defect: [80, 50, 80], grade: [30, 40, 30, 40, 160] };
export const canVibrate = () => typeof navigator !== 'undefined' && 'vibrate' in navigator;
/** 웹 진동은 주로 Android에서만 된다. iOS 등에서는 아무 일도 하지 않고, 같은 정보를 소리가 전한다. */
export function vibrate(pattern) {
  if (!state.haptics || !pattern || !canVibrate()) return;
  try { navigator.vibrate(pattern); } catch { /* 진동 불가 환경 */ }
}
export function sfx(type) {
  vibrate(HAPTIC[type]);
  if (!state.sfx) return;
  const c = ctx(); if (!c) return;
  const now = c.currentTime, osc = c.createOscillator(), gain = c.createGain();
  osc.type = type === 'wrong' || type === 'defect' ? 'sawtooth' : type === 'dig' || type === 'brush' ? 'square' : 'sine';
  const f = SFX[type] || 440;
  osc.frequency.setValueAtTime(f, now);
  const rising = type === 'found' || type === 'correct' || type === 'grade' || type === 'tool';
  osc.frequency.exponentialRampToValueAtTime(rising ? f * 1.55 : Math.max(55, f * 0.72), now + (rising ? 0.22 : 0.18));
  const peak = type === 'rival' || type === 'defect' ? 0.18 : type === 'brush' ? 0.05 : 0.09;
  const tail = type === 'rival' ? 0.55 : type === 'brush' ? 0.12 : 0.28;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + tail);
  osc.connect(gain).connect(c.destination);
  osc.start(now); osc.stop(now + tail + 0.05);
}
export function toggleBgm(forceOn = false) {
  if (!music.available()) { toast('이 브라우저는 합성 BGM을 지원하지 않습니다.'); return; }
  const on = forceOn || !state.bgm;
  state.bgm = on;
  if (on) {
    music.setScene(state.scene);
    music.start();
  } else {
    music.stop();
  }
  log('bgm_toggle', { enabled: on, source: on ? music.label() : null });
  save();
}
export function stopBgm() { music.stop(); state.bgm = false; }
/** 장면 전환 시 악상 교체 — BGM이 꺼져 있으면 기억만 해 둔다. */
export function musicScene(scene) { music.setScene(scene); }
export function musicLabel() { return music.label(); }

/* ---------- 화면 효과 ---------- */
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export function burst(target, symbol = '✦', count = 10) {
  if (!target || reduceMotion()) return;
  const r = target.getBoundingClientRect(), layer = $('#fxLayer');
  if (!layer) return;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    p.textContent = symbol;
    p.style.left = `${r.left + r.width / 2}px`;
    p.style.top = `${r.top + r.height / 2}px`;
    p.style.setProperty('--x', `${(Math.random() - 0.5) * 180}px`);
    p.style.setProperty('--y', `${-35 - Math.random() * 130}px`);
    p.style.animationDelay = `${Math.random() * 0.08}s`;
    layer.append(p);
    setTimeout(() => p.remove(), 900);
  }
}
export function shake() {
  if (reduceMotion()) return;
  document.body.classList.remove('game-shake');
  requestAnimationFrame(() => {
    document.body.classList.add('game-shake');
    setTimeout(() => document.body.classList.remove('game-shake'), 360);
  });
}
export function toast(text) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), 3200);
  announce(text);
}

/* ---------- 보기 순서 ----------
   정답이 늘 같은 자리에 있으면 "첫 번째만 고르기"가 통해 사전·사후 점수를 믿을 수 없다.
   판(startedAt)마다 다르지만 다시 그려도 바뀌지 않는 순서로 섞는다. 답은 원래 번호로 저장한다. */
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function order(key, n) {
  let s = hash(`${state.startedAt}:${key}`) || 1;
  const rnd = () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

/* ---------- 조회 ---------- */
export const art = id => data.artifacts.artifacts.find(a => a.id === id);
export const junk = id => data.artifacts.junk.find(j => j.id === id);
export const tool = id => data.artifacts.tools.find(t => t.id === id);
export const allArtifactIds = () => data.artifacts.artifacts.map(a => a.id);
export function readingState(artifactId, toolId) {
  return state.readings[artifactId]?.[toolId] || null;
}
export function identified(artifactId) {
  const r = state.readings[artifactId];
  if (!r) return false;
  return data.artifacts.tools.every(t => r[t.id]?.resolved);
}

/* ---------- 라우팅 훅 (app.js가 주입) ---------- */
export const hooks = {
  render: () => {},
  go: () => {},
  modal: () => {},
  closeModal: () => {}
};
