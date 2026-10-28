// 가야금풍 합성 BGM + 외부 음원 교체 슬롯
//
// 기존 BGM은 사인파 8음을 돌리는 수준이라 "뜯는 현"으로 들리지 않았다.
// 여기서는 Karplus-Strong 물리 모델로 발현음을 직접 합성한다. 잡음을 현의 길이만큼
// 링버퍼에 채우고 평균 필터를 돌리면, 고음이 먼저 죽고 배음이 남는 실제 현의 감쇠가 나온다.
// 특정 전통곡이나 연주를 복제하지 않으므로 UI 표기는 "가야금풍 합성 BGM"을 유지한다.
//
// assets/audio/bgm/<트랙>.mp3 가 있으면 합성 대신 그 파일을 재생한다.
// 라이선스가 확인된 음원을 넣으면 코드 수정 없이 교체된다. 폴더는 기본으로 비어 있다(없어도 된다).

let ctx = null, master = null, verb = null, dry = null;
let timer = null, nextNoteAt = 0, step = 0;
let current = 'hub', playing = false;
let external = null;            // 외부 음원 재생 중인 HTMLAudioElement
const FULL_LEVEL = 0.9, DUCK_LEVEL = 0.32;
let ducked = false;             // 캐릭터가 말하는 중이면 BGM을 낮춰 둔다
const externalChecked = new Map();
const pluckCache = new Map();

/* ---------- 오디오 컨텍스트 (효과음도 같이 쓴다) ---------- */
export function getContext() {
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return null;
  if (!ctx) ctx = new C();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** 지수 감쇠 잡음으로 만든 짧은 임펄스 응답 — 공간감만 주는 가벼운 리버브 */
function impulse(c, seconds = 1.8, decay = 3.2) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

function graph() {
  const c = getContext();
  if (!c || master) return c;
  master = c.createGain();
  master.gain.value = 0;
  dry = c.createGain(); dry.gain.value = 0.82;
  verb = c.createConvolver(); verb.buffer = impulse(c);
  const wet = c.createGain(); wet.gain.value = 0.3;
  dry.connect(master);
  verb.connect(wet).connect(master);
  master.connect(c.destination);
  return c;
}

/* ---------- Karplus-Strong 발현음 ---------- */
function pluck(c, freq, seconds, brightness) {
  const key = `${Math.round(freq)}:${seconds}:${brightness}`;
  if (pluckCache.has(key)) return pluckCache.get(key);

  const sr = c.sampleRate;
  const N = Math.max(2, Math.round(sr / freq));
  const total = Math.ceil(sr * seconds);
  const buf = c.createBuffer(1, total, sr);
  const out = buf.getChannelData(0);

  // 현을 뜯는 순간의 여기(excitation): 잡음에 저역 필터를 걸어 밝기를 정한다
  const ring = new Float32Array(N);
  let lp = 0;
  for (let i = 0; i < N; i++) {
    lp += brightness * ((Math.random() * 2 - 1) - lp);
    ring[i] = lp;
  }

  // 링버퍼를 돌면서 이웃 두 표본을 평균 → 고음부터 감쇠하는 현의 거동
  let idx = 0, last = 0;
  const damping = 0.9965;
  for (let i = 0; i < total; i++) {
    const cur = ring[idx];
    const avg = 0.5 * (cur + ring[(idx + 1) % N]);
    last = last + 0.5 * (avg - last);
    ring[idx] = last * damping;
    out[i] = cur;
    idx = (idx + 1) % N;
  }

  // 전체 포락선: 짧은 어택, 긴 감쇠, 끝은 완전히 0으로 (클릭 방지)
  const atk = Math.floor(sr * 0.004);
  for (let i = 0; i < total; i++) {
    const a = i < atk ? i / atk : 1;
    const tail = 1 - i / total;
    out[i] *= a * tail * tail;
  }

  pluckCache.set(key, buf);
  return buf;
}

function playPluck(freq, when, gain, seconds = 2.6, brightness = 0.55, pan = 0) {
  const c = ctx;
  const src = c.createBufferSource();
  src.buffer = pluck(c, freq, seconds, brightness);
  const g = c.createGain();
  g.gain.value = gain;
  let node = src.connect(g);
  if (c.createStereoPanner) {
    const p = c.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    node = p;
  } else node = g;
  node.connect(dry);
  node.connect(verb);
  src.start(when);
}

/**
 * 효과음·소리 단서용 발현음. BGM과 같은 현의 소리를 쓰되, BGM이 꺼져 있어도 들리도록
 * master를 거치지 않고 바로 출력한다.
 */
export function pluckSfx(freq, { gain = 0.2, pan = 0, seconds = 0.8, brightness = 0.6, when = 0 } = {}) {
  const c = getContext();
  if (!c) return;
  const src = c.createBufferSource();
  src.buffer = pluck(c, freq, seconds, brightness);
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g);
  let out = g;
  if (c.createStereoPanner) {
    const p = c.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    out = p;
  }
  out.connect(c.destination);
  src.start(when || c.currentTime);
}

/** 장구풍 타격음 — 저역 "쿵"과 대역 통과 잡음 "딱" */
function playDrum(when, kind, gain) {
  const c = ctx;
  if (kind === 'low') {
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(128, when);
    osc.frequency.exponentialRampToValueAtTime(52, when + 0.16);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.3);
    osc.connect(g).connect(dry);
    osc.start(when); osc.stop(when + 0.34);
    return;
  }
  const len = Math.floor(c.sampleRate * 0.1);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
  const src = c.createBufferSource(); src.buffer = buf;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1750; bp.Q.value = 1.1;
  const g = c.createGain(); g.gain.value = gain;
  src.connect(bp).connect(g);
  g.connect(dry); g.connect(verb);
  src.start(when);
}

/* ---------- 장면별 악상 ----------
   계면조(라-도-레-미-솔)는 가라앉은 장면에, 평조(솔-라-도-레-미)는 밝은 장면에 쓴다. */
const GYEMYEON = [220.00, 261.63, 293.66, 329.63, 392.00];
const PYEONG   = [196.00, 220.00, 261.63, 293.66, 329.63];

const SCENES = {
  intro:       { scale: GYEMYEON, oct: [1, 2],    stepMs: 1150, density: 0.62, gain: 0.30, bright: 0.42, drum: null, drone: null },
  rivalIntro:  { scale: GYEMYEON, oct: [0.5, 1],  stepMs: 760,  density: 0.72, gain: 0.34, bright: 0.72, drum: 'low', drone: 110.0 },
  hub:         { scale: PYEONG,   oct: [1, 2],    stepMs: 1000, density: 0.58, gain: 0.30, bright: 0.50, drum: null, drone: null },
  dig:         { scale: GYEMYEON, oct: [1, 2],    stepMs: 620,  density: 0.70, gain: 0.28, bright: 0.60, drum: 'mix', drone: null },
  study:       { scale: PYEONG,   oct: [2, 4],    stepMs: 1500, density: 0.40, gain: 0.24, bright: 0.34, drum: null, drone: null },
  cast:        { scale: GYEMYEON, oct: [0.5, 1],  stepMs: 540,  density: 0.78, gain: 0.32, bright: 0.80, drum: 'low', drone: 98.0 },
  reconstruct: { scale: PYEONG,   oct: [1, 2],    stepMs: 980,  density: 0.56, gain: 0.28, bright: 0.48, drum: null, drone: null },
  talk:        { scale: GYEMYEON, oct: [1, 2],    stepMs: 1250, density: 0.52, gain: 0.28, bright: 0.38, drum: null, drone: null },
  pretest:     { scale: PYEONG,   oct: [1, 2],    stepMs: 1400, density: 0.42, gain: 0.22, bright: 0.40, drum: null, drone: null },
  complete:    { scale: PYEONG,   oct: [1, 2, 4], stepMs: 1300, density: 0.60, gain: 0.30, bright: 0.46, drum: null, drone: 146.83 }
};
const conf = () => SCENES[current] || SCENES.hub;

let droneNodes = null;
function setDrone(freq) {
  if (droneNodes) { try { droneNodes.osc.stop(); } catch {} droneNodes = null; }
  if (!freq || !ctx) return;
  const osc = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
  osc.type = 'triangle'; osc.frequency.value = freq;
  lp.type = 'lowpass'; lp.frequency.value = 420;
  g.gain.value = 0.055;
  osc.connect(lp).connect(g).connect(dry);
  osc.start();
  droneNodes = { osc, g };
}

/* ---------- 시퀀서 (lookahead 스케줄링) ---------- */
function schedule() {
  const c = ctx;
  if (!c) return;
  const cfg = conf();
  const ahead = 0.25;
  while (nextNoteAt < c.currentTime + ahead) {
    const beat = step % 8;
    if (Math.random() < cfg.density) {
      const deg = Math.floor(Math.random() * cfg.scale.length);
      const oct = cfg.oct[Math.floor(Math.random() * cfg.oct.length)];
      const freq = cfg.scale[deg] * oct;
      const accent = beat === 0 ? 1.25 : 1;
      playPluck(freq, nextNoteAt, cfg.gain * accent, 2.4 + Math.random() * 1.2,
                cfg.bright, (Math.random() - 0.5) * 0.5);
      // 가끔 5도 위를 덧붙여 화음감을 준다
      if (Math.random() < 0.18) {
        playPluck(cfg.scale[(deg + 2) % cfg.scale.length] * oct, nextNoteAt + 0.06,
                  cfg.gain * 0.5, 2.0, cfg.bright * 0.8, (Math.random() - 0.5) * 0.6);
      }
    }
    if (cfg.drum === 'low' && beat === 0) playDrum(nextNoteAt, 'low', 0.16);
    if (cfg.drum === 'mix') {
      if (beat === 0) playDrum(nextNoteAt, 'low', 0.13);
      if (beat === 4) playDrum(nextNoteAt, 'tap', 0.07);
    }
    nextNoteAt += cfg.stepMs / 1000;
    step++;
  }
}

/* ---------- 외부 음원 슬롯 ---------- */
async function externalTrack(scene) {
  if (externalChecked.has(scene)) return externalChecked.get(scene);
  const url = `assets/audio/bgm/${scene}.mp3`;
  let ok = false;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    ok = res.ok && !/text\/html/.test(res.headers.get('content-type') || '');
  } catch { ok = false; }
  externalChecked.set(scene, ok ? url : null);
  return ok ? url : null;
}

function stopExternal() {
  if (!external) return;
  external.pause();
  external.src = '';
  external = null;
}

/* ---------- 공개 API ---------- */
export function available() { return !!(window.AudioContext || window.webkitAudioContext); }
export function isPlaying() { return playing; }

export async function start() {
  if (!graph()) return false;
  playing = true;
  const url = await externalTrack(current);
  if (url) {
    stopExternal();
    external = new Audio(url);
    external.loop = true;
    external.volume = 0.5;
    external.play().catch(() => { external = null; });
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(0, ctx.currentTime);
    return true;
  }
  clearInterval(timer);
  nextNoteAt = ctx.currentTime + 0.08;
  step = 0;
  setDrone(conf().drone);
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
  master.gain.linearRampToValueAtTime(ducked ? DUCK_LEVEL : FULL_LEVEL, ctx.currentTime + 1.4);
  schedule();
  timer = setInterval(schedule, 60);
  return true;
}

export function stop() {
  playing = false;
  clearInterval(timer); timer = null;
  stopExternal();
  setDrone(null);
  if (master && ctx) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
  }
}

/** 장면이 바뀌면 악상을 갈아끼운다. 재생 중이 아니면 기억만 해 둔다. */
export function setScene(scene) {
  if (!SCENES[scene] || scene === current) return;
  current = scene;
  if (!playing) return;
  if (external) { start(); return; }       // 외부 음원은 트랙 자체를 교체
  setDrone(conf().drone);
  step = 0;
}

/**
 * 캐릭터가 말하는 동안 BGM을 낮춘다. 해설과 배경음이 겹치면 청각 정보 처리에
 * 혼란이 생긴다(음성 간섭, Lec 8-2).
 */
export function duck(on) {
  ducked = on;
  if (external) { external.volume = on ? 0.18 : 0.5; return; }
  if (!master || !ctx || !playing) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(master.gain.value, t);
  master.gain.linearRampToValueAtTime(on ? DUCK_LEVEL : FULL_LEVEL, t + (on ? 0.25 : 0.8));
}

export function label() {
  return external ? '외부 음원' : '가야금풍 합성';
}
