// 세이브 검사 — @mong/core의 parseState를 서버에서 그대로 돌린다(architecture.md 3-4 '서버 검증 = @mong/core parseState').
// 앱과 서버가 같은 코드로 세이브를 읽으므로, 앱이 읽을 수 있는 세이브만 서버가 '검증됨'으로 받는다.
// B2(PUT /saves/main)가 이 함수를 그대로 쓴다. 서버가 본문에서 꺼내는 값은 버전·dayIndex·strokesTotal뿐이다(5-1).
// 세이브 v3(V27b): `v3` 블록이 있으면 core checkUploadBodyV3(앱 마지막 문과 같은 검사)도 통과해야 한다 — 허용 목록(V3_UPLOAD_FIELDS)
// 밖 칸(기기 전용 walk·captionsShown, 말의 세기·사전 판, 기기 형태 말, 말 없는 봉투 획)이 실린 본문은 저장하지 않는다(처리방침 3-5와 같은 칸만).
// 블록 판이 서버보다 크면 future(+1까지만 원문 보관 — 봉투·sim과 같은 규칙).
import { isFutureSaveError, sim, v3 } from '@mong/core';

/** 압축 전 상한 512KB(3-1 saves) */
export const SAVE_MAX_CHARS = 512 * 1024;

export type SaveInspection =
  | { kind: 'ok'; envelopeVer: number; simVer: number; dayIndex: number; strokesTotal: number }
  /** 이 서버보다 새 core가 쓴 세이브 — 거부하지 않고 validated=false로 보관한다(3-4) */
  | { kind: 'future'; envelopeVer: number | null; simVer: number | null }
  | { kind: 'invalid'; reason: string };

export function inspectSave(json: string): SaveInspection {
  if (json.length > SAVE_MAX_CHARS) return { kind: 'invalid', reason: 'too_large' };
  let head: { schemaVersion?: unknown; sim?: { version?: unknown } };
  try {
    head = JSON.parse(json) as typeof head;
  } catch {
    return { kind: 'invalid', reason: 'not_json' };
  }
  if (!head || typeof head !== 'object') return { kind: 'invalid', reason: 'not_object' };
  const envelopeVer = typeof head.schemaVersion === 'number' ? head.schemaVersion : null;
  const simVer = typeof head.sim?.version === 'number' ? head.sim.version : null;
  // sim 블록 없는 옛 세이브는 기기 시각이 있어야 옮길 수 있다 → 서버는 받지 않는다(앱이 먼저 올린 뒤 보낸다)
  if (!head.sim) return { kind: 'invalid', reason: 'legacy_without_sim' };
  const c = v3.checkUploadBodyV3(json);
  if (c.kind === 'invalid') return { kind: 'invalid', reason: c.reason };
  if (c.kind === 'future') {
    const v = (head as { v3?: { version?: unknown } }).v3?.version;
    if (typeof v !== 'number' || v > v3.V3_VERSION + 1) return { kind: 'invalid', reason: 'future_too_far' };
    return { kind: 'future', envelopeVer, simVer };
  }
  try {
    const st = sim.parseState(json);
    return {
      kind: 'ok',
      // parseState가 옛 판을 현재 판으로 올렸으므로 보관 열에는 '올린 뒤' 버전이 아니라 받은 버전을 남긴다
      envelopeVer: envelopeVer ?? 0,
      simVer: simVer ?? 0,
      dayIndex: st.dayIndex,
      strokesTotal: st.strokesTotal,
    };
  } catch (e) {
    if (isFutureSaveError(e)) return { kind: 'future', envelopeVer, simVer };
    return { kind: 'invalid', reason: 'corrupt' };
  }
}
