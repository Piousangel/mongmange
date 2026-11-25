// 꿈 모티프 형상 15(로드맵 C14b, dreams-30days v1.1 1-5 형상 규칙). 순수 데이터.
// v2(11-25 아트 리뷰 `docs/team/reviews/2026-11-25-c14b-art-review.md`, 아트 바이블 7-6): **꿈은 물이 받아들인 그림이다.**
// 표현 순서 ① 장(`field` — 마블링 띠를 밀고·당기고·비우고·빗질) ② 면(닫힌 `wash` 경로 = 외곽선 없는 담묵 면 + 젖은 테)
// ③ 획(열린 `ink` 경로 — 편필 한 획·비백 한 줄, 보조로만). 모든 모티프는 ① 또는 ②를 가진다(시험이 고정).
// - 모양 = 스키마 1 `paths`(SVG 경로, 그림 좌표 0..100 정사각, y 아래, 굵기 `w`도 같은 단위) + `field`(장 조작, 같은 좌표).
// - 닫힌 기하 외곽선 금지(사각·봉투·화분·타원 고리): 먹(`ink`) 경로는 닫지 않는다. 닫힌 모양은 담묵 면으로만.
// - 금(`gold`)은 은하수 다리의 금가루뿐(머리카락 굵기 점). 주사·하늘색 없음. 위기·감정 소재, 몸 크기 변화(R8·R9) 없음.
// - `seat` = 몽망이 자리(그림 좌표 — 렌더가 이 점을 몽망이 중심에 둔다). `friend` = 곁의 다른 방울 [x, y, 몸 배율](눈 없음).
// - `water: 'clear'` = 경로를 먹으로 그리지 않는다(점 기록만 — 소리 없는 눈은 `field`의 맑은 방울이 그림이다).
import type { MotifPathData } from '../moon/motifs';
import type { MotifFieldOp } from '../visual/motifInk';

export interface MotifShape {
  paths: readonly MotifPathData[];
  field: readonly MotifFieldOp[];
  seat: readonly [number, number];
  friend?: readonly [number, number, number];
  water?: 'clear';
}

const f1 = (v: number) => Math.round(v * 10) / 10;
const P = (d: string, w: number, layer: MotifPathData['layer'] = 'ink'): MotifPathData => ({ d, w, layer });
/** 점 하나(길이 0에 가까운 획 — 렌더는 둥근 방울, 64px 틀은 지름 w 원) */
const dot = (x: number, y: number) => `M${f1(x)} ${f1(y)} l0.1 0`;
const drop = (x: number, y: number, r: number, ink: number): MotifFieldOp => ({ k: 'drop', x, y, r, ink });
const tine = (x: number, y: number, dx: number, dy: number, lambda: number, o: { len?: number; gauss?: boolean } = {}): MotifFieldOp => ({ k: 'tine', x, y, dx, dy, lambda, ...o });
/** ㅅ자 하나(기러기 — 부리·깃 없음). 열린 획 */
const goose = (x: number, y: number, s: number) =>
  `M${f1(x - s)} ${f1(y + s * 0.75)} Q${f1(x - s * 0.35)} ${f1(y + s * 0.1)} ${f1(x)} ${f1(y)} Q${f1(x + s * 0.4)} ${f1(y + s * 0.05)} ${f1(x + s * 1.05)} ${f1(y + s * 0.85)}`;
/** 손으로 그은 듯 가장자리가 들쭉날쭉한 닫힌 면(꼭짓점 사이를 2차 곡선으로, 결정적 흔들림) */
function face(pts: readonly (readonly [number, number])[], wob = 1.6): string {
  const n = pts.length;
  let d = `M${f1(pts[0]![0])} ${f1(pts[0]![1])}`;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const nx = -(b[1] - a[1]);
    const ny = b[0] - a[0];
    const l = Math.hypot(nx, ny) || 1;
    const k = (((i * 7 + 3) % 5) / 4 - 0.5) * 2 * wob;
    d += ` Q${f1(mx + (nx / l) * k)} ${f1(my + (ny / l) * k)} ${f1(b[0])} ${f1(b[1])}`;
  }
  return d;
}

// 은하수 다리: 띠(아래 장의 들어올림)를 따라 금가루 — 크기·간격 불규칙, 가운데는 성기게(로딩 스피너 금지)
const BRIDGE_T: readonly [number, number, boolean][] = [
  [0.06, 2.8, false],
  [0.11, 3.6, true],
  [0.19, 2.2, true],
  [0.24, 3.2, false],
  [0.33, 2.6, true],
  [0.47, 3.4, true],
  [0.62, 2.4, true],
  [0.7, 3, false],
  [0.77, 3.8, true],
  [0.83, 2.2, true],
  [0.9, 3, false],
];
const bridgeAt = (t: number): [number, number] => [20 + 60 * t, 66 - 4 * 54 * t * (1 - t)];
const bridgeDots = (gold: boolean) =>
  BRIDGE_T.filter(([, , g]) => g === gold).map(([t, w]) => {
    const [x, y] = bridgeAt(t);
    return P(dot(x, y + (w - 3) * 1.2), w, gold ? 'gold' : 'ink');
  });

// 소리 없는 눈: 점 크기 3단(큰·가운데·작은), 위에서 아래로 성기게 + 아래쪽 한 줄은 띠 위에 쌓인 흰 테
const SNOW: readonly [number, number, number][] = [
  [20, 10, 7],
  [52, 8, 4.4],
  [80, 16, 2.8],
  [34, 28, 4.4],
  [66, 34, 7],
  [88, 44, 2.8],
  [14, 46, 2.8],
  [46, 50, 4.4],
];
const SNOW_BANK: readonly [number, number, number][] = [
  [56, 66, 5],
  [66, 64, 6],
  [77, 66, 5],
  [86, 69, 4],
];

export const MOTIF_SHAPES: Readonly<Record<string, MotifShape>> = {
  // 벼루 곁 낮잠: 마블링 띠가 한 점으로 빨려 들어가 짙게 고인 먹못(가장자리가 짙은 젖은 테 — 짙은 방울 안에 옅은 방울).
  // 먹못은 옆으로 끌어 타원으로 늘이고, 몽망이 쪽에서 감아 띠가 빨려 들게 한다. 곁에 먹 한 자루(편필 한 획). 몽망이는 그 물가에서 존다
  'near-alone.inkstone': {
    paths: [P('M26 86 Q34 82 42 80', 6)],
    field: [drop(65, 71, 15, 0.6), drop(65, 71, 11.5, 0.32), tine(65, 71, 8, 1, 7, { gauss: true }), { k: 'curl', x: 54, y: 64, angle: 2.6, radius: 22 }],
    seat: [30, 58],
  },
  // 문틈의 편지: 문틈 = 담묵 가로 띠 한 줄, 그 아래로 한지 한 장이 비스듬히 스며든다(맑은 물이 띠를 밀어낸 자리 + 옅은 면,
  // 접힌 자리만 겹쳐 짙게). 문틈에서 아래로 띠가 끌려 내려온다. 봉투·글자·외곽선 없음
  'near-with.letter': {
    paths: [
      P('M0 19 Q50 22 100 18', 6, 'wash'),
      P(face([[40, 30], [84, 40], [76, 70], [32, 60]], 1.8), 1.7, 'wash'),
      P(face([[58, 34], [64, 35.5], [56, 66], [50, 64.5]], 0.6), 1, 'wash'),
    ],
    field: [tine(58, 22, 0, 9, 22, { gauss: true }), drop(58, 50, 13, 0)],
    seat: [22, 84],
  },
  // 빨랫줄: 줄 = 비백 한 획(끝이 갈라짐). 한지 두 자락 = 마블링 띠가 줄에 걸려 아래로 처진 면(장을 아래로 늘어뜨림) + 찢긴 결 담묵 면
  'near-alone.washing-line': {
    paths: [
      P('M2 22 Q50 33 98 17', 2.6),
      P(face([[18, 26], [42, 29], [41, 52], [34, 58], [26, 55], [17, 59]], 1.4), 1.3, 'wash'),
      P(face([[58, 29], [82, 25], [84, 50], [76, 55], [68, 52], [60, 57]], 1.4), 1.3, 'wash'),
    ],
    field: [tine(30, 30, 0, 15, 8, { gauss: true }), tine(70, 28, 0, 13, 8, { gauss: true })],
    seat: [50, 84],
  },
  // 작은 싹: 찻잔 김과 같은 문법 — 마블링 띠 한 줄이 위로 솟아(들어올림) 두 갈래로 갈라진다. 떡잎 둘은 편필 한 번 누름.
  // 몸 곁 흙은 담묵 번짐 한 덩이(방울). 화분 없음
  'near-alone.sprout': {
    paths: [P('M39 47 Q33 40 25 39', 5.5), P('M41 44 Q48 26 68 22', 7.5), P('M40 72 Q42 60 40 48', 3, 'wash')],
    field: [tine(40, 70, 0, -22, 6, { gauss: true }), tine(40, 44, -7, -3, 4, { len: 10 }), tine(40, 44, 7, -3, 4, { len: 10 }), drop(40, 76, 9, 0.3)],
    seat: [76, 78],
  },
  // 종이배: 접힌 면 셋을 농담 차로만(밝은 면·그늘 면 겹침), 외곽선 없음. 배 밑 띠가 눌려 휘고, 뒤로 물살 자국이 끌린다
  'far-alone.paper-boat': {
    paths: [
      P(face([[24, 38], [76, 38], [64, 48], [36, 48]], 1), 1.1, 'wash'),
      P(face([[50, 12], [50, 38], [34, 38]], 0.8), 1.1, 'wash'),
      P(face([[50, 12], [66, 38], [50, 38]], 0.8), 1, 'wash'),
      P(face([[50, 14], [50, 38], [38, 38]], 0.6), 1, 'wash'),
    ],
    field: [tine(50, 50, 0, 7, 14, { gauss: true }), tine(18, 52, -14, 1, 3, { len: 24 }), tine(84, 52, 12, 1, 3, { len: 18 })],
    seat: [50, 82],
  },
  // 높이 뜬 연: 가오리연 = 담묵 마름모 면(외곽선 없음, 위쪽만 겹쳐 짙게 고임). 꼬리 = 연에서 풀려 나오는 마블링 띠 한 가닥.
  // 연줄 = 몸에서 시작하는 아주 가는 비백 한 획. 방패연 구멍 없음
  'far-alone.kite': {
    paths: [
      P(face([[72, 4], [92, 27], [72, 50], [52, 27]], 1.2), 1.3, 'wash'),
      P(face([[72, 4], [92, 27], [52, 27]], 0.8), 1, 'wash'),
      P('M40 80 C52 72 66 64 72 51', 1.1),
    ],
    // 연 밑의 띠가 연 쪽으로 들려 올라가고(바람에 당긴 줄), 꼬리는 연에서 풀려 나오는 띠 두 가닥
    field: [tine(72, 66, 0, -16, 9, { gauss: true }), tine(76, 56, 6, 16, 3, { len: 22 }), tine(82, 68, 8, 8, 2.5, { len: 14 })],
    seat: [32, 90],
  },
  // 징검다리: 채운 납작 방울(담묵 면이 띠를 밀어냄) 다섯, 멀수록 작고 옅게. 아래 가장자리만 짙게 번진다. 끝에 다른 방울
  'far-with.stepping-stones': {
    paths: [P('M23 81 Q30 83.5 37 81', 2.4, 'wash'), P('M38 70 Q44 72 50 70', 2, 'wash'), P('M51 60 Q56 62 61 60', 1.6, 'wash')],
    field: [drop(30, 78, 7.5, 0.5), drop(44, 67, 6.2, 0.42), drop(56, 57, 5, 0.34), drop(66, 48, 4, 0.27), drop(74, 40, 3.2, 0.2)],
    seat: [14, 88],
    friend: [86, 26, 0.5],
  },
  // 떠가는 잎: 편필 한 획(누르며 시작해 배가 부풀고 빠짐)만. 잎이 지나간 뒤로 띠가 끌려 흐른다(떠내려감)
  'center.leaf': {
    paths: [P('M56 50 Q66 28 90 17', 8)],
    field: [tine(52, 52, -12, 7, 5, { len: 26 }), tine(46, 60, -10, 6, 4, { len: 22 })],
    seat: [34, 76],
  },
  // 굽이진 길: 그리지 않고 남긴 흰 길 — 맑은 방울을 S자로 점점 작게 떨궈 띠 사이에 밝은 바탕 한 줄이 멀어지며 좁아진다
  'far-alone.path': {
    // 길 양쪽 가장자리 = 밀려난 띠가 고인 옅은 담묵 두 줄(그은 선이 아니라 고임 — 길 자체는 비움)
    paths: [P('M26 98 C42 88 46 80 44 68 C44 56 52 42 68 26', 1.8, 'wash'), P('M60 99 C70 88 72 76 68 64 C66 54 72 40 80 24', 1.4, 'wash')],
    field: [
      drop(40, 92, 10, 0),
      drop(48, 84, 9, 0),
      drop(54, 76, 8, 0),
      drop(55, 68, 7, 0),
      drop(55, 60, 6, 0),
      drop(58, 52, 5.2, 0),
      drop(62, 45, 4.4, 0),
      drop(67, 38, 3.6, 0),
      drop(72, 32, 2.8, 0),
      drop(77, 26, 2.2, 0),
    ],
    seat: [22, 84],
  },
  // 오목한 손: 손바닥 = 넓은 담묵 면(초승달 모양, 손가락 갈래 없음). 띠가 몸을 감싸 오목하게 휜다(아래에서 들어올림)
  'near-with.palm': {
    paths: [P(face([[6, 38], [24, 80], [50, 90], [76, 80], [94, 40], [80, 66], [50, 76], [20, 66]], 1.4), 1.7, 'wash')],
    field: [tine(50, 92, 0, -10, 18, { gauss: true }), drop(50, 84, 8, 0.25)],
    seat: [44, 60],
  },
  // 우산 하나에 둘: 덮개 = 담묵 반달 면(아래 가장자리만 짙게 고임), 막대 = 비백 한 획. 덮개 밖으로 띠가 빗줄기처럼 흘러내린다.
  // 다른 방울은 덮개 안에 몽망이와 맞붙는다
  'near-with.umbrella': {
    paths: [P('M8 46 Q50 0 92 46 Q50 36 8 46', 1.6, 'wash'), P('M10 46 Q50 36 90 46', 3, 'wash'), P('M50 20 L50 56', 2.2)],
    field: [tine(6, 50, 0, 14, 4, { gauss: true }), tine(94, 50, 0, 14, 4, { gauss: true })],
    seat: [36, 70],
    friend: [58, 73, 0.55],
  },
  // 은하수 다리: 마블링 띠를 들어올려 두 방울 사이에 다리(아치)를 세우고, 그 띠를 따라 옅은 담묵 띠 + 금가루(크기·간격 불규칙, 가운데 성김)
  'far-with.star-bridge': {
    paths: [P('M20 66 Q50 -42 80 66', 5, 'wash'), ...bridgeDots(true), ...bridgeDots(false)],
    field: [tine(50, 66, 0, -18, 14, { gauss: true })],
    seat: [14, 80],
    friend: [86, 80, 0.55],
  },
  // 지나가는 바람: 마블링 띠 자체를 한 방향으로 빗질해 길게 끌고(빗 세 가닥), 끝자락만 비백 붓 쓸기 한 번
  'center.wind': {
    paths: [P('M60 40 Q78 26 97 15', 4.5)],
    field: [tine(30, 70, 16, -11, 3), tine(44, 76, 16, -11, 3), tine(58, 82, 16, -11, 3)],
    seat: [24, 30],
  },
  // 줄지은 기러기: ㅅ자 열린 획 — 앞은 크고 짙게, 뒤는 작고 옅게(담묵), 획마다 크기가 다르고 대열에 빈틈 하나. 장은 날아가는 쪽으로 늘어난다
  'far-with.geese': {
    paths: [
      P([goose(82, 10, 7), goose(72, 17, 6.2), goose(78, 27, 5.8)].join(' '), 2.6),
      P([goose(54, 30, 4.6), goose(71, 40, 4.4), goose(44, 36, 3.6), goose(66, 50, 3.4)].join(' '), 2, 'wash'),
    ],
    field: [tine(60, 32, 10, -6, 26, { gauss: true })],
    seat: [24, 64],
  },
  // 소리 없는 눈: 맑은 물방울(크기 3단) + 띠 위쪽 가장자리에 쌓인 흰 테. 경로는 기록(64px 틀)용, 그림은 `field`
  'center.snow': {
    paths: [...[...SNOW, ...SNOW_BANK].map(([x, y, w]) => P(dot(x, y), w, 'wash')), P('M52 70 Q68 61 90 72', 3, 'wash')],
    field: [...SNOW, ...SNOW_BANK].map(([x, y, w]) => drop(x, y, w / 2, 0)),
    seat: [50, 86],
    water: 'clear',
  },
};
