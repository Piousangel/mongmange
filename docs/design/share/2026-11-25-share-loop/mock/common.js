// 공유 루프 v1 목업 공통 — 몽망이 SVG·모티프 경로. 탐색 시안 전용(앱 코드 아님).
var M = '../../../../../apps/mobile/assets/motifs/r1/';
var MOTIF = {
  umbrella: M + 'near-with.umbrella.webp',
  boat: M + 'far-alone.paper-boat.webp',
  kite: M + 'far-alone.kite.webp',
  stones: M + 'far-with.stepping-stones.webp',
  teacup: M + 'near-alone.teacup.webp',
  teacup2: M + 'near-with.teacup-two.webp',
  quilt: M + 'near-alone.quilt.webp',
  line: M + 'near-alone.washing-line.webp',
  letter: M + 'near-with.letter.webp',
  inkstone: M + 'near-alone.inkstone.webp',
};

/** 몽망이: 둥근 먹 한 방울 + 흰 눈 둘 + 빗 세 가닥. strokes = 이레 획 수(0~4), asleep = 감은 눈 */
function mong(size, { strokes = 0, asleep = false, newStroke = false } = {}) {
  const eyes = asleep
    ? `<path d="M35 55 q6 5 12 0" stroke="#efe8da" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M57 55 q6 5 12 0" stroke="#efe8da" stroke-width="3.2" fill="none" stroke-linecap="round"/>`
    : `<circle cx="41" cy="54" r="6" fill="#f6f1e6"/><circle cx="63" cy="54" r="6" fill="#f6f1e6"/>`;
  // 이레마다 한 획 — 굵고 분명하게(오너 ①). 마지막 획은 금빛 테두리로 '방금 남은 것'
  const S = [
    'M80 40 q10 16 2 34',
    'M70 30 q14 10 12 30',
    'M24 38 q-6 16 2 28',
    'M48 84 q18 -2 30 -14',
  ];
  const st = S.slice(0, strokes).map((d, i) => {
    const last = newStroke && i === strokes - 1;
    return `${last ? `<path d="${d}" stroke="#c9a85c" stroke-width="11" fill="none" stroke-linecap="round" opacity=".55"/>` : ''}<path d="${d}" stroke="#8a7f70" stroke-width="7" fill="none" stroke-linecap="round"/>`;
  }).join('');
  return `<svg viewBox="0 0 104 104" width="${size}" height="${size}" aria-hidden="true">
    <path d="M52 20 q-2 -10 6 -14 M60 22 q4 -9 12 -10 M44 22 q-6 -7 -14 -6" stroke="#1d1a17" stroke-width="3.4" fill="none" stroke-linecap="round"/>
    <ellipse cx="52" cy="58" rx="40" ry="37" fill="#1d1a17"/>
    ${st}${eyes}</svg>`;
}

/** 물길(흰 마블링 띠) — 조각들을 한 장으로 잇는 장. d = SVG path들 */
function water(w, h, paths, { stroke = '#8c8478', op = 0.35 } = {}) {
  return `<svg class="water" viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">${paths
    .map((d, i) => `<path d="${d}" stroke="${stroke}" stroke-width="${1.2 + (i % 3) * 0.8}" fill="none" vector-effect="non-scaling-stroke" opacity="${op - (i % 4) * 0.05}" stroke-linecap="round"/>`)
    .join('')}</svg>`;
}
