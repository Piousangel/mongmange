// State 전체 세이브. 바깥은 기존 D-13 봉투(schemaVersion 2, strokes = int16 점열 base64) 그대로라
// 기존 parseSave로도 정본 점열을 읽을 수 있다. 시뮬레이션 상태는 `sim` 블록에 버전을 따로 달아 둔다.
import { FutureSaveError, SCHEMA_VERSION, encodeRaw, parseSave } from '../save/envelope';
import { capRaw } from '../geometry/simplify';
import { createInitial, SIM_SCHEMA_VERSION } from './reduce';
import { styleFor } from './temperament';
import { withArtRev } from './dreamMotifs';
import { initRelation, invalidPillarField, labelOf, makeBirth, migratedBirthSeed, seededInk } from './pillars';
import { AXES, type Millis, type State, type Stroke } from './types';

type StrokeMeta = Omit<Stroke, 'raw' | 'attach' | 'drawnAtCoreScale' | 'meshVersion'>;

interface SimBlock {
  version: number;
  savedAt: Millis;
  state: Omit<State, 'strokes'>;
  strokeMeta: StrokeMeta[];
}

export function serializeState(s: State, savedAt: Millis): string {
  const strokes = s.strokes.map((x) => {
    const { data, hasP } = encodeRaw(capRaw(x.raw));
    return { raw: data, hasP, attach: x.attach, drawnAtCoreScale: x.drawnAtCoreScale, meshVersion: x.meshVersion };
  });
  const { strokes: _omit, ...rest } = s;
  const strokeMeta: StrokeMeta[] = s.strokes.map(({ raw: _r, attach: _a, drawnAtCoreScale: _d, meshVersion: _m, ...meta }) => meta);
  const sim: SimBlock = { version: SIM_SCHEMA_VERSION, savedAt, state: rest, strokeMeta };
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, strokes, sim });
}

/**
 * sim 1 → 2(세이브 v2, C-integrated 4-1): 세 기둥 필드를 더한다. 옛 세이브에는 첫 탭 정보가 없으므로
 * 타고남 씨앗은 생일(createdAt)에서 결정적으로 만든다(source 'migrated' — 같은 원문은 늘 같은 몽망이).
 * 정·손 기억은 지난 기록이 없어 0에서 시작한다(지어내지 않는다). 이레를 이미 지났으면 결 이름을 지금 성향으로 정한다.
 */
function up1to2(b: SimBlock): SimBlock {
  const st = b.state as unknown as Record<string, unknown>;
  // 블록과 state 버전이 어긋난 손상 원문을 덮어 가리지 않는다(리뷰 L-2)
  if (st?.schemaVersion !== 1) throw new Error('세이브 손상: schemaVersion(블록과 state 버전 불일치)');
  const createdAt = typeof st.createdAt === 'number' ? st.createdAt : b.savedAt;
  const seed = migratedBirthSeed(createdAt);
  const temperament = st.temperament as State['temperament'] | undefined;
  const pastFirstNight = (typeof st.dayIndex === 'number' && st.dayIndex > 0) || st.phase === 'asleep';
  const label = st.ire7LineShown === true && temperament ? { ...labelOf(temperament), since: b.savedAt } : null;
  const state = {
    ...b.state,
    schemaVersion: 2,
    birth: makeBirth(seed, createdAt, 'migrated'),
    // 첫 밤을 이미 지났으면 씨앗 먹을 정해 둔다(새 몽망이의 '첫 잠에 씨앗 먹' 규칙과 같게, 리뷰 M-2)
    ink: pastFirstNight ? { id: seededInk(seed), chosenAt: b.savedAt, seeded: true } : { id: null, chosenAt: null, seeded: false },
    name: null,
    temperamentLabel: label,
    relation: initRelation(b.savedAt),
  } as SimBlock['state'];
  return { ...b, version: 2, state };
}

/** sim 블록 마이그레이션 체인(1 → 2). 알 수 없는 미래 버전은 거부 */
function migrateSim(b: SimBlock): SimBlock {
  let cur = b;
  if (cur.version === 1) cur = up1to2(cur);
  // if (cur.version === 2) cur = up2to3(cur);  ← 다음 버전이 생기면 여기에 잇는다
  if (typeof cur.version === 'number' && cur.version > SIM_SCHEMA_VERSION) throw new FutureSaveError('sim 세이브', cur.version);
  if (cur.version !== SIM_SCHEMA_VERSION) throw new Error(`알 수 없는 sim 세이브 버전 ${cur.version}`);
  return cur;
}

export interface LegacyContext {
  now: Millis;
  tzOffsetMin: number;
  seed: number;
}

/**
 * 세이브 → State. 봉투 부분은 기존 parseSave(봉투 v1 → v2 체인, 미래 봉투 버전 거부)를 그대로 쓴다.
 * sim 블록이 없는 옛 봉투(스파이크 시절, 획만)는 `legacy` 시각 정보로 새 상태를 만들고 획을 옮긴다.
 */
export function parseState(json: string, legacy?: LegacyContext): State {
  const obj = JSON.parse(json) as { sim?: SimBlock };
  const env = parseSave(json);
  if (!obj.sim) {
    if (!legacy) throw new Error('sim 블록이 없는 옛 세이브는 legacy 시각 정보가 필요하다');
    const base = createInitial(legacy.now, legacy.tzOffsetMin, legacy.seed);
    const style = styleFor(base.temperament);
    const strokes: Stroke[] = env.strokes.map((rec, i) => ({
      ...rec,
      id: `legacy-${i}`,
      day: 0,
      createdAt: legacy.now,
      grind: 0,
      style,
      pinned: i === 0 ? 'first' : null,
    }));
    return { ...base, strokes, strokesTotal: strokes.length };
  }
  const sim = migrateSim(obj.sim);
  validateState(sim);
  if (sim.strokeMeta.length !== env.strokes.length) throw new Error('세이브 손상: 획 수가 맞지 않는다');
  const strokes: Stroke[] = env.strokes.map((rec, i) => ({ ...rec, ...sim.strokeMeta[i]! }));
  // 그림 판 이행(C14b 5차, 멱등): 판 번호 없는 새 모티프 카드 = 1판
  const st: State = { ...sim.state, strokes, cards: withArtRev(sim.state.cards) };
  // 콜드 스타트(리뷰 1-2): 앱이 앞에 있던 채로 끝났으면(강제 종료·OS 회수) 저장 시각에 백그라운드로 간 것으로 본다
  return st.backgroundSince === null ? { ...st, backgroundSince: Math.max(sim.savedAt, st.clock.lastSimAt) } : st;
}

/** 필수 필드·타입 최소 검증(손상 세이브가 그대로 들어오지 않게). 버전은 sim 블록과 state가 같아야 한다 */
function validateState(b: SimBlock): void {
  const s = b.state as unknown as Record<string, unknown>;
  const bad = (k: string) => {
    throw new Error(`세이브 손상: ${k}`);
  };
  if (!s || typeof s !== 'object') bad('state');
  if (s.schemaVersion !== b.version) bad('schemaVersion(블록과 state 버전 불일치)');
  if (typeof b.savedAt !== 'number' || !Number.isFinite(b.savedAt)) bad('savedAt');
  const nums = ['rng', 'createdAt', 'lastWakeAt', 'dayIndex', 'bedtimeLocalMin', 'morningLocalMin', 'strokesTotal', 'peakStrokes', 'lastCareAt'];
  for (const k of nums) if (typeof s[k] !== 'number' || !Number.isFinite(s[k] as number)) bad(k);
  const nullableNums = ['sleepAt', 'backgroundSince'];
  for (const k of nullableNums) if (s[k] !== null && typeof s[k] !== 'number') bad(k);
  if (s.phase !== 'awake' && s.phase !== 'asleep') bad('phase');
  if (s.phase === 'asleep' && typeof s.sleepAt !== 'number') bad('sleepAt(자는 중)');
  if (typeof s.born !== 'boolean' || typeof s.ire7LineShown !== 'boolean') bad('born/ire7LineShown');
  const clock = s.clock as Record<string, unknown> | undefined;
  if (!clock || typeof clock.hwm !== 'number' || typeof clock.lastSimAt !== 'number' || typeof clock.tzOffsetMin !== 'number') bad('clock');
  for (const k of ['temperament', 'bornTemperament', 'habit']) {
    const v = s[k] as Record<string, unknown> | undefined;
    if (!v || AXES.some((a) => typeof v[a] !== 'number' || !Number.isFinite(v[a] as number))) bad(k);
  }
  const ledger = s.ledger as Record<string, unknown> | undefined;
  if (!ledger || typeof ledger.inputs !== 'number' || !Array.isArray(ledger.taps)) bad('ledger');
  for (const k of ['focusHistory', 'cards', 'recentChannels']) if (!Array.isArray(s[k])) bad(k);
  if (!Array.isArray(b.strokeMeta)) bad('strokeMeta');
  const pf = invalidPillarField(s);
  if (pf) bad(pf);
}
