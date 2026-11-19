# sim 구현 v1 — packages/core/src/sim (MVP)

- 작성: 시스템 프로그래머 / 2026-11-20 / 정본: `docs/design/systems-v1.md` v1.1, D-02·03·07·09·13
- 상태: 테스트 통과, **미커밋**. 11-20 독립 리뷰(`docs/team/reviews/2026-11-20-sim-review.md`) 팀 결정 반영 = 6절. 수치는 전부 systems 문서의 [팀 추정] 값 그대로이고, 새로 정한 정규화 상수는 `ledger.ts`의 `LEDGER`에 모았다.

## 1. 파일

| 파일 | 내용 |
|---|---|
| `sim/types.ts` | State·Event·Effect·Stroke(= 기존 `StrokeRecord` + 메타)·DreamCard·MorningLine |
| `sim/rng.ts` | mulberry32 `rngNext(seed)`. 시드는 State.rng(정수 하나)에 둔다. 스크립트 rng()와 같은 수열 |
| `sim/time.ts` | D-07: `wakeableAt`, `autoSleepAt`, `canPutToSleep`, `initialLastWake`, `nextTransition`, `dryness`, `resolveNow` |
| `sim/temperament.ts` | `daySignals`, `initTemperament`, `settleTemperament`, `lineKind`, `styleFor`, 결과 채널 표 |
| `sim/ledger.ts` | 하루 입력 장부 → 측정값 0..1(획 속도·길이·거리·새로움, 먹 갈기, 접촉량, 길게 누르기 속도, 탭 분산) |
| `sim/dream.ts` | 모티프 10개(MVP 보유량, **id 자리표시**), 사분면 + 가운데 접근 풀, 같은 장면 재등장 금지 |
| `sim/reduce.ts` | `createInitial(now, tzOffsetMin, seed)`, `tick(state, now)`, `reduce(state, event)`, `stageOf` |
| `sim/save.ts` | `serializeState(state, savedAt)`, `parseState(json, legacy?)` |
| `index.ts` | `export * as sim` 한 줄 추가(기존 `tick`·`Phase`와 이름이 겹쳐 네임스페이스로 냄) |

재사용: 획 기록은 `makeRecord`(양자화 + D-12 부착), 핵 크기는 `coreScale`, 거리는 `coreSdf`, 길이는 `polylineLength`, 세이브 점열은 `encodeRaw`·`parseSave`(봉투 v1→v2 체인 포함). geometry·visual·render·screens는 읽기만 했다.

## 2. 동작 요약

- **동사**: systems 1.1 표 그대로 4 + 준비 1. 긋기(`stroke`, 하루 1획, 5초 안 `washStroke` 1회), 먹 갈기(`grind`), 탭(`tap` body/paper, holdMs ≥ 500 = 문지르기), 재우기(`putToSleep`), 현상(`developCard`). 톡톡·별도 문지르기는 v1.1에서 탭에 합쳐졌다. **물 한 방울**은 동사가 아니라 마른 뒤 첫 터치에 자동으로 나오는 `rehydrated` 효과다(그 터치의 원래 행동도 실행).
- **시간**: 전이(잠들기·깨기)를 정확한 시각에 차례로 적용한다. 그래서 `tick`을 한 번에 하든 잘게 나누든 결과가 같다(속성 테스트).
  - 깸 = `max(sleepAt + 6h, sleepAt 뒤 첫 아침, lastWake + 12h)`. 그 시각에 깨고(dayIndex +1, 획 충전), **처음 연 순간에 현상**한다.
  - 자동 잠 = 백그라운드일 때 `max(깬 뒤 첫 잠 시각, 백그라운드 전환 시각)`. 앱이 앞에 있으면 자지 않는다.
  - 첫날: `lastWakeAt = min(설치, 직전 아침)`. 첫날에 `setTimes`로 시각을 바꾸면 새 아침 시각으로 다시 잡는다(야간 근무자 첫날).
  - 역행: 경과 0, hwm 유지, 1h 넘으면 `clockSuspect: rewind`. 역행 시각의 이벤트는 hwm 시각에 일어난 것으로 본다.
  - 72h 초과: **마지막 72h만** 산다. 그 앞에 밀린 전이는 구간 시작에 한 번 일어난다. 그래서 복귀 순간 몽망이는 실제 현지 시각에 맞는 상태다.
- **성향**: 잠들 때 정산한다. 첫 입력이 있던 밤 = 타고난 결(2배, ±0.25). 입력 없는 밤은 v·h 모두 그대로. 같은 축 3밤 연속 금지, 결 축 α 0.40 / 나머지 0.15.
- **아침 문장**: 키만 낸다. change·deepen = `[cause.<측정값>.<plus|minus>, effect|deepen.<축>.<방향>.<채널>]`, 결과 채널은 최근 5개와 겹치지 않게 돈다. 관찰 = `obs.dream.<motifId>`. 7획을 넘긴 뒤 첫 현상 = `seven-day`(가장 많이 움직인 두 축 + `ire7.firstStroke`).
- **꿈 카드**: 깰 때 만든다. 현상 전에 또 깨면 한 장으로 합친다(`nightsMerged`, '긴 잠').
- **성장**: 획 수 기준 drop(0) → firstStroke(1, 첫 획 `pinned: 'first'`) → young(2~6) → ire7(7). `stageReached` 효과.
- **세이브**: 바깥은 기존 D-13 봉투(schemaVersion 2, int16 점열 base64) 그대로이고, 상태는 `sim: { version: 1, savedAt, state, strokeMeta }` 블록에 둔다. 기존 `parseSave`로도 정본 점열을 읽을 수 있다. sim 블록이 없는 옛 봉투(스파이크, 획만)는 `legacy { now, tzOffsetMin, seed }`로 새 상태를 만들어 획을 옮긴다. 미래 sim 버전·미래 봉투 버전은 거부한다.

## 3. 테스트 (Vitest, `packages/core/test/sim-*.test.ts`, 5파일 40건)

| 파일 | 내용 |
|---|---|
| `sim-time` | 21시 설치, 01시 설치, 09시 설치, 앱 켜 둠, 05:30 늦은 잠(11:30 깸), 14시 낮잠(다음 날 06시), 야간 근무, 서울↔LA(깸 간격 ≥ 12h, 잠·깸 번갈아), 역행, 5일 방치 복귀, 마름 시각표 |
| `sim-temperament` | 스크립트와 같은 입력 → A·B 7·30·90일 성향 값(전체 정밀도 1e-12), 결 순서 문자열, 깊어짐·관찰 수, 화면 출력(소수 둘째 자리), 습관 전환 5밤·9밤 / 3밤 연속 금지, 결 축 α, EPS, 첫날 2배, 하루 예산 |
| `sim-loop` | 하루 한 획·asleep·tooShort, 물로 씻기, 칠 고정, 성장 단계, 7장 모두 다른 장면 + 이레 문장, 문장 키 형식·채널 비중복, 결정성 |
| `sim-property` | **72h 한 번 tick == 1h × 72번**(무작위 200사례, 상태·효과 모두), 불규칙 분할 100사례, 무작위 30일 이벤트(역행·점프 포함) 불변식(|v| < 0.85, 마름 ≤ 0.6, hwm 단조, 깸 간격 ≥ 12h, 3밤 연속 없음), 300명 편향 |
| `sim-save` | 왕복 후 deepEqual + 이어 돌려도 같음, 기존 parseSave 호환, 옛 봉투 v1 → State, 시각 정보 없는 옛 봉투 거부, 미래 버전 거부 |

골든 값은 `temperament-7day.mjs`를 손대지 않고 복사해 끝에 출력만 붙여 돌린 값이다(11-20).

## 4. 문서와 다르게 하거나 새로 정한 것 (리뷰·결정 필요)

1. **5일 방치 시 dayIndex**: systems 3.3은 "열흘 비우면 최대 +3". 구현은 마지막 72h 구간 안에서 보통 +3이고, 구간 시작이 아침 시각 직후에 걸리면 +4까지 될 수 있다(밀린 깸 1 + 구간 안 아침 3). 정확히 3에서 막으려면 규칙을 하나 더 넣어야 한다 → 시스템 디자이너 판단.
2. **깨는 시각**: 백그라운드여도 `wakeableAt`에 깬다(dayIndex·획 충전). "처음 연 순간이 아침"은 **현상**(카드·문장)으로 지킨다. 그래야 오프라인 정산과 12h 규칙이 앱을 여는 시각에 휘둘리지 않는다.
3. **타고난 결의 아침 문장**: 첫 밤은 `initTemperament`라 결 축이 없다. 가장 크게 정해진 축을 `change`로 말한다(focusHistory에는 넣지 않아 스크립트와 같다).
4. **모티프 수**: 과제 지시는 24개였지만 systems 5절의 MVP 보유량은 10개라 10개로 했다. id는 자리표시(`near-alone.quilt` 등)이다.
5. **"한 밤 한 축 2배"**: v1.1은 2배가 아니라 결 축 α 0.40 / 나머지 0.15 추종형이다(v1 누적형 폐기). 2배는 첫날 신호에만 쓴다. 문서 v1.1을 따랐다.
6. **측정 정규화 상수**(`LEDGER`): 속도 2 W/s = 1, 길이 핵 폭 × 2 = 1, 거리 1W = 1, 접촉 20초 = 1, 쓰다듬기 1회 = 0.6초, 길게 누르기 미세 이동 0.4 W/s = 1, 탭 반경 1W = 1. 하지 않은 입력은 0.5(신호 0), 먹 갈기·접촉량은 안 함 = 0. 스파이크 02 손 데이터로 보정해야 한다.
7. **세션 안 단조 시계(performance.now, 3.4 셋째 행)**는 넣지 않았다. 앱 쪽에서 `at`을 보정해 넘기는 편이 단순하다.
8. 화면 획 상한 24·바램은 1.0 범위라 sim에서 다루지 않는다(MVP 7일은 바래는 획이 없음).

## 5. 다음

- 앱 연결: 화면은 `sim.reduce`·`sim.tick` 결과의 `effects`로 연출을 트리거하고, 저장은 `serializeState`(MMKV)를 쓴다. 기존 `selectVisual(input)`은 그대로 두었다. State → VisualInput 어댑터는 visual 담당과 맞춘다.
- DECISIONS: 4절 1·2를 D-07에 반영할지 PM 판단.

## 6. 리뷰 반영 (11-20, 팀 결정)

| 리뷰 | 반영 |
|---|---|
| 1-1 첫날 소실 | `autoSleepAt`: 깬 뒤 첫 잠 시각의 다음 아침이 백그라운드 전환보다 앞이면(밤이 이미 끝남) 다음 잠 시각으로 넘긴다. 05:50·03:00 설치 테스트 |
| 1-2 콜드 스타트 | `parseState`: `backgroundSince === null`이면 `savedAt`(≥ lastSimAt)을 백그라운드 시각으로. **앱은 MMKV 저장을 appBackground 처리 뒤에 한다** |
| 1-3 시계 1년 앞당김 | 12h 넘는 역행 = 시계 보정(`suspect: 'reset'`): 경과 0, hwm·lastSimAt = now, 살아 있는 시각(sleepAt·lastWakeAt·lastCareAt·backgroundSince·마지막 획)을 같은 폭만큼 옮김. systems 3.4 v1.2 |
| 1-4 가운데 반복 | 가운데 풀 = 가운데 2 + 부호가 가리키는 가장 가까운 사분면 2 = 12장면. 무입력·약입력 각 100명 7밤 반복 0 테스트 |
| 1-5 쏠림 | novel = 최근 3획과의 차이 **평균**, dist = 점들의 몸 표면 거리 **평균**, speed = **로그 척도**(0.67 W/s = 0.5, 4옥타브). 상수(속도·길이 1.6·거리 0.91·탭 반경 1.26)는 합성 손획 분포(`test/sim-helpers.ts synthStroke`)에서 평균 ≈ 0.5로 맞춘 값이다 → 스파이크 02 실제 손획으로 다시 맞춘다. 편향 테스트를 `reduce` → 장부 → 측정값 경로로 교체(200명 7일, 날짜별 측정 평균·성향 평균) |
| 6 세 건 | 첫 밤 문장: \|v\| ≥ 0.04일 때만 change, 아니면 관찰 / 씻은 뒤 다시 그어도 `stageReached`는 한 번(`peakStrokes`) / 시간대 이동 뒤 깨는 시각 단언(서울 23:00 잠 → LA 다음 날 06:00) |
| 8 테스트 | 무작위 30일 열에 setTimes·씻기 추가, 불변식 추가(하루 획 ≤ 1, 잠·깸 번갈아, lastSimAt = hwm, 한 번에 +4일 이하, 첫 7장 장면 중복 없음). 빠진 케이스: 72h ± 1ms, 재우기 창 경계, setTimes 잘못된 값, 첫 밤 무입력, 획 수 불일치, +4 재현 |
| 9 필드 검증 | `parseState`가 필수 필드·타입, phase, 축 값, sim 블록 버전 = state.schemaVersion을 검사하고 손상 세이브를 거부 |
| 판단 3건 | 유지. systems 3.3을 '최대 +4(보통 +3)'로, 깸 정의를 '깸 = 깰 수 있는 시각, 아침 연출 = 그 뒤 첫 방문'으로 고침. DECISIONS D-07 한 줄 |

남은 것(리뷰 낮음, 이번에 안 함): 자는 중 터치의 물 한 방울 연출(아트와 맞춤), 역행 중 씻기 5초 창, DST(앱이 모든 이벤트에 tzOffsetMin을 넣는 쪽으로 정리 필요 — 지금은 appForeground만 받는다), 옛 봉투 경로의 이름 정리.

