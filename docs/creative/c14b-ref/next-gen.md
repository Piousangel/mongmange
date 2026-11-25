# C14b 다음 생성 목록

## 9차 대기(11-25, Gemini 크레딧 소진 402 — 재시도 1회도 402)

| 키 | 모티프 | 바꿀 것(4차 블라인드) | 지금 |
|---|---|---|---|
| leafwater | near-with.palm(판 1 '잎에 고인 물') | 손 → 넓은 잎에 고인 물(안전) | 코드판 잎 + 맑은 물 |
| letterdoor | near-with.letter | 직선·도형 편지 → 문지방 아래 반쯤 들어온 접힌 한지 | letter-o3 비율 그대로 + 담묵 문지방 |

충전되면: `node scripts/gemini-ref.mjs --env ../mongmange/.env.local --set object --only leafwater,letterdoor --pro 3` → 고른 안을 `PICKS`에(판 1이 아직 열려 있으면 판 1에, 닫혔으면 판 2) → 손바닥은 `MotifShape.raster`를 더하고 `ART_REV_RASTERS`·`sources()`에 줄 추가.

## 8차에 끝남

- 11-25 오너가 Gemini 크레딧을 충전했다. 아래 목록(이불·찻잔·찻잔 둘·벼루·징검다리·빨랫줄) + 3차 블라인드 안전 지적의 **손 없는 창**(windowsill)을 gemini-3-pro-image 2K로 장마다 3안 생성했다(21장, 재시도 0).
- 판 1은 운영에서 켠 적 없는 열린 판(`OPEN_ART_REV = 1`)이라 **판 2를 만들지 않고 판 1에 바로** 넣었다(PM 지시). 고른 안·이유·손질은 `docs/team/license-ledger.md` 1-1, 결정은 DECISIONS C14b v8.
- 다시 생성할 때(판을 닫은 뒤 그림을 바꾸면 판 2): `node scripts/gemini-ref.mjs --env ../mongmange/.env.local --set object --only <키> --pro 3` → PNG를 1536px JPG q92로 줄이고 PNG 삭제 → `scripts/motif-raster.mjs` `PICKS` 갱신 → `ART_REV=<판> node scripts/motif-raster.mjs`(지난 판 폴더는 덮지 않음) → core `ART_REV_RASTERS[<판>]`·앱 `motifRasters.ts` `sources()`에 판 줄 추가.

| 키 | 모티프 | 고른 안 |
|---|---|---|
| quilt | near-alone.quilt | quilt-o1 |
| teacup | near-alone.teacup | teacup-o1 |
| teacuptwo | near-with.teacup-two | teacuptwo-o2 |
| inkstone | near-alone.inkstone | inkstone-o2 |
| stones | far-with.stepping-stones | stones-o3 |
| washingline | near-alone.washing-line | washingline-o3 |
| windowsill | near-with.window-hand | windowsill-o1 |
