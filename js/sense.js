// 감각 단서 — 발굴 격자를 눈이 아니라 소리와 진동으로도 읽게 하는 크로스모달 시그니파이어.
// 격자는 45° 돌린 아이소메트릭이라, 행·열이 아니라 '화면에 보이는 자리'를 소리에 맞춘다(손끝이 움직이는 방향 = 소리가 변하는 방향).
//   화면 위↔아래(행+열) → 음높이. 위쪽 블록일수록 높다. 발굴장 BGM과 같은 계면조(라·도·레·미·솔)라 단서가 음악처럼 들린다.
//   화면 왼쪽↔오른쪽(열−행) → 좌우 위치(스테레오). 왼쪽 블록은 왼쪽 귀에서 난다.
//   남은 흙     → 소리의 밝기와 진동 길이. 흙이 두꺼울수록 둔탁하고 길게, 바닥은 맑은 "팅".
// 붓질·쇳물·거푸집 소리는 걸러 낸 잡음 알갱이로 합성한다(ASMR). 음원 파일은 쓰지 않는다.
// 진동은 웹 진동을 지원하는 기기(주로 Android)에서만 나고, 그 밖의 기기에서는 같은 정보를 소리가 전한다.
import { state, vibrate } from './core.js';
import { getContext, pluckSfx } from './music.js';

// 계면조 두 옥타브 남짓 — 화면 맨 위 블록(라5)에서 맨 아래 블록(라3)까지
const PITCH = [880.0, 783.99, 659.25, 587.33, 523.25, 440.0, 392.0, 329.63, 293.66, 261.63, 220.0];

const audio = () => (state.sfx ? getContext() : null);
/** 화면 높이(행+열)를 음높이로 — 위가 높다 */
function pitchOf(row, col, rows, cols) {
  const span = Math.max(1, rows + cols - 2);
  return PITCH[Math.round(((row + col) / span) * (PITCH.length - 1))];
}
/** 화면 가로 자리(열−행)를 좌우로 — 왼쪽이 왼쪽 귀 */
function panOf(row, col, rows, cols) {
  const span = Math.max(1, Math.max(rows, cols) - 1);
  return ((col - row) / span) * 0.8;
}

/* ---------- 잡음 알갱이 ---------- */
let noiseBuf = null;
function noise(c) {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const len = c.sampleRate;
  noiseBuf = c.createBuffer(1, len, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function out(c, node, pan) {
  if (c.createStereoPanner && pan) {
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(p);
    p.connect(c.destination);
  } else node.connect(c.destination);
}

function grain(c, { when, dur, freq, q = 0.8, gain, pan = 0, type = 'bandpass' }) {
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(gain, when + Math.min(0.015, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(f).connect(g);
  out(c, g, pan);
  src.start(when, Math.random() * 0.5, dur + 0.05);
}

function thump(c, when, freq, gain, dur, pan = 0) {
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, when);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.55, when + dur);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(gain, when + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(g);
  out(c, g, pan);
  osc.start(when); osc.stop(when + dur + 0.05);
}

/* ---------- 발굴 격자 ---------- */

/** 칸 하나를 짚었을 때(손끝으로 끌거나 방향키로 옮길 때) — 위치와 남은 흙 */
export function cell({ row, col, rows, cols, left }) {
  vibrate(left ? [6 + left * 6] : [5]);
  const c = audio();
  if (!c) return;
  const pan = panOf(row, col, rows, cols);
  pluckSfx(pitchOf(row, col, rows, cols), {
    pan, gain: left ? 0.15 : 0.2,
    seconds: left ? 0.5 : 1.1,
    brightness: left ? 0.62 - left * 0.14 : 0.88
  });
  if (left) grain(c, { when: c.currentTime, dur: 0.06 + left * 0.03, freq: 240, q: 0.7, gain: 0.03 + left * 0.02, pan, type: 'lowpass' });
}

/** 숫자 칸 — 칸의 음 다음에, 둘레에 묻힌 조각 수만큼 한 옥타브 위에서 두드린다 */
export function clue({ n, row, col, rows, cols }) {
  vibrate(n ? Array.from({ length: n * 2 - 1 }, (_, i) => (i % 2 ? 110 : 28)) : [8]);
  const c = audio();
  if (!c) return;
  const pan = panOf(row, col, rows, cols), base = pitchOf(row, col, rows, cols);
  pluckSfx(base, { pan, gain: 0.18, seconds: 1.0, brightness: 0.85 });
  for (let k = 0; k < n; k++) {
    pluckSfx(base * 2, { pan, gain: 0.12, seconds: 0.35, brightness: 0.9, when: c.currentTime + 0.32 + k * 0.17 });
  }
  if (!n) grain(c, { when: c.currentTime + 0.3, dur: 0.25, freq: 600, q: 0.5, gain: 0.025, pan, type: 'lowpass' });
}

/** 힌트 단계 — 묻힌 조각에 가까우면 심장처럼 두근거린다. 정확한 칸이 아니라 근처만 알려 준다. */
export function heartbeat(beats, { row, col, rows, cols }) {
  if (!beats) return;
  vibrate(beats > 1 ? [40, 90, 40] : [30]);
  const c = audio();
  if (!c) return;
  const pan = panOf(row, col, rows, cols), t = c.currentTime + 0.12;
  for (let k = 0; k < beats; k++) thump(c, t + k * 0.2, 92, 0.24, 0.18, pan);
}

/** 붓질 — 잡음 알갱이를 잇달아 터뜨린 "사각사각". 흙이 두꺼울수록 밑에 깔린 "퍽"이 묵직하다 */
export function brush({ row, col, rows, cols, left }) {
  const d = 6 + left * 5;
  vibrate([d, 26, d, 26, d]);
  const c = audio();
  if (!c) return;
  const pan = panOf(row, col, rows, cols), t = c.currentTime;
  for (let k = 0; k < 4; k++) {
    grain(c, {
      when: t + k * 0.055 + Math.random() * 0.015,
      dur: 0.07 + Math.random() * 0.05,
      freq: 2600 + Math.random() * 2200, q: 0.8,
      gain: 0.05 + Math.random() * 0.03,
      pan: pan + (Math.random() - 0.5) * 0.2
    });
  }
  grain(c, { when: t, dur: 0.12 + left * 0.04, freq: 220, q: 0.6, gain: 0.04 + left * 0.025, pan, type: 'lowpass' });
}

/** 바닥이 드러났을 때 — 맑은 "팅" */
export function floor({ row, col, rows, cols }) {
  const c = audio();
  if (!c) return;
  pluckSfx(pitchOf(row, col, rows, cols), { pan: panOf(row, col, rows, cols), gain: 0.22, seconds: 1.2, brightness: 0.9 });
}

/* ---------- 주조 ---------- */

/** 쇳물 — 길게 끓는 "치익"과 잔 기포 */
export function sizzle() {
  vibrate([60, 40, 60, 40, 120]);
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  grain(c, { when: t, dur: 1.1, freq: 3800, q: 0.4, gain: 0.07, type: 'highpass' });
  for (let k = 0; k < 7; k++) {
    grain(c, { when: t + 0.1 + Math.random() * 0.9, dur: 0.03, freq: 1800 + Math.random() * 2400, q: 2, gain: 0.05, pan: (Math.random() - 0.5) * 0.8 });
  }
}

/** 거푸집 깨기 — 짧은 "쩍"과 낮은 울림 */
export function crack() {
  vibrate([20, 30, 90]);
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  grain(c, { when: t, dur: 0.07, freq: 1300, q: 1.2, gain: 0.16 });
  grain(c, { when: t + 0.05, dur: 0.18, freq: 500, q: 0.8, gain: 0.08 });
  thump(c, t, 70, 0.22, 0.35);
}

/* ---------- 조우 · 체화 ---------- */

/** 조우 — 사유가 먼저 숨을 쉰다. 플레이어는 아무것도 하지 않아도 되는 수동 단계 */
export function breath() {
  vibrate([18, 700, 18, 700, 18]);
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  for (let k = 0; k < 3; k++) grain(c, { when: t + k * 0.72, dur: 0.55, freq: 520, q: 0.5, gain: 0.035, type: 'lowpass' });
}

/**
 * 쓰다듬기 — 초당 1~10cm(약 40~380px)의 느린 손길에 가장 따뜻하게 반응한다.
 * C-구심성 섬유가 반기는 속도를 빌린 것이지만, 손끝은 그 섬유가 적은 곳이므로
 * "정서적 접촉을 흉내 낸 수동 단계"로만 쓴다.
 */
let lastStroke = 0;
export function stroke(pxPerSec) {
  const now = performance.now();
  if (now - lastStroke < 140) return false;
  lastStroke = now;
  const slow = pxPerSec >= 38 && pxPerSec <= 380;
  vibrate(slow ? [10] : [4]);
  const c = audio();
  if (c) {
    grain(c, slow
      ? { when: c.currentTime, dur: 0.32, freq: 700, q: 0.5, gain: 0.05, type: 'lowpass' }
      : { when: c.currentTime, dur: 0.12, freq: 2200, q: 0.5, gain: 0.018 });
  }
  return slow;
}

/** 닿을 듯 말 듯 — 거의 느껴지지 않을 만큼 약한 세 번의 떨림 */
export function nearTouch() {
  vibrate([4, 160, 4, 160, 4, 500, 3]);
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  for (let k = 0; k < 3; k++) pluckSfx(1318.5, { gain: 0.05, seconds: 0.6, brightness: 0.3, when: t + k * 0.16 });
  grain(c, { when: t + 0.55, dur: 0.6, freq: 900, q: 0.4, gain: 0.02, type: 'lowpass' });
}
