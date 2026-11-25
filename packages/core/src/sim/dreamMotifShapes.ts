// 꿈 모티프 형상 15(로드맵 C14b, dreams-30days v1.1 1-5 형상 규칙). 순수 데이터.
// - 모양 = 스키마 1 `paths`(SVG 경로, 그림 좌표 0..100 정사각, y 아래, 선 굵기 `w`도 같은 단위). 원격 모티프 파일과 같은 꼴이라
//   64px 구별 틀(`test/motif-distinct.test.ts`)과 카드 렌더(`visual/motifInk.ts` → 앱 `DreamCardArt`)가 같은 데이터를 읽는다.
// - 붓 문법(아트 바이블 1·4절): 먹(`ink`) = 붓 한 번에 그은 선(돈필 → 수필, 렌더가 폭을 깎는다), 담묵(`wash`) = 넓게 번진 옅은 먹,
//   금(`gold`) = 머리카락 굵기 점(은하수 다리의 금점만 — 기존 '별과 물방울'과 같은 쓰임). 주사·하늘색 없음.
// - 금지(1-1): 과녁·닫힌 원 안의 점, 손가락 갈래, 부리·깃·날개, 방사형 가시, 눈 있는 다른 방울, 위기·감정 소재, 몸 크기 변화(R8·R9 —
//   몽망이 몸은 늘 렌더 정본 그대로이고, 형상은 몸 밖 물 위에만 놓인다).
// - `seat` = 몽망이가 앉는 자리(그림 좌표). 렌더는 이 점이 몽망이 중심(c0)에 오게 그림을 놓는다. `friend` = 곁의 다른 방울 [x, y, 몸 배율].
// - `water: 'clear'` = 이 모티프는 먹으로 그리지 않고 점마다 맑은 물방울을 떨군다(소리 없는 눈 — 1-5 '고리 없는 한 겹 맑은 점').
import type { MotifPathData } from '../moon/motifs';

export interface MotifShape {
  paths: readonly MotifPathData[];
  seat: readonly [number, number];
  friend?: readonly [number, number, number];
  water?: 'clear';
}

const f1 = (v: number) => Math.round(v * 10) / 10;
const P = (d: string, w: number, layer: MotifPathData['layer'] = 'ink'): MotifPathData => ({ d, w, layer });
/** 점 하나(길이 0에 가까운 획 — 렌더는 둥근 방울, 64px 틀은 지름 w 원) */
const dot = (x: number, y: number) => `M${f1(x)} ${f1(y)} l0.1 0`;
/** 납작 타원(3차 베지어 4개) */
function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  const k = 0.5523;
  const a = f1(cx - rx);
  const b = f1(cx + rx);
  const t = f1(cy - ry);
  const u = f1(cy + ry);
  const kx = rx * k;
  const ky = ry * k;
  return (
    `M${a} ${f1(cy)} C${a} ${f1(cy - ky)} ${f1(cx - kx)} ${t} ${f1(cx)} ${t} C${f1(cx + kx)} ${t} ${b} ${f1(cy - ky)} ${b} ${f1(cy)} ` +
    `C${b} ${f1(cy + ky)} ${f1(cx + kx)} ${u} ${f1(cx)} ${u} C${f1(cx - kx)} ${u} ${a} ${f1(cy + ky)} ${a} ${f1(cy)}`
  );
}
/** ㅅ자 하나(기러기 — 부리·깃 없음) */
const goose = (x: number, y: number, s = 5.6) => `M${f1(x - s)} ${f1(y + s * 0.75)} Q${f1(x - s * 0.35)} ${f1(y + s * 0.1)} ${f1(x)} ${f1(y)} Q${f1(x + s * 0.35)} ${f1(y + s * 0.1)} ${f1(x + s)} ${f1(y + s * 0.75)}`;
/** 2차 베지어 위의 점 */
const quadAt = (p0: [number, number], c: [number, number], p1: [number, number], t: number): [number, number] => [
  (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0],
  (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1],
];

// 은하수 다리: 한 띠(2차 곡선) 위에 금점·먹점을 번갈아. 띠 밖 점 금지(1-5)
const BRIDGE: [[number, number], [number, number], [number, number]] = [[20, 66], [50, 6], [80, 66]];
const bridgeDots = (gold: boolean) =>
  Array.from({ length: 13 }, (_, i) => i)
    .filter((i) => (i % 3 === 1) === gold)
    .map((i) => {
      const [x, y] = quadAt(...BRIDGE, 0.08 + (0.84 * i) / 12);
      return dot(x, y);
    })
    .join(' ');

// 소리 없는 눈: 위에서 아래로 성기게(같은 줄에 몰리지 않게 손으로 놓은 자리). 금점 없음
const SNOW: readonly [number, number, number][] = [
  [18, 10, 5.4],
  [46, 6, 4.4],
  [74, 12, 5.8],
  [32, 26, 4.8],
  [62, 30, 6],
  [88, 34, 4.4],
  [14, 44, 5.6],
  [44, 48, 5],
  [78, 54, 4.8],
  [24, 66, 4.2],
  [86, 74, 5.4],
  [64, 84, 4.2],
];

export const MOTIF_SHAPES: Readonly<Record<string, MotifShape>> = {
  // 벼루 곁 낮잠: 아래 1/3 둥근 사각 벼루 테(가로 빗질 두 번) + 한쪽 끝 오목한 연지의 담묵 고임. 몽망이는 위쪽 모서리 바깥
  'near-alone.inkstone': {
    paths: [
      P('M26 60 L84 60 Q92 60 92 68 L92 82 Q92 90 84 90 L26 90 Q18 90 18 82 L18 68 Q18 60 26 60', 3.4),
      P('M25 66.5 L85 66.5', 1.6),
      P('M70 77 Q76 74.5 82 77', 7, 'wash'),
      P('M30 78 L58 78', 1.2, 'wash'),
    ],
    seat: [28, 40],
  },
  // 빨랫줄: 위쪽 살짝 처진 가로 끌기 한 줄 + 그 아래 한지 두 장(사각 빗질). 집게 없음 — 편지와 구별은 '위에 줄'
  'near-alone.washing-line': {
    paths: [
      P('M4 20 Q50 34 96 18', 2.2),
      P('M18 25 L44 29.5 L41 62 L15 58 Z', 2.6),
      P('M57 29.5 L82 25.5 L85 57 L60 61 Z', 2.6),
      P('M21 40 L40 43', 1.4, 'wash'),
      P('M61 42 L80 39', 1.4, 'wash'),
    ],
    seat: [50, 82],
  },
  // 작은 싹: 아래 사다리꼴 화분(빗질) + 바늘로 두 번 끌어 올린 떡잎 둘(셋부터 손가락·불꽃 — 둘까지)
  'near-alone.sprout': {
    paths: [
      P('M20 62 L60 62', 4.2),
      P('M23 62 L29 92 L51 92 L57 62', 3),
      P('M40 61 Q41 52 40 43', 2.2),
      P('M40 44 Q28 28 14 33 Q24 45 40 44', 2.4),
      P('M40 44 Q50 25 66 28 Q58 42 40 44', 2.4),
      P('M27 76 L53 76', 1.4, 'wash'),
    ],
    seat: [78, 80],
  },
  // 우산 하나에 둘: 위로 볼록한 큰 호 + 가운데 세로 손잡이 한 줄(비구름·오목한 손과 구별). 아래는 열어 둔다. 빗점은 호 바깥에만.
  // 호 아래 몽망이와 다른 방울이 나란히(맞댐)
  'near-with.umbrella': {
    paths: [
      P('M8 48 Q50 2 92 48', 3.4),
      P('M8 48 Q19 42 29 47 M71 47 Q81 42 92 48', 1.6),
      P('M50 21 L50 58 Q50 64 45 63', 2.6),
      P(`${dot(10, 22)} ${dot(24, 9)} ${dot(78, 8)} ${dot(92, 24)}`, 2.2, 'wash'),
    ],
    seat: [32, 74],
    friend: [66, 76, 0.55],
  },
  // 문틈의 편지: 위쪽 굵은 가로 빗질 띠(문지방) + 그 아래 약 15° 기운 사각, 대각 접힘선 둘. 봉인·글자 없음
  'near-with.letter': {
    paths: [
      P('M2 14 L98 14', 6),
      P('M2 23 L98 23', 4, 'wash'),
      P('M34 30.1 L82.3 43 L74 73.9 L25.7 61 Z', 2.6),
      P('M34 30.1 L52.6 55.2 L82.3 43', 1.6),
    ],
    seat: [22, 86],
  },
  // 오목한 손: 아래쪽 넓은 U자 담묵 호 하나(손가락 갈래 없음) + 바깥 테 한 줄. 몽망이는 호 안 한쪽
  'near-with.palm': {
    paths: [
      P('M6 34 Q8 94 50 94 Q90 94 94 40', 3),
      P('M16 50 Q20 84 50 85 Q80 84 84 52', 8, 'wash'),
      P('M90 46 Q95 36 90 28', 2),
    ],
    seat: [40, 66],
  },
  // 종이배: 위쪽 1/3에 배(바늘 V 끌기) + 위 삼각 돛 + 아래 가로 물띠. 몽망이는 앞 물가에서 바라본다
  'far-alone.paper-boat': {
    paths: [
      P('M24 32 L76 32 L65 44 L35 44 Z', 2.6),
      P('M38 32 L50 10 L62 32', 2.4),
      P('M2 50 Q26 46 50 50 T98 50', 4, 'wash'),
      P('M10 60 Q20 57 30 60 M62 64 Q72 61 82 64', 1.6),
    ],
    seat: [50, 82],
  },
  // 높이 뜬 연: 위 모서리 마름모(십자 살, 가운데 구멍 없음) + 몽망이 쪽으로 내려오는 긴 실 + 먹 꼬리
  'far-alone.kite': {
    paths: [
      P('M74 4 L90 24 L74 44 L58 24 Z', 2.6),
      P('M74 4 L74 44 M58 24 L90 24', 1.3),
      P('M74 44 C68 62 46 66 30 76', 1.2),
      P('M74 44 Q86 52 80 60 Q74 68 86 76', 1.8),
    ],
    seat: [22, 84],
  },
  // 굽이진 길: 아래 넓고 위로 좁아지는 S 두 줄, 소실점은 위 모서리. 몽망이는 길 입구에서 바라본다(걷지 않음)
  'far-alone.path': {
    paths: [
      P('M0 86 C30 82 60 76 53 58 C46 42 62 22 78 6', 2.8),
      P('M76 99 C86 84 90 70 74 56 C62 44 72 24 82 6', 2),
      P('M58 96 C70 84 74 72 64 62', 3, 'wash'),
    ],
    seat: [40, 92],
  },
  // 줄지은 기러기: 작은 ㅅ자 8개를 비스듬한 V 열로(부리·깃 없음). 맨 끝 하나가 몽망이 쪽으로 처진다
  'far-with.geese': {
    paths: [P([goose(82, 10), goose(72, 16), goose(62, 22), goose(52, 28), goose(78, 26), goose(73, 36), goose(68, 46), goose(40, 42)].join(' '), 2.3)],
    seat: [22, 80],
  },
  // 은하수 다리: 한 띠(담묵) 위에 금점·먹점, 양끝에 몽망이와 다른 방울. 띠 밖 점 없음
  'far-with.star-bridge': {
    paths: [
      P(`M${BRIDGE[0].join(' ')} Q${BRIDGE[1].join(' ')} ${BRIDGE[2].join(' ')}`, 7, 'wash'),
      P(bridgeDots(false), 3.2),
      P(bridgeDots(true), 3.6, 'gold'),
    ],
    seat: [14, 80],
    friend: [86, 80, 0.55],
  },
  // 징검다리(20번 자리 기본값): 고리 없는 납작 타원 디딤 방울 6개를 대각 줄로 — 몽망이에게서 다른 방울까지. 금 테 없음
  'far-with.stepping-stones': {
    paths: [
      P([ellipse(30, 78, 8, 3), ellipse(43, 67, 7, 2.7), ellipse(54, 57, 6, 2.4), ellipse(63, 48, 5.2, 2.1), ellipse(71, 40, 4.5, 1.8), ellipse(78, 33, 3.8, 1.5)].join(' '), 2),
      P('M24 80 L36 80 M38 69 L48 69 M50 59 L58 59', 2.4, 'wash'),
    ],
    seat: [14, 88],
    friend: [86, 24, 0.5],
  },
  // 떠가는 잎: 바늘 두 호(잎 윤곽) + 가운데 맥 한 줄(방사 맥 없음), 몽망이보다 크지 않게. 지나온 물결 두 줄
  'center.leaf': {
    paths: [
      P('M54 50 Q58 22 88 16 Q84 46 54 50', 2.8),
      P('M54 50 Q70 36 88 16', 1.4),
      P('M54 50 L48 56', 2),
      P('M14 52 Q28 47 42 52 M24 63 Q38 58 52 63', 2.2, 'wash'),
    ],
    seat: [38, 76],
  },
  // 소리 없는 눈: 고리 없는 한 겹 맑은 점, 위에서 아래로 성기게(금점 없음 — 별과 구별). 카드에서는 맑은 물방울로 떨군다
  'center.snow': {
    paths: SNOW.map(([x, y, w]) => P(dot(x, y), w, 'wash')),
    seat: [50, 86],
    water: 'clear',
  },
  // 지나가는 바람: 대각 S 빗질 세 겹, 오른쪽 위로 빠진다. 결(④)과 구별되게 굵게
  'center.wind': {
    paths: [
      P('M4 92 C24 70 42 92 58 66 S84 40 98 24', 3.4),
      P('M14 98 C34 78 50 98 68 74 S92 50 99 40', 2.6),
      P('M2 76 C20 56 36 76 50 52 S74 26 90 10', 2.2, 'wash'),
    ],
    seat: [24, 30],
  },
};
