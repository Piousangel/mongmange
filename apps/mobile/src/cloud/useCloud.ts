// 맡겨 두기 화면 훅: 상태 기계(model.ts) + 작업 실행(tasks.ts) + 연령 확인(ageGate.ts)을 잇는다.
// - 보기는 ref와 state를 함께 쥔다: 사건 하나가 이전 보기 → 다음 보기를 정하고, 그 차이로 기기 기록 부작용(글귀 확인 완료·기록 지움)을 한 번만 낸다.
// - busy 보기의 task 객체가 같으면 작업을 다시 돌리지 않는다('느림' 표시는 보기만 바꾼다).
// - 시트를 닫거나 화면이 사라져도 작업 결과는 기기 기록에 남는다(tasks.ts). 다시 열면 기록에서 처음 자리를 정한다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ageStatus, judgeAge, recordAge, type AgeInput, type AgeInputError, checkAgeInput } from './ageGate';
import { ageEvents, deleteToken, initialView, reduce, startEvents, type CloudEvent, type Purpose, type View } from './model';
import { readPreRestore, readRecord, readUnconfirmedDelete, writeRecord } from './record';
import { myDataEntry } from './myData';
import { markCodeConfirmed, runTask, type TaskDeps } from './tasks';

/** 이보다 오래 걸리면 '서버가 조금 느려요'를 보인다(ms) */
export const SLOW_MS = 4000;

/** 시트를 여는 입구: 되돌리기 확인, 지우기 확인('맡긴 것 보기'에서 — C12f), 또는 parked 칸 하나(`parked:<id>`) */
export type CloudEntry = 'revert' | 'delete' | `parked:${string}`;

export interface CloudController {
  view: View;
  send(ev: CloudEvent): void;
  /** 켜기·되찾기 시작: 연령 확인 기록이 있으면 묻지 않고 넘어간다 */
  start(purpose: Purpose): void;
  /** 태어난 해·달 판정 → 기기에 결과만 남기고 다음 보기로. 입력이 틀리면 그 갈래 */
  submitAge(input: AgeInput): AgeInputError | null;
  /** 시트를 다시 열 때: 작업·글귀 보기가 아니면 기기 기록에서 처음 자리. revert = 공방 노트 '바꾸기 전으로 되돌리기'에서 열림 */
  reopen(entry?: CloudEntry): void;
  /** 확인하지 못한 지우기 질문에 답한 뒤(새로 시작 / 지운 뒤 계속) 연령 확인으로 이어 간다 */
  afterOld(ev: 'skipOld' | 'proceedOld'): void;

  /** 지우기 확인으로(확인 낱말 = 인장 코드 끝 네 자, 기기 기록에서) */
  askDelete(): void;
}

export function useCloud(deps: TaskDeps | null, opts: { initial?: View; tzOffsetMin: () => number }): CloudController {
  const [view, setView] = useState<View>(() => opts.initial ?? initialView(deps ? readRecord(deps.kv) : null));
  const ref = useRef(view);
  const tz = opts.tzOffsetMin;

  const set = useCallback((next: View) => {
    ref.current = next;
    setView(next);
  }, []);

  const send = useCallback(
    (ev: CloudEvent) => {
      const prev = ref.current;
      let next = reduce(prev, ev);
      if (next === prev) return;
      // 켜짐으로 가는데 기기 기록이 없으면(맡겨 두기 꺼진 채 되돌리기를 마침) 소개로
      if (next.v === 'on' && deps && !readRecord(deps.kv)) next = { v: 'intro' };
      if (deps) {
        // 글귀 확인을 마치고 나갈 때만 '확인함'을 남긴다(글귀 자체는 어디에도 남기지 않는다)
        if (prev.v === 'code' && next.v !== 'code') markCodeConfirmed(deps.kv);
        if ((prev.v === 'moved' || prev.v === 'deleted') && next.v === 'intro') writeRecord(deps.kv, null);
      }
      set(next);
    },
    [deps, set],
  );

  const start = useCallback(
    (purpose: Purpose) => {
      if (!deps) return;
      for (const ev of startEvents(purpose, ageStatus(deps.kv, deps.now(), tz()), readUnconfirmedDelete(deps.kv)?.abandoned === false)) send(ev);
    },
    [deps, send, tz],
  );

  const submitAge = useCallback(
    (input: AgeInput): AgeInputError | null => {
      if (!deps) return 'incomplete';
      const at = deps.now();
      const err = checkAgeInput(input, at, tz());
      if (err) return err;
      const verdict = judgeAge(input, at, tz())!;
      recordAge(deps.kv, verdict, at, tz());
      send({ e: 'age', ok: verdict === 'pass' });
      return null;
    },
    [deps, send, tz],
  );

  const reopen = useCallback(
    (entry?: CloudEntry) => {
      const cur = ref.current;
      if (cur.v === 'busy' || cur.v === 'code' || !deps) return;
      const init = initialView(readRecord(deps.kv));
      if (entry === 'revert') {
        // 맞바꾸기 확인에 두 몽망이(지금·바꾸기 전)를 나란히
        const pre = readPreRestore(deps.kv, deps.now());
        set(reduce(init, { e: 'askRevert', now: deps.local.side(deps.local.raw()), before: pre ? deps.local.side(pre.raw) : null }));
      } else if (entry === 'delete') set(myDataEntry(init, readRecord(deps.kv)));
      else if (entry?.startsWith('parked:')) set(reduce(init, { e: 'openParked', slot: entry.slice('parked:'.length) }));
      else set(init);
    },
    [deps, set],
  );

  const afterOld = useCallback(
    (ev: 'skipOld' | 'proceedOld') => {
      send({ e: ev });
      if (deps) for (const a of ageEvents(ageStatus(deps.kv, deps.now(), tz()))) send(a);
    },
    [deps, send, tz],
  );

  const askDelete = useCallback(() => {
    if (deps) send({ e: 'askDelete', token: deleteToken(readRecord(deps.kv)) });
  }, [deps, send]);

  const task = view.v === 'busy' ? view.task : null;
  useEffect(() => {
    if (!task || !deps) return;
    let alive = true;
    const slow = setTimeout(() => {
      if (alive) send({ e: 'slow' });
    }, SLOW_MS);
    void runTask(task, deps).then((result) => {
      clearTimeout(slow);
      if (alive) send({ e: 'done', result });
    });
    return () => {
      alive = false;
      clearTimeout(slow);
    };
  }, [task, deps, send]);

  return { view, send, start, submitAge, reopen, askDelete, afterOld };
}
