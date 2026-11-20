# 영어 원어민 검수 목록 (i18n v1)

- 대상: `apps/mobile/src/i18n/en.ts`(정본). D-17 확정 조건 "영어 원어민 검수 1회"용이다.
- 근거: 독립 리뷰 `docs/team/reviews/2026-11-20-i18n-review.md` 1절. 팀 결정(11-20)에 따라 P1 전부와 P2 일부는 리뷰 대안을 **이미 반영**했다. 검수자는 반영본이 자연스러운지 보고, 남은 후보 중에서 고른다.
- 톤 기준: 아트 바이블 0·6절, `docs/release/store-listing.md` 3-2. 절제되고 조용하게 쓴다. 느낌표·광고체를 쓰지 않는다. 아이에게 말 거는 투도 쓰지 않는다.
- 이름: `Mongmangi`(D-06 R5 1순위, 임시). 판정이 나면 `brand.ts` 한 줄만 바꾼다.
- 검수 방법: 표마다 '판정' 칸에 ✓(그대로) / 대안 번호 / 새 문장을 적는다. 화면 맥락은 `docs/app/i18n-v1/en-w390-*.png`에서 볼 수 있다.

## 1. 반영한 것 — 자연스러운지 확인

| 키 | 이전 | 지금(반영본) | 왜 바꿨나 | 판정 |
|---|---|---|---|---|
| `MONG_EN` | Mongmang | Mongmangi | R5 후보 밖이었고 스토어 문안과 어긋났다 | |
| `morning.title` | Morning, Day 2 | Day 2 · Morning | 인사말("Morning, Dave")로 읽혔다 | |
| `line.rehydrated` | The ink is moist again | The ink is wet again | 'moist'는 꺼리는 단어다 | |
| `note.wet` | The ink is moist | The ink is fresh | 같음 | |
| `line.reject.used` | Today’s stroke is drawn · a new one comes in the morning | You’ve drawn today’s stroke · another comes in the morning | 'is drawn'은 진행 중으로도 읽힌다 | |
| `obj.brush.a11yDone` | Brush. Today’s stroke is drawn | Brush. You’ve drawn today’s stroke | 같음 | |
| `note.strokeUsed` | Today’s stroke is drawn | Today’s stroke is done | 같음 | |
| `time.wake` | around 12 a.m. / 12 p.m. | around midnight / around noon | 12 a.m./p.m.은 헷갈린다 | |
| `card.share` / `.a11y` | Send · coming soon / … the next update | Share · coming soon / Share this card — coming in a later update | 공유 동작은 'Share'. 'next'는 날짜를 약속하는 말 | |
| `intro.ask` | Touch it? | Will you touch it? | 권유 어감. 스토어 캡션과 맞춤 | |
| `night.name`(=1) | The first night | First night | 문장 안에서 관사 붙은 대문자 구가 어색하다 | |
| `night.stillAsleep` | … is still sleeping · wakes {time} | … is still asleep · it wakes {time} | 주어 없는 메모체였다 | |
| `line.brushBlocked` | … settled on its body · by morning the brush is wet again | … settled into its body · by morning the brush will be wet again | 시제·전치사 | |
| `line.lostSave` | Your earlier Mongmang couldn’t be read · … | Your Mongmangi’s save couldn’t be read · the original is kept safe on this device | 'earlier'가 '다른 아이'로 읽혔다 | |
| `notif.ask` | Shall we tell you when the morning’s dream surfaces? | Shall we let you know when the dream surfaces each morning? | 소유격과 동사가 겹쳤다 | |
| `notif.body` | Last night’s dream has developed | Last night’s dream has surfaced | 앱 밖 알림에서 'developed'는 '생겨났다'로 읽힌다 | |
| `morning.lift` | Lift the paper up from the water | Lift the paper from the water | 군더더기. 스토어 문안과 같게 | |
| `note.listView` | Show a list instead of objects | Show the tools as a list | 'objects'는 개발 용어다 | |
| `note.thumb.a11y` | {card} Open larger | {card}. Opens a larger view | 스크린리더에서 붙어 읽혔다 | |
| `assist.place` | Place | Position | 동사로 먼저 읽혔다 | |
| `assist.choice` | Mongmang’s {place} · {dir} · … | Position: {place} · Direction: {dir} · Length: {len} · Curve: {bend} | 스크린리더용이라 이름표를 단 꼴이 분명하다 | |
| `assist.bendName` | Strongly left … | Sharp left / Slight left / Straight / Slight right / Sharp right | 'Curve' 줄의 값으로 맞춤. 320 폭에서 말줄임도 없앰 | |
| `obj.list.hold` | (hold) | (press and hold) | 조작인지 상태인지 모호했다 | |
| `motif.center.moon` · `scene.center.moon` | a round moon | a full moon | '둥근 달'의 직역이었다 | |
| `motif.far-alone.sea` | the sea, seen alone | the sea, watched alone | "혼자 보였다"로 읽혔다. 짝 모티프와 대구 | |
| `motif.far-with.sea-hand` | the sea, hand in hand | the sea, watched hand in hand | 바다가 손을 잡은 꼴로 읽혔다 | |
| `scene.far-with.sea-hand` | Two small Mongmang drops sit side by side by the water | Two small drops, like Mongmangi, sit side by side at the water’s edge | by…by 겹침, 합성어 | |
| `poem.cause.tapSpread.*` | you showed it many places / one place yesterday | you showed it all around / just one spot yesterday | 여행시켜 준 뜻으로 읽혔다 | |

## 2. 아직 반영하지 않은 후보(P3) — 검수자가 고른다

| 키 | 지금 | 후보 | 메모 | 판정 |
|---|---|---|---|---|
| `intro.a11yHint`, `home.mong.hint` | Double-tap to touch it / Double-tap to pet | ① Touches the drop ② 비움 | iOS·TalkBack이 "double-tap"을 스스로 읽어 두 번 들린다 | |
| `line.firstStroke` | Tonight, today’s stroke becomes a dream | Tonight, this stroke becomes a dream | today/Tonight 겹침 | |
| `home.mong.rub` | Rub | Rub gently | 거칠게 들림 | |
| `assist.handle` | Handle | Curve handle | 무엇의 손잡이인지 | |
| `assist.close` | By hand | Draw by hand | 버튼은 동사로 | |
| `note.title` / `home.seal.a11y` | Studio Notebook / Studio notebook | 대소문자 규칙 하나로 | | |
| `line.washHint` | Wash it with the water dropper to draw again | Wash it away with the water dropper to draw again | 붓을 씻는 것으로 읽힘 | |
| `line.washed` | … you may draw once more | … you can draw once more | 'may'는 허락 어감 | |
| `note.saveError` | Saving to this device isn’t working right now · please check … | Can’t save to this device right now · check your free storage before closing the app | 짧게 | |
| `note.lang.system` | Same as device | Device language | 설정 관용어 | |
| `note.morning` | Morning | Wake-up / Morning time | 'Bedtime'과 짝 | |
| `motif.far-alone.mountain` / `scene.*` | a far mountain / far mountain ridge | a distant mountain / a distant ridge | 한정 용법 'far'는 고어풍 | |
| `motif.far-with.stars-drops` | stars and drops of water | stars and waterdrops | 리듬 | |
| `scene.near-alone.quilt` | sleeps with closed eyes on a quilted blanket | sleeps on a quilted blanket | 중복 | |
| `scene.far-alone.sea` | Bands of sea water | Bands of seawater | 표기 | |
| `poem.effect.closeness.minus` | likes its own small place | likes its own little corner | 관용 | |
| `poem.cause.*` 16개 | 모두 "…yesterday"로 끝남 | 반은 "yesterday, you …"로 앞머리, 반은 'yesterday' 생략 | 매일 같은 꼬리. 비교본을 만들어 고른다 | |
| `night.soothe` | The ink drifts loose in the water. By morning, it gathers back into its body | 'loose' 빼기 | 리뷰가 가장 좋다고 한 줄. 손댈지 판단만 | |

## 3. 검수자에게 묻는 것
1. 아침 문장 꼴 "{결과} — {까닭}"(예: "The ink spreads at its leisure — you drew slowly yesterday")이 매일 읽기에 자연스러운가?
2. 'it'으로 부르는 것(he/she 아님)이 정 붙이기에 차갑지 않은가?
3. 사물 이름 Brush · Inkstone · Water dropper와 라벨 Stroke · Grind ink · Sleep의 결이 맞는가? 라벨은 아트 7-1에서 확정한 값이고, 바꾸려면 아트 결정이 필요하다.
4. 'surfaced'(알림)와 'Lift the dream'(버튼)이 같은 장면(물 위 한지를 건져 올림)으로 이어 읽히는가?

## 4. C6 꿈 콘텐츠 — 꿈 모티프 25·캡션·보름(dreams-30days v1.1 6-4에서 옮김, 11-20)

- 대상 키: `motif.*` 15·`scene.*` 15(새 모티프), `caption.cause.*` 15, `caption.line.*` 25, `caption.moon.*` 6, `moon.*` 3, `scene.moon.*` 3, `caption.first`, `caption.dream`. 문구는 정본 표 그대로 넣었다(개발이 쓴 것은 `scene.moon.*` 3개뿐 — core `draft: ['en.scene']`로 제품 출시가 막혀 있다).

| 우선 | 항목 | 질문 | 판정 |
|---|---|---|---|
| 1 | `caption.cause.*` 15 | '{결과} — {원인}' 어순(예: "Last night it slept under a quilt — it watches small things lately")이 자연스러운가, `lately` 반복(15개 중 8개) 변주 | |
| 1 | `caption.line.*` 25 + 보름 3 | 꼬리 섞기(`Last night`·`In its dream`·없음)가 같은 카드 아래에서 어색하지 않은가 | |
| 1 | `caption.line.far-alone.sea`·`far-alone.path`의 **ran** | 원격 모티프 금지어(`/\bran\b/`, 발 동사)에 걸린다. 바다·길이 '흐르다·이어지다' 뜻이라 금지 취지와는 다르지만, 같은 상한·금지어를 번들에도 적용하므로 다른 동사(flowed·wound 등)를 받고 싶다. 바꾸면 `apps/mobile/test/dream-text.test.ts`의 예외 두 줄을 지운다 | |
| 2 | 이름: a nap by the inkstone · washi on the line · a cupped hand · a bridge of stars · soundless snow · stepping stones · a swing of moonlight | 'washi'를 설명 없이 써도 되는가(장면 문장에는 'washi paper') | |
| 2 | `motif.center.moon` 'a full moon' → 'the moon on the water' | 보름 모티프와 겹침 해소안. **아직 반영하지 않았다**(검수 판정 뒤) | |
| 3 | `caption.first` 'First time dreaming this' | 라벨로 자연스러운가(대안 'A first for it') | |
| 3 | `scene.moon.*` 3(개발 초안) | 길이·톤. 확정되면 core `BUNDLED_MOON_MOTIFS`의 `draft`를 지운다 | |
