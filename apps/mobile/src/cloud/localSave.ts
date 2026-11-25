// 맡겨 두기가 보는 '이 기기 본'(LocalSave) 두 갈래(V27b). 작업(tasks.ts)은 판을 모르고 이 문만 부른다.
//  - v2(옛 세이브, SAVE_KEYS.main): 올리는 본문 = 기기 원문 그대로(B2 정본).
//  - v3(새 컨셉, V3_KEYS.main): 올리는 본문 = core uploadBodyV3(허용 목록 V3_UPLOAD_FIELDS로만 — 기기 세이브 직렬화 함수를 이 모듈은 쓰지 않는다).
//    기기 칸(preRestore·parked)에는 기기 원문(raw)을 두어 되돌리기가 말 기록·기기 전용 칸까지 그대로 돌아온다(유실 0).
//    본을 바꿀 때(adopt)는 core adoptV3(말 기록 되붙이기 + 공방 합집합·정 최댓값), 이 기기 본을 고를 때(absorb)는 core stackV3.
// 판이 다른 본(한쪽 v2, 한쪽 v3)은 서로 이어 가지 않는다: side()가 state=null로 돌려 화면이 고르지 못하게 하고, adopt()는 false.
// v3 기기가 만난 서버 v2 본만 old=true — '이 기기'를 고르면 그 본을 기기 보관함에 둔 뒤 맡긴다(tasks.ts keepLocal).
import { SAVE_KEYS, sim, v3, type KV } from '@mong/core';
import type { SaveSide } from './model';
import { savedAtOf, sideOf } from './tasks';

export type LocalForm = 'v2' | 'v3';

export interface LocalSave {
  /** 이 기기가 도는 판(새 컨셉 플래그로 부팅했는가) */
  form(): LocalForm;
  /** 기기 본 원문(기기 칸에 그대로 둔다). 없으면 null */
  raw(): string | null;
  /** 기기 원문 → 서버에 올리는 본문. 못 만들면 null(올리지 않음 — held 'shape') */
  body(raw: string): string | null;
  /** 원문(기기 원문·서버 본문·칸 원문) → 나란히 고르기 한 쪽. 이 판이 이어 갈 수 없는 본이면 state=null */
  side(raw: string | null, meta?: { dayIndex: number | null; strokesTotal: number | null }): SaveSide;
  /** 원문으로 이어 간다(기기 본 교체 + 홈 다시 그리기). 판이 다르거나 못 읽거나 쓰기 실패면 false(기기 본은 그대로) */
  adopt(raw: string): boolean;
  /** '이 기기' 본을 고를 때 밀려나는 서버 본에서 쌓이기만 하는 칸을 받아 둔다(v3). 바뀔 것이 없으면 true. 실패면 false */
  absorb(serverBody: string): boolean;
}

/** 옛 세이브(v2) 기기 본 */
export function createLocalV2(o: { kv: KV; adopt: (st: sim.State) => boolean }): LocalSave {
  return {
    form: () => 'v2',
    raw: () => {
      try {
        return o.kv.getString(SAVE_KEYS.main) ?? null;
      } catch {
        return null;
      }
    },
    body: (raw) => raw,
    side: (raw, meta) => (raw !== null && v3.saveFormOf(raw) === 'v3' ? { ...sideOf(null, meta), savedAt: savedAtOf(raw), otherConcept: true } : sideOf(raw, meta)),
    adopt: (raw) => {
      if (v3.saveFormOf(raw) !== 'v2') return false;
      let st: sim.State;
      try {
        st = sim.parseState(raw);
      } catch {
        return false;
      }
      return o.adopt(st);
    },
    absorb: () => true,
  };
}

export interface V3Port {
  kv: KV;
  /** 지금 이 기기의 v3 상태(메모리 — 없으면 null) */
  current(): v3.V3State | null;
  /** 상태로 이어 간다(세이브 v3 키에 쓰고 홈 다시 그리기). 실패면 false */
  write(st: v3.V3State): boolean;
}

/** 새 컨셉(v3) 기기 본 */
export function createLocalV3(p: V3Port): LocalSave {
  const readAny = (raw: string): v3.V3State | null => {
    if (v3.saveFormOf(raw) !== 'v3') return null;
    try {
      return v3.readAnyV3(raw);
    } catch {
      return null;
    }
  };
  return {
    form: () => 'v3',
    raw: () => {
      try {
        return p.kv.getString(v3.V3_KEYS.main) ?? null;
      } catch {
        return null;
      }
    },
    body: (raw) => {
      try {
        const st = v3.parseV3(raw);
        return v3.uploadBodyV3(st, savedAtOf(raw) ?? st.sim.clock.lastSimAt);
      } catch {
        return null;
      }
    },
    side: (raw, meta) => {
      const form = raw === null ? 'bad' : v3.saveFormOf(raw);
      const st = raw !== null && form === 'v3' ? readAny(raw) : null;
      if (st) return { state: st.sim, dayIndex: st.sim.dayIndex, strokes: st.sim.strokes.length, savedAt: savedAtOf(raw!) };
      const base = sideOf(null, meta);
      // 서버의 옛 세이브(v2): 이어 갈 수 없지만 날·획 수는 보이고, '이 기기'를 고르면 보관함에 둔 뒤 맡긴다
      if (form === 'v2') {
        const side = sideOf(raw, meta);
        return { ...base, dayIndex: side.dayIndex, strokes: side.strokes, savedAt: side.savedAt, old: true };
      }
      return raw === null ? base : { ...base, savedAt: savedAtOf(raw) };
    },
    adopt: (raw) => {
      const incoming = readAny(raw);
      if (!incoming) return false;
      return p.write(v3.adoptV3(incoming, p.current()));
    },
    absorb: (serverBody) => {
      const server = readAny(serverBody);
      const cur = p.current();
      if (!server || !cur) return true;
      const next = v3.stackV3(cur, server);
      return next === cur ? true : p.write(next);
    },
  };
}

/** 부를 때마다 지금 판을 보고 고른다(개발 메뉴로 판을 바꿔도 작업 묶음을 다시 만들 필요 없음) */
export function createLocalSwitch(isV3: () => boolean, a: LocalSave, b: LocalSave): LocalSave {
  const pick = () => (isV3() ? b : a);
  return {
    form: () => pick().form(),
    raw: () => pick().raw(),
    body: (raw) => pick().body(raw),
    side: (raw, meta) => pick().side(raw, meta),
    adopt: (raw) => pick().adopt(raw),
    absorb: (body) => pick().absorb(body),
  };
}
