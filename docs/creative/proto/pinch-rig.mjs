// 디렉션 A "분청 꼬집" 파라메트릭 실루엣 실증.
// 하나의 함수 pinchBody(p)가 SVG path d 문자열을 만든다 → Skia.Path.MakeFromSVGString에 그대로 쓸 수 있다.
// node pinch-rig.mjs > pinch-rig.svg
const P = { clay: '#8F8a82', clayDark: '#6f6a63', slip: '#EFE9DD', celadon: '#9FB8A6', iron: '#5A3E2E', persimmon: '#C9774E', bg: '#F4EFE6' };

// h: 키, base: 바닥 폭, lean: 기울기(-1~1), curl: 꼭지 말림(0~1), squash: 눌림(0.8~1.2)
function pinchBody({ h = 200, base = 120, lean = 0.3, curl = 0.7, squash = 1 }) {
  const H = h * squash, B = base / Math.sqrt(squash); // 부피 보존
  const tipX = lean * H * 0.35, tipY = -H;
  const r = 10 + curl * 16; // 꼭지 말림 반경
  const L = -B / 2, R = B / 2;
  return [
    `M ${L} 0`,
    `C ${L - 4} ${-H * 0.35}, ${tipX - B * 0.28} ${-H * 0.7}, ${tipX - 6} ${tipY + r}`,
    // 꼭지: 위로 올라가 앞으로 말린다
    `C ${tipX - 6} ${tipY - r * 0.4}, ${tipX + r * 1.6} ${tipY - r * 0.6}, ${tipX + r * 1.5} ${tipY + r * 0.5}`,
    `C ${tipX + r * 1.4} ${tipY + r * 1.1}, ${tipX + r * 0.6} ${tipY + r * 1.0}, ${tipX + r * 0.7} ${tipY + r * 0.55}`,
    `C ${tipX + r * 0.5} ${tipY + r * 1.6}, ${tipX + B * 0.30} ${-H * 0.55}, ${R} ${-H * 0.12}`,
    `Q ${R + 3} 0, ${R - 12} 0`,
    `Z`,
  ].join(' ');
}

// 분청 기법 = 무늬 파츠 (실제 기법 이름이 곧 파츠 카탈로그)
const techniques = {
  gwiyal: (b) => [0.25, 0.45].map((t, i) => `<path d="M ${-b.base * 0.45} ${-b.h * t} q ${b.base * 0.5} ${-18 - i * 6} ${b.base * 0.9} ${-6}" stroke="${P.slip}" stroke-width="${9 - i * 2}" stroke-linecap="round" fill="none" opacity=".9"/>`).join(''), // 귀얄(붓질)
  inhwa: (b) => { let s = ''; for (let y = 0.18; y < 0.7; y += 0.13) for (let x = -0.3; x <= 0.3; x += 0.15) s += `<circle cx="${x * b.base * (1 - y)}" cy="${-b.h * y}" r="2.6" fill="${(x * 10 + y * 10) % 3 < 1 ? P.persimmon : P.slip}"/>`; return s; }, // 인화(도장)
  deombeong: (b) => `<rect x="${-b.base}" y="${-b.h * 1.3}" width="${b.base * 2}" height="${b.h * 0.75}" fill="${P.slip}"/>`, // 덤벙(담금)
  sanggam: (b) => [0.3, 0.42].map((t) => `<path d="M ${-b.base / 2} ${-b.h * t} C 0 ${-b.h * t - 30}, 10 ${-b.h * t + 10}, ${b.base / 2} ${-b.h * t - 20}" stroke="${P.iron}" stroke-width="3" fill="none"/>`).join(''), // 상감(선 박기)
  plain: () => '',
};

function mong(cfg, tech, glaze, x, y, label) {
  const d = pinchBody(cfg);
  const id = `c${x}_${y}`;
  const drip = glaze ? `<path d="M ${cfg.lean * cfg.h * 0.35 - 8} ${-cfg.h + 18} q -4 40 2 ${cfg.h * 0.3} q 6 10 10 0 q 2 -30 4 ${-cfg.h * 0.28}" fill="${P.celadon}" opacity=".95"/>` : '';
  const fy = -cfg.h * 0.13;
  return `<g transform="translate(${x} ${y})">
    <ellipse cx="0" cy="2" rx="${cfg.base * 0.55}" ry="6" fill="#000" opacity=".10"/>
    <clipPath id="${id}"><path d="${d}"/></clipPath>
    <path d="${d}" fill="${P.clay}"/>
    <g clip-path="url(#${id})">${techniques[tech](cfg)}${drip}
      <path d="${d}" fill="url(#shade)"/></g>
    <circle cx="-9" cy="${fy}" r="2.4" fill="${P.iron}"/><circle cx="9" cy="${fy}" r="2.4" fill="${P.iron}"/>
    <line x1="-3" y1="${fy + 8}" x2="3" y2="${fy + 8}" stroke="${P.iron}" stroke-width="1.6" stroke-linecap="round"/>
    <text y="34" text-anchor="middle" font-family="Georgia, serif" font-size="12" fill="${P.iron}">${label}</text>
  </g>`;
}

const row = [
  [{ h: 70, base: 70, lean: 0, curl: 0.1 }, 'plain', true, '0일차 · 날흙'],
  [{ h: 150, base: 110, lean: 0.25, curl: 0.6 }, 'gwiyal', false, '귀얄 · 느긋'],
  [{ h: 230, base: 100, lean: 0.15, curl: 0.9 }, 'inhwa', false, '인화 · 사교'],
  [{ h: 170, base: 120, lean: 0.6, curl: 1 }, 'deombeong', false, '덤벙 · 대담'],
  [{ h: 200, base: 96, lean: -0.3, curl: 0.5 }, 'sanggam', true, '상감 · 섬세'],
  [{ h: 150, base: 110, lean: 0.25, curl: 0.6, squash: 0.82 }, 'gwiyal', false, '꾹 누름(squash)'],
];

const W = 1200, Hh = 900;
const body = row.map((r, i) => mong(r[0], r[1], r[2], 220 + (i % 3) * 380, 380 + Math.floor(i / 3) * 420, r[3])).join('\n');
console.log(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}">
<defs><linearGradient id="shade" x1="0" y1="0" x2="1" y2="0.3"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient></defs>
<rect width="100%" height="100%" fill="${P.bg}"/>
<text x="40" y="44" font-family="Georgia, serif" font-size="16" fill="${P.iron}">A. 분청 꼬집 — pinchBody(h, base, lean, curl, squash) × 분청 기법 파츠 · 코드 실증</text>
${body}
</svg>`);
