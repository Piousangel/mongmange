// 몽망이 파라메트릭 캐릭터 스케치 생성기 (증명용)
// 실행: node generate.mjs  → 같은 폴더에 SVG 3장 생성
// 핵심: 몸·눈·입·볼·소품이 전부 "숫자 파라미터 → 경로" 함수다.
// 같은 함수를 react-native-skia의 Path 문자열로 그대로 쓸 수 있다(SVG path d 문법 호환).
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = dirname(fileURLToPath(import.meta.url));
const f = (n) => Math.round(n * 10) / 10;

// ── 형태 원시 함수 ─────────────────────────────────────────────
// 바닥이 평평한 말랑한 덩어리. squash<1 이면 눌림(가로로 퍼짐), >1 이면 늘어남. 부피 보존: w ∝ 1/sqrt(squash)
function blob({ cx, baseY, w, h, flat = 0.7, squash = 1, topPinch = 0.28 }) {
  const W = w / Math.sqrt(squash), H = h * squash, r = W / 2, top = baseY - H;
  return [
    `M${f(cx)} ${f(baseY)}`,
    `C${f(cx + r * flat)} ${f(baseY)} ${f(cx + r)} ${f(baseY - H * 0.12)} ${f(cx + r)} ${f(baseY - H * 0.48)}`,
    `C${f(cx + r)} ${f(baseY - H * 0.86)} ${f(cx + W * topPinch)} ${f(top)} ${f(cx)} ${f(top)}`,
    `C${f(cx - W * topPinch)} ${f(top)} ${f(cx - r)} ${f(baseY - H * 0.86)} ${f(cx - r)} ${f(baseY - H * 0.48)}`,
    `C${f(cx - r)} ${f(baseY - H * 0.12)} ${f(cx - r * flat)} ${f(baseY)} ${f(cx)} ${f(baseY)}Z`,
  ].join(' ');
}

// 콩 모양: 한쪽이 살짝 들어간 비대칭(형태 언어 B)
function bean({ cx, baseY, w, h, squash = 1, lean = 0.08 }) {
  const W = w / Math.sqrt(squash), H = h * squash, r = W / 2, top = baseY - H;
  return [
    `M${f(cx)} ${f(baseY)}`,
    `C${f(cx + r * 0.9)} ${f(baseY)} ${f(cx + r * 1.02)} ${f(baseY - H * 0.3)} ${f(cx + r * 0.96)} ${f(baseY - H * 0.55)}`,
    `C${f(cx + r * 0.9)} ${f(baseY - H * 0.9)} ${f(cx + W * 0.2)} ${f(top)} ${f(cx - W * lean)} ${f(top)}`,
    `C${f(cx - W * 0.36)} ${f(top)} ${f(cx - r * 1.04)} ${f(baseY - H * 0.78)} ${f(cx - r)} ${f(baseY - H * 0.45)}`,
    `C${f(cx - r * 0.98)} ${f(baseY - H * 0.14)} ${f(cx - r * 0.8)} ${f(baseY)} ${f(cx)} ${f(baseY)}Z`,
  ].join(' ');
}

// 구름/솜 가장자리: 타원 위 N개 점을 바깥으로 부푼 2차 곡선으로 잇는다(형태 언어 C)
function puff({ cx, baseY, w, h, squash = 1, n = 11, bulge = 0.16, phase = 0 }) {
  const W = w / Math.sqrt(squash), H = h * squash;
  const cy = baseY - H / 2, rx = W / 2, ry = H / 2;
  const pt = (t, k = 1) => {
    const flatBottom = Math.sin(t) > 0 ? 0.9 : 1; // 아래쪽은 덜 부풀게
    return [cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k * flatBottom];
  };
  const step = (Math.PI * 2) / n;
  let d = '';
  for (let i = 0; i <= n; i++) {
    const t = Math.PI / 2 + phase + i * step;
    const [x, y] = pt(t);
    if (i === 0) { d += `M${f(x)} ${f(y)}`; continue; }
    const [qx, qy] = pt(t - step / 2, 1 + bulge * (Math.sin(t) > 0.6 ? 0.35 : 1));
    d += ` Q${f(qx)} ${f(qy)} ${f(x)} ${f(y)}`;
  }
  return d + 'Z';
}

// ── 얼굴 파츠 ──────────────────────────────────────────────────
// eye: open(0~1), mode: 'dot' | 'happy'(^) | 'closed'(-) | 'tall'
function eye({ x, y, r, open = 1, mode = 'dot', ink, sparkle = true, stroke = 4 }) {
  if (mode === 'happy')
    return `<path d="M${f(x - r)} ${f(y + r * 0.3)} Q${f(x)} ${f(y - r * 1.3)} ${f(x + r)} ${f(y + r * 0.3)}" fill="none" stroke="${ink}" stroke-width="${stroke}" stroke-linecap="round"/>`;
  if (mode === 'closed' || open < 0.15)
    return `<path d="M${f(x - r)} ${f(y)} Q${f(x)} ${f(y + r * 0.7)} ${f(x + r)} ${f(y)}" fill="none" stroke="${ink}" stroke-width="${stroke}" stroke-linecap="round"/>`;
  const rx = mode === 'tall' ? r * 0.72 : r, ry = (mode === 'tall' ? r * 1.15 : r) * open;
  let s = `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${ink}"/>`;
  if (sparkle && open > 0.5) {
    s += `<circle cx="${f(x + rx * 0.32)}" cy="${f(y - ry * 0.38)}" r="${f(r * 0.34)}" fill="#fff"/>`;
    s += `<circle cx="${f(x - rx * 0.3)}" cy="${f(y + ry * 0.4)}" r="${f(r * 0.14)}" fill="#fff" opacity=".8"/>`;
  }
  return s;
}

// mouth: curve(-1 슬픔 ~ +1 웃음), open(0~1), w 폭
function mouth({ x, y, w, curve = 0.5, open = 0, ink, tongue = '#FF8FA3', stroke = 3.5 }) {
  const dip = curve * w * 0.6;
  if (open <= 0.05)
    return `<path d="M${f(x - w)} ${f(y)} Q${f(x)} ${f(y + dip)} ${f(x + w)} ${f(y)}" fill="none" stroke="${ink}" stroke-width="${stroke}" stroke-linecap="round"/>`;
  if (curve === 0) // 'o' 모양(놀람)
    return `<ellipse cx="${f(x)}" cy="${f(y + w * 0.3)}" rx="${f(w * 0.55)}" ry="${f(w * 0.75 * open)}" fill="${ink}"/>` +
      `<ellipse cx="${f(x)}" cy="${f(y + w * 0.3 + w * 0.35 * open)}" rx="${f(w * 0.32)}" ry="${f(w * 0.25 * open)}" fill="${tongue}"/>`;
  const low = y + dip + w * 0.9 * open;
  return `<path d="M${f(x - w)} ${f(y)} Q${f(x)} ${f(y + dip * 0.25)} ${f(x + w)} ${f(y)} Q${f(x + w * 0.8)} ${f(low)} ${f(x)} ${f(low)} Q${f(x - w * 0.8)} ${f(low)} ${f(x - w)} ${f(y)}Z" fill="${ink}" stroke="${ink}" stroke-width="${stroke * 0.6}" stroke-linejoin="round"/>` +
    `<ellipse cx="${f(x)}" cy="${f(low - w * 0.28)}" rx="${f(w * 0.45)}" ry="${f(w * 0.22)}" fill="${tongue}"/>`;
}

const blush = (x, y, rx, color, a = 0.55) => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(rx * 0.55)}" fill="${color}" opacity="${a}"/>`;

// ── 표정 프리셋: 데이터일 뿐. 새 표정 = 객체 하나 추가 ────────────
const EXPRESSIONS = {
  idle:     { label: '기본',  squash: 1.0,  eyeOpen: 1,   eyeMode: 'dot',    mouthCurve: 0.45, mouthOpen: 0,   blushA: 0.45, extra: null },
  happy:    { label: '기쁨',  squash: 0.9,  eyeOpen: 1,   eyeMode: 'happy',  mouthCurve: 0.9,  mouthOpen: 0.7, blushA: 0.75, extra: 'sparkles' },
  sleepy:   { label: '졸림',  squash: 0.86, eyeOpen: 0,   eyeMode: 'closed', mouthCurve: 0.15, mouthOpen: 0,   blushA: 0.35, extra: 'zzz' },
  surprise: { label: '놀람',  squash: 1.12, eyeOpen: 1.15,eyeMode: 'dot',    mouthCurve: 0,    mouthOpen: 0.9, blushA: 0.3,  extra: 'pop' },
  sad:      { label: '시무룩', squash: 0.94, eyeOpen: 0.75,eyeMode: 'dot',    mouthCurve: -0.55,mouthOpen: 0,   blushA: 0.2,  extra: 'drop' },
};

function extras(kind, cx, top, ink, accent) {
  if (kind === 'sparkles') {
    const star = (x, y, s) => `<path d="M${f(x)} ${f(y - s)} Q${f(x)} ${f(y)} ${f(x + s)} ${f(y)} Q${f(x)} ${f(y)} ${f(x)} ${f(y + s)} Q${f(x)} ${f(y)} ${f(x - s)} ${f(y)} Q${f(x)} ${f(y)} ${f(x)} ${f(y - s)}Z" fill="${accent}"/>`;
    return star(cx - 62, top + 8, 9) + star(cx + 66, top + 22, 7) + star(cx + 48, top - 6, 5);
  }
  if (kind === 'zzz')
    return `<text x="${f(cx + 44)}" y="${f(top + 6)}" font-family="Arial Rounded MT Bold, Arial" font-weight="700" font-size="20" fill="${ink}" opacity=".55">z</text>` +
      `<text x="${f(cx + 58)}" y="${f(top - 12)}" font-family="Arial Rounded MT Bold, Arial" font-weight="700" font-size="14" fill="${ink}" opacity=".4">z</text>`;
  if (kind === 'pop')
    return `<path d="M${f(cx - 58)} ${f(top + 4)} l-10 -10 M${f(cx - 48)} ${f(top - 6)} l-4 -14 M${f(cx + 58)} ${f(top + 4)} l10 -10 M${f(cx + 48)} ${f(top - 6)} l4 -14" stroke="${ink}" stroke-width="3" stroke-linecap="round" opacity=".6"/>`;
  if (kind === 'drop')
    return `<path d="M${f(cx + 52)} ${f(top + 18)} q-7 12 0 16 q7 -4 0 -16Z" fill="#8EC5FF"/>`;
  return '';
}

// ── 시안 정의: 팔레트 + 형태 함수 + 얼굴 배치 비율 ─────────────────
const DIRECTIONS = [
  {
    file: 'A-mochi-jelly.svg', title: 'A. 말랑 모찌 — 무외곽선 · 파스텔 · 원형 언어',
    bg: '#FFF7F0', ink: '#3B2A2A', body: '#FFD9C7', bodyShade: '#F7B9A3', hi: '#FFFFFF', blush: '#FF8E8E', accent: '#FFC94D',
    shape: (p) => blob({ ...p, w: 150, h: 128, flat: 0.75 }),
    outline: null, faceY: 0.56, eyeGap: 26, eyeR: 9.5, mouthW: 9,
    prop: () => '',
  },
  {
    file: 'B-sprout-bean.svg', title: 'B. 새싹 콩 — 두꺼운 갈색 라인 · 내추럴 · 성장 표식(잎)',
    bg: '#F6F3E8', ink: '#4A3B32', body: '#CFE8B9', bodyShade: '#A9D18E', hi: '#F4FBEA', blush: '#F59E8B', accent: '#F7C948',
    shape: (p) => bean({ ...p, w: 140, h: 132 }),
    outline: { color: '#4A3B32', width: 5 }, faceY: 0.55, eyeGap: 24, eyeR: 8.5, mouthW: 8, eyeModeOverride: 'tall',
    // 성장 단계별로 잎 수/길이가 바뀌는 소품 = 파라미터 leafStage
    prop: (cx, top, squash) => {
      const lean = (1 - squash) * 40; // 눌리면 잎이 옆으로 눕는다(2차 동작)
      return `<path d="M${f(cx - 6)} ${f(top + 4)} q2 -18 ${f(6 + lean * 0.2)} -26" fill="none" stroke="#4A3B32" stroke-width="4.5" stroke-linecap="round"/>` +
        `<path d="M${f(cx + lean * 0.2)} ${f(top - 22)} c14 -14 34 -8 38 -2 c-12 12 -30 12 -38 2Z" fill="#8CCB6E" stroke="#4A3B32" stroke-width="4" stroke-linejoin="round"/>` +
        `<path d="M${f(cx + lean * 0.2 - 2)} ${f(top - 18)} c-10 -12 -26 -10 -30 -4 c10 10 24 10 30 4Z" fill="#A8DA8C" stroke="#4A3B32" stroke-width="4" stroke-linejoin="round"/>`;
    },
  },
  {
    file: 'C-dream-puff.svg', title: 'C. 꿈 솜뭉치 — 구름 가장자리 · 저채도 라벤더 · 밤/수면 테마',
    bg: '#2E2A4F', ink: '#2B2340', body: '#E6DDFB', bodyShade: '#C7B8F2', hi: '#FFFFFF', blush: '#FF9EC4', accent: '#FFE08A',
    shape: (p) => puff({ ...p, w: 152, h: 124 }),
    outline: null, faceY: 0.55, eyeGap: 27, eyeR: 9, mouthW: 8,
    prop: (cx, top) => `<path d="M${f(cx + 34)} ${f(top + 10)} a12 12 0 1 1 -2 -16 a9 9 0 1 0 2 16Z" fill="#FFE08A" opacity=".95"/>`,
    labelColor: '#E6DDFB',
  },
];

function character(dir, ex, cx, baseY) {
  const squash = ex.squash;
  const H = (dir.file.startsWith('B') ? 132 : dir.file.startsWith('C') ? 124 : 128) * squash;
  const W = (dir.file.startsWith('B') ? 140 : dir.file.startsWith('C') ? 152 : 150) / Math.sqrt(squash);
  const top = baseY - H;
  const d = dir.shape({ cx, baseY, squash });
  const faceY = top + H * dir.faceY;
  const gap = dir.eyeGap * (W / 150);
  const eyeMode = ex.eyeMode === 'dot' && dir.eyeModeOverride ? dir.eyeModeOverride : ex.eyeMode;
  const id = `${dir.file[0]}-${ex.label}`;
  let s = '';
  // 그림자(접지감)
  s += `<ellipse cx="${cx}" cy="${f(baseY + 4)}" rx="${f(W * 0.42)}" ry="7" fill="#000" opacity=".12"/>`;
  s += `<defs><clipPath id="clip-${id}"><path d="${d}"/></clipPath></defs>`;
  s += `<path d="${d}" fill="${dir.body}"/>`;
  // 아래쪽 음영 + 왼쪽 위 하이라이트(몸 안으로 클립) — 셀 셰이딩 2톤
  s += `<g clip-path="url(#clip-${id})"><ellipse cx="${f(cx + W * 0.12)}" cy="${f(baseY + H * 0.08)}" rx="${f(W * 0.62)}" ry="${f(H * 0.32)}" fill="${dir.bodyShade}" opacity=".55"/>` +
    `<ellipse cx="${f(cx - W * 0.2)}" cy="${f(top + H * 0.22)}" rx="${f(W * 0.14)}" ry="${f(H * 0.08)}" fill="${dir.hi}" opacity=".75" transform="rotate(-25 ${f(cx - W * 0.2)} ${f(top + H * 0.22)})"/></g>`;
  if (dir.outline) s += `<path d="${d}" fill="none" stroke="${dir.outline.color}" stroke-width="${dir.outline.width}" stroke-linejoin="round"/>`;
  s += dir.prop(cx, top, squash);
  const er = dir.eyeR * (ex.eyeOpen > 1 ? ex.eyeOpen : 1);
  s += eye({ x: cx - gap, y: faceY, r: er, open: Math.min(ex.eyeOpen, 1), mode: eyeMode, ink: dir.ink });
  s += eye({ x: cx + gap, y: faceY, r: er, open: Math.min(ex.eyeOpen, 1), mode: eyeMode, ink: dir.ink });
  s += blush(cx - gap - 12, faceY + 15, 11, dir.blush, ex.blushA);
  s += blush(cx + gap + 12, faceY + 15, 11, dir.blush, ex.blushA);
  s += mouth({ x: cx, y: faceY + 14, w: dir.mouthW, curve: ex.mouthCurve, open: ex.mouthOpen, ink: dir.ink });
  s += extras(ex.extra, cx, top, dir.file.startsWith('C') ? '#E6DDFB' : dir.ink, dir.accent);
  return s;
}

// 0일차(알) — 모든 시안 공통의 "시작" 형태. 금(crack) 깊이 파라미터로 부화 진행 표현
function egg(dir, cx, baseY, crack = 0.5) {
  const d = blob({ cx, baseY, w: 96, h: 120, flat: 0.55, topPinch: 0.18 });
  let s = `<ellipse cx="${cx}" cy="${baseY + 4}" rx="40" ry="6" fill="#000" opacity=".12"/>`;
  s += `<path d="${d}" fill="#FFFDF8"/>`;
  s += `<path d="${d}" fill="${dir.bodyShade}" opacity=".18"/>`;
  // 점무늬 = 미래 몽망이 몸색 힌트
  s += `<circle cx="${cx - 18}" cy="${baseY - 40}" r="8" fill="${dir.body}"/><circle cx="${cx + 20}" cy="${baseY - 70}" r="6" fill="${dir.body}"/><circle cx="${cx + 8}" cy="${baseY - 24}" r="5" fill="${dir.body}"/>`;
  if (dir.outline) s += `<path d="${d}" fill="none" stroke="${dir.outline.color}" stroke-width="${dir.outline.width}"/>`;
  const cy = baseY - 78, amp = 9 * crack;
  s += `<path d="M${cx - 28} ${cy} l10 ${f(amp)} l10 ${f(-amp)} l10 ${f(amp)} l10 ${f(-amp)} l10 ${f(amp)}" fill="none" stroke="${dir.ink}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" opacity="${f(0.3 + crack * 0.6)}"/>`;
  return s;
}

for (const dir of DIRECTIONS) {
  const keys = ['idle', 'happy', 'sleepy', 'surprise', 'sad'];
  const cellW = 200, W = 200 + cellW * keys.length, Hh = 330, baseY = 230;
  const label = dir.labelColor || dir.ink;
  let body = `<rect width="${W}" height="${Hh}" rx="24" fill="${dir.bg}"/>`;
  body += `<text x="24" y="40" font-family="Apple SD Gothic Neo, Arial" font-size="20" font-weight="700" fill="${label}">${dir.title}</text>`;
  body += egg(dir, 100, baseY, 0.6);
  body += `<text x="100" y="${baseY + 44}" text-anchor="middle" font-family="Apple SD Gothic Neo, Arial" font-size="15" fill="${label}" opacity=".8">0일차(알)</text>`;
  keys.forEach((k, i) => {
    const cx = 200 + cellW * i + cellW / 2;
    body += character(dir, EXPRESSIONS[k], cx, baseY);
    body += `<text x="${cx}" y="${baseY + 44}" text-anchor="middle" font-family="Apple SD Gothic Neo, Arial" font-size="15" fill="${label}" opacity=".8">${EXPRESSIONS[k].label} (squash ${EXPRESSIONS[k].squash})</text>`;
  });
  // 팔레트 칩
  const chips = [dir.body, dir.bodyShade, dir.ink, dir.blush, dir.accent, dir.bg];
  chips.forEach((c, i) => {
    body += `<rect x="${24 + i * 46}" y="${Hh - 44}" width="36" height="24" rx="6" fill="${c}" stroke="#00000022"/>`;
  });
  body += `<text x="${24 + chips.length * 46 + 8}" y="${Hh - 27}" font-family="Menlo, monospace" font-size="12" fill="${label}" opacity=".7">${chips.join('  ')}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}">${body}</svg>\n`;
  writeFileSync(join(OUT, dir.file), svg);
  console.log('wrote', dir.file, svg.length, 'bytes');
}
