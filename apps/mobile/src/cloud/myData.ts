// '맡긴 것 보기'(로드맵 C12f, 처리방침 12절 열람 요구). 순수 모듈 — React·RN을 부르지 않는다(시험 test/cloud-mydata.test.ts).
// - 불러오기(loadMyData): GET /me/data 결과를 화면 갈래 하나로 접는다. **보기만 한다** — 기기 기록·세션을 바꾸지 않는다
//   (no_account·moved 판단과 정리는 맡겨 두기 시트(C12d)의 몫이다. 여기서 지우면 보기 화면이 계정을 끊는 길이 생긴다).
// - 표시 줄(myDataRows): 서버가 준 메타에서 **정해진 칸만** 골라 문구로 만든다. 이름·본문 같은 칸이 섞여 와도 읽지 않는다(유저 글자 노출 0).
// - 지우기 길(myDataEntry): 기존 C12 지우기 확인(인장 코드 끝 네 자 → DELETE /me)으로 들어간다. 새 지우기 경로를 만들지 않는다.
import type { MyData, SaveVersionReason } from '@mong/contract';
import { formatTag, tIn } from '../i18n';
import type { Locale } from '../i18n/types';
import { readToken, type CloudApi, type CloudAuth } from './api';
import { deleteToken, reduce, type View } from './model';

export type MyDataView =
  | { k: 'loading' }
  | { k: 'ready'; data: MyData }
  /** 연결이 없음(요청 끊김·시간 초과·토큰을 못 받음 중 연결 문제) */
  | { k: 'offline' }
  /** 서버를 지금 쓸 수 없음(503·한도·서버 오류·계약 밖 응답·토큰 문제) */
  | { k: 'unavailable' }
  /** 이 기기의 로그인으로는 서버에서 맡긴 것을 찾지 못함(401 no_account·세션 없음) */
  | { k: 'noAccount' }
  /** 되찾기로 다른 기기에 옮겨 감(410 moved) */
  | { k: 'moved' };
export type Loaded = Exclude<MyDataView, { k: 'loading' }>;

export async function loadMyData(d: { api: CloudApi; auth: CloudAuth }): Promise<Loaded> {
  const tok = await readToken(d.auth);
  if (tok.kind === 'none') return { k: 'noAccount' };
  if (tok.kind === 'unavailable') return tok.failure === 'offline' || tok.failure === 'timeout' ? { k: 'offline' } : { k: 'unavailable' };
  const r = await d.api.myData();
  switch (r.kind) {
    case 'ok':
      return { k: 'ready', data: r.value };
    case 'noAccount':
    case 'alreadyGone':
      return { k: 'noAccount' };
    case 'moved':
      return { k: 'moved' };
    case 'failed':
      return r.failure === 'offline' || r.failure === 'timeout' ? { k: 'offline' } : { k: 'unavailable' };
    default:
      // signedOut(토큰 문제 — 지워짐의 증거 아님)·그 밖 뜻밖의 갈래
      return { k: 'unavailable' };
  }
}

export interface DataRow {
  id: string;
  label: string;
  value: string;
  /** 스크린리더가 한 덩이로 읽을 글('이름, 값') */
  a11y: string;
}

/** 크기 표기(서버에 보관된 압축 바이트). 1KB 미만은 바이트, 그 위는 KB 한 자리(끝 .0은 뺀다) */
export function formatBytes(n: number, loc: Locale): string {
  if (n < 1024) return tIn(loc, 'cloud.view.bytes', { n: String(n) });
  const kb = Math.round((n / 1024) * 10) / 10;
  return tIn(loc, 'cloud.view.kb', { n: String(kb) });
}

/** 현지 날짜(+시각). 기기 시간대(분)를 더해 UTC로 적는다 — bornDate와 같은 방법(Intl 시간대 데이터에 기대지 않음) */
function when(iso: string, loc: Locale, tz: number, time: boolean): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return tIn(loc, 'cloud.view.unknown');
  const d = ms + tz * 60_000;
  try {
    return new Intl.DateTimeFormat(formatTag(loc), { year: 'numeric', month: 'long', day: 'numeric', ...(time ? { hour: 'numeric', minute: '2-digit' } : {}), timeZone: 'UTC' }).format(d);
  } catch {
    return new Date(d).toISOString().slice(0, time ? 16 : 10).replace('T', ' ');
  }
}
function monthOf(ym: string, loc: Locale): string {
  const [y, m] = ym.split('-').map(Number);
  try {
    return new Intl.DateTimeFormat(formatTag(loc), { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(Date.UTC(y!, m! - 1, 1));
  } catch {
    return ym;
  }
}

const REASON_KEY: Record<SaveVersionReason, 'cloud.view.reason.overwritten' | 'cloud.view.reason.weekly' | 'cloud.view.reason.conflict' | 'cloud.view.reason.pre_restore'> = {
  overwritten: 'cloud.view.reason.overwritten',
  weekly: 'cloud.view.reason.weekly',
  conflict: 'cloud.view.reason.conflict',
  pre_restore: 'cloud.view.reason.pre_restore',
};

/** 화면 줄. 정해진 칸만 읽는다(이름·본문 칸은 계약에 없고, 섞여 와도 여기서 읽지 않는다) */
export function myDataRows(d: MyData, loc: Locale, tz: number): DataRow[] {
  const rows: DataRow[] = [];
  const add = (id: string, label: string, value: string) => rows.push({ id, label, value, a11y: `${label}, ${value}` });
  const c = d.creature;

  add('creatures', tIn(loc, 'cloud.view.creatures'), c ? tIn(loc, 'cloud.view.creatures.value', { n: d.creatures, code: c.code }) : tIn(loc, 'cloud.view.creatures.none'));
  const s = d.save;
  add(
    'save',
    tIn(loc, 'cloud.view.save'),
    s
      ? tIn(loc, 'cloud.view.save.value', {
          day: s.dayIndex === null ? tIn(loc, 'cloud.view.unknown') : tIn(loc, 'day.name', { n: s.dayIndex + 1 }),
          strokes: s.strokesTotal === null ? tIn(loc, 'cloud.view.unknown') : String(s.strokesTotal),
          size: formatBytes(s.bytes, loc),
        })
      : tIn(loc, 'cloud.view.save.none'),
  );
  add('last', tIn(loc, 'cloud.view.last'), s ? when(s.lastSavedAt, loc, tz, true) : tIn(loc, 'cloud.view.last.never'));
  const total = d.versions.reduce((a, v) => a + v.bytes, 0);
  add('versions', tIn(loc, 'cloud.view.versions'), d.versions.length ? tIn(loc, 'cloud.view.versions.value', { n: d.versions.length, size: formatBytes(total, loc) }) : tIn(loc, 'cloud.view.versions.none'));
  d.versions.forEach((v, i) =>
    add(`version-${i}`, tIn(loc, REASON_KEY[v.reason]), tIn(loc, 'cloud.view.version.value', { date: when(v.createdAt, loc, tz, false), size: formatBytes(v.bytes, loc) })),
  );
  if (c) {
    add('phrase', tIn(loc, 'cloud.view.phrase'), tIn(loc, c.recoveryCodeSet ? 'cloud.view.phrase.set' : 'cloud.view.phrase.unset'));
    const live = c.link.pageState === 'live';
    const page = c.link.pageState === 'quarantined' || c.link.pageState === 'removed' ? tIn(loc, 'cloud.view.link.hidden') : live ? tIn(loc, 'cloud.view.link.live') : tIn(loc, 'cloud.view.link.off');
    add('link', tIn(loc, 'cloud.view.link'), live ? tIn(loc, 'cloud.view.link.withName', { page, name: tIn(loc, c.link.nameShown ? 'cloud.view.link.name.shown' : 'cloud.view.link.name.hidden') }) : page);
  }
  const a = d.account;
  add('account', tIn(loc, 'cloud.view.account'), tIn(loc, 'cloud.view.account.value', { date: when(a.createdAt, loc, tz, false), month: a.lastActiveMonth ? monthOf(a.lastActiveMonth, loc) : tIn(loc, 'cloud.view.unknown') }));
  add('age', tIn(loc, 'cloud.view.age'), a.ageConfirmedOn ? tIn(loc, 'cloud.view.age.value', { date: when(`${a.ageConfirmedOn}T00:00:00Z`, loc, 0, false) }) : tIn(loc, 'cloud.view.unknown'));
  add('logins', tIn(loc, 'cloud.view.logins'), a.movedLogins ? tIn(loc, 'cloud.view.logins.moved', { n: a.logins, m: a.movedLogins }) : tIn(loc, 'cloud.view.logins.value', { n: a.logins }));
  if (a.deletionPendingUntil) add('deletion', tIn(loc, 'cloud.view.deletion'), when(a.deletionPendingUntil, loc, tz, false));
  return rows;
}

/** '서버에 맡긴 것 지우기'로 맡겨 두기 시트를 열 때 처음 자리: 켜짐이면 기존 지우기 확인, 아니면 기록이 정한 자리 그대로 */
export function myDataEntry(init: View, rec: { creature: string | null; sha: string | null } | null): View {
  return reduce(init, { e: 'askDelete', token: deleteToken(rec) });
}
