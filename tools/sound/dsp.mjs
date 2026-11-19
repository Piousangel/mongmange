// 몽망이 효과음 v0 — 순수 Node DSP 도구 모음 (외부 의존성 없음).
// 모든 난수는 시드 PRNG(mulberry32)에서 나오므로 같은 시드 = 같은 파일(비트 단위).

// 22.05kHz: 모든 소리의 4kHz 위 에너지가 거의 0이라 손실 없이 용량 1/2(리뷰 S3).
export const SR = 22050;

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedOf(name, base = 20261119) {
  let h = base >>> 0;
  for (const c of name) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

export const samples = (sec) => Math.round(sec * SR);
export const zeros = (sec) => new Float64Array(samples(sec));

export function white(n, r) {
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = r() * 2 - 1;
  return x;
}

// 브라운(적분) 노이즈: 저역 위주, 물·공기의 낮은 웅웅거림.
export function brown(n, r) {
  const x = new Float64Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    y = 0.995 * y + (r() * 2 - 1) * 0.06;
    x[i] = y;
  }
  return x;
}

// RBJ 쿡북 바이쿼드. f는 숫자 또는 (i) => Hz (32샘플마다 계수 갱신).
export function biquad(x, type, f, q = 0.707) {
  const y = new Float64Array(x.length);
  let b0, b1, b2, a1, a2;
  const fFn = typeof f === 'function' ? f : () => f;
  const coef = (fc) => {
    fc = Math.min(Math.max(fc, 20), SR * 0.45);
    const w = (2 * Math.PI * fc) / SR;
    const cw = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    let n0, n1, n2;
    if (type === 'lp') [n0, n1, n2] = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2];
    else if (type === 'hp') [n0, n1, n2] = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2];
    else if (type === 'bp') [n0, n1, n2] = [al, 0, -al];
    else throw new Error(type);
    const d0 = 1 + al;
    b0 = n0 / d0; b1 = n1 / d0; b2 = n2 / d0;
    a1 = (-2 * cw) / d0; a2 = (1 - al) / d0;
  };
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    if (i % 32 === 0) coef(fFn(i));
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
    y[i] = v;
  }
  return y;
}

export const lp = (x, f, q) => biquad(x, 'lp', f, q);
export const hp = (x, f, q) => biquad(x, 'hp', f, q);
export const bp = (x, f, q) => biquad(x, 'bp', f, q);

// 구간 [t0, t0+dur]에 길이 dur의 신호를 더한다.
export function mixAt(dst, src, t0, gain = 1) {
  const o = samples(t0);
  for (let i = 0; i < src.length && o + i < dst.length; i++) dst[o + i] += src[i] * gain;
  return dst;
}

export function mulEnv(x, envFn) {
  for (let i = 0; i < x.length; i++) x[i] *= envFn(i / SR);
  return x;
}

// 부드러운 어택·지수 감쇠 엔벨로프
export const adExp = (attack, tau) => (t) =>
  t < attack ? 0.5 - 0.5 * Math.cos((Math.PI * t) / attack) : Math.exp(-(t - attack) / tau);

// 양끝 레이즈드 코사인 페이드 (클릭 방지)
export function fadeEdges(x, inMs = 5, outMs = 30) {
  const ni = samples(inMs / 1000), no = samples(outMs / 1000);
  for (let i = 0; i < ni; i++) x[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / ni);
  for (let i = 0; i < no; i++) x[x.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / no);
  return x;
}

// 위상 누적 사인 (f: 숫자 또는 t => Hz)
export function sine(n, f, phase0 = 0) {
  const x = new Float64Array(n);
  const fFn = typeof f === 'function' ? f : () => f;
  let ph = phase0;
  for (let i = 0; i < n; i++) {
    x[i] = Math.sin(ph);
    ph += (2 * Math.PI * fFn(i / SR)) / SR;
  }
  return x;
}

// ---------- FFT (반복형 radix-2) ----------
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}
export const nextPow2 = (n) => 1 << Math.ceil(Math.log2(Math.max(2, n)));

export function convolve(a, b) {
  const n = nextPow2(a.length + b.length - 1);
  const ar = new Float64Array(n), ai = new Float64Array(n);
  const br = new Float64Array(n), bi = new Float64Array(n);
  ar.set(a); br.set(b);
  fft(ar, ai); fft(br, bi);
  for (let i = 0; i < n; i++) {
    const r = ar[i] * br[i] - ai[i] * bi[i];
    const m = ar[i] * bi[i] + ai[i] * br[i];
    ar[i] = r; ai[i] = -m; // 켤레 → 역변환을 순변환으로
  }
  fft(ar, ai);
  const out = new Float64Array(a.length + b.length - 1);
  for (let i = 0; i < out.length; i++) out[i] = ar[i] / n;
  return out;
}

// 합성 잔향: 감쇠 노이즈 IR(고역일수록 빨리 사라지게 저역통과). 결과 길이 = 입력 + IR.
export function reverb(x, r, { seconds = 1.6, tau = 0.45, tone = 2500, mix = 0.3, predelayMs = 12 } = {}) {
  const n = samples(seconds);
  let ir = white(n, r);
  ir = lp(ir, (i) => tone * Math.exp(-i / SR / (seconds * 0.6)) + 300, 0.6);
  for (let i = 0; i < n; i++) ir[i] *= Math.exp(-i / SR / tau);
  const pd = samples(predelayMs / 1000);
  const irp = new Float64Array(n + pd);
  irp.set(ir, pd);
  let e = 0;
  for (const v of irp) e += v * v;
  const g = 1 / Math.sqrt(e);
  const wet = convolve(x, irp);
  const out = new Float64Array(wet.length);
  for (let i = 0; i < out.length; i++) out[i] = (i < x.length ? x[i] * (1 - mix) : 0) + wet[i] * g * mix;
  return out;
}

// ---------- 루프: 이음새 없는 크로스페이드 ----------
// buf 길이는 L + C. 결과 길이 L이고 끝 → 처음이 buf[L-1] → buf[L]로 연속.
export function makeLoop(buf, loopSec, xfadeSec) {
  const L = samples(loopSec), C = samples(xfadeSec);
  if (buf.length < L + C) throw new Error('loop buffer too short');
  const out = buf.slice(0, L);
  for (let k = 0; k < C; k++) {
    const w = Math.sin((Math.PI / 2) * (k / C)); // equal-power
    const v = Math.cos((Math.PI / 2) * (k / C));
    out[k] = buf[k] * w + buf[L + k] * v;
  }
  return out;
}

// ---------- 몽망이 허밍 (닫힌 입 'ㅁ·ㅇ') ----------
// f0: t => Hz, amp: t => 0..1, breath: 숨 섞임 정도, emotion에 따라 호출부가 곡선을 정한다.
export function hum(dur, { f0, amp, breath = 0.12, vibrato = 0.006, vibHz = 5.2, r }) {
  const n = samples(dur);
  const x = new Float64Array(n);
  let ph = 0;
  // 느린 피치 흔들림(사람 같은 불규칙성)
  const jit = lp(white(n, r), 6, 0.7);
  let jmax = 1e-9;
  for (const v of jit) jmax = Math.max(jmax, Math.abs(v));
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = f0(t) * (1 + vibrato * Math.sin(2 * Math.PI * vibHz * t) + 0.004 * (jit[i] / jmax));
    let s = 0;
    for (let k = 1; k <= 12; k++) {
      const fk = f * k;
      if (fk > 3200) break;
      // 비음 포먼트(~270Hz)를 살리고 900Hz 위는 급히 깎는다 → 입 닫은 '음—'
      const form = 1 + 1.6 * Math.exp(-(((fk - 270) / 110) ** 2));
      const roll = 1 / (1 + (fk / 900) ** 3);
      s += (form * roll * Math.sin(k * ph)) / k ** 1.2;
    }
    x[i] = s * amp(t);
    ph += (2 * Math.PI * f) / SR;
  }
  if (breath > 0) {
    const b = lp(bp(white(n, r), 900, 0.5), 2200, 0.7);
    for (let i = 0; i < n; i++) x[i] += b[i] * breath * 2.2 * amp(i / SR);
  }
  return x;
}

export function normalizePeak(x, dbfs) {
  let p = 0;
  for (const v of x) p = Math.max(p, Math.abs(v));
  const g = 10 ** (dbfs / 20) / (p || 1);
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}

// ---------- 폰 스피커 '존재감' (리뷰 S2) ----------
// 소형 스피커는 ~400Hz 아래를 거의 못 낸다. 저역 위주 소리에 1~3kHz 성분을 따로 만들어 얹는다.
// excite: 원신호의 중역을 tanh로 살짝 일그러뜨려 배음을 만든 뒤 center 대역만 남김(소리와 같은 결, 같은 시간).
export function excite(x, { drive = 3, center = 1600, q = 0.7, cut = 600 } = {}) {
  const h = hp(x, cut, 0.7);
  let p = 1e-9; for (const v of h) p = Math.max(p, Math.abs(v));
  const s = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) s[i] = Math.tanh((drive * h[i]) / p);
  return bp(s, center, q);
}
// envelope 추종 노이즈: 원신호 음량 곡선대로 움직이는 종이결·공기(노이즈 기반 저역 소리용).
export function airLayer(x, r, { center = 1500, q = 0.8, smoothHz = 25 } = {}) {
  const a = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) a[i] = Math.abs(x[i]);
  const env = lp(lp(a, smoothHz, 0.7), smoothHz, 0.7);
  const nz = bp(white(x.length, r), center, q);
  for (let i = 0; i < x.length; i++) nz[i] *= Math.max(0, env[i]);
  return nz;
}
export function rmsOf(x) { let s = 0; for (const v of x) s += v * v; return Math.sqrt(s / Math.max(1, x.length)); }
// target: 원신호 RMS 대비 레이어 RMS 비(dB). 레이어를 그만큼 맞춰 더한다.
export function addLayer(x, layer, relDb) {
  const g = (rmsOf(x) / (rmsOf(layer) || 1)) * 10 ** (relDb / 20);
  for (let i = 0; i < x.length; i++) x[i] += layer[i] * g;
  return x;
}

// ---------- WAV (16bit, mono, SR) ----------
export function encodeWav(x) {
  const n = x.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767)));
    buf.writeInt16LE(v, 44 + i * 2);
  }
  return buf;
}

export function decodeWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not wav');
  let off = 12, fmt = null, data = null;
  while (off < buf.length) {
    const id = buf.toString('ascii', off, off + 4), size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { ch: buf.readUInt16LE(off + 10), sr: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    if (id === 'data') data = buf.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size & 1);
  }
  const x = new Float64Array(data.length / 2);
  for (let i = 0; i < x.length; i++) x[i] = data.readInt16LE(i * 2) / 32768;
  return { ...fmt, x, raw: data };
}
