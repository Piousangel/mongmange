# C14b 다음 생성 목록 (판 2 — Gemini 충전 뒤)

- 근거: 블라인드 판정(2026-11-25, `docs/team/reviews/2026-11-25-c14b-blind-verdict.md`) '다시' 6장 + PM 판정 "사물은 손질 래스터, 장은 코드 마블링으로 세트 통일". 받은 카드는 artRev로 지켜지므로 **판 2**로 올린다.
- 막힌 곳: Gemini API 선불 크레딧 소진(402, 11-25). 충전되면 아래 한 줄로 이어 간다. 프롬프트 원문은 `scripts/gemini-ref.mjs` `OBJECT`(공통 꼬리 `OBJECT_COMMON` — 한지 위 사물 하나, 젖은 테·과립·비백, 마블링·배경·글자·인물·생물 없음).

## 1. 생성 (gemini-3-pro-image 2K, 장마다 3안)

```sh
node scripts/gemini-ref.mjs --env ../mongmange/.env.local --set object --only quilt,teacup,teacuptwo,inkstone,stones,washingline --pro 3
for f in docs/creative/c14b-ref/{quilt,teacup,teacuptwo,inkstone,stones,washingline}-o*.png; do sips -s format jpeg -s formatOptions 92 -Z 1536 "$f" --out "${f%.png}.jpg" && rm "$f"; done
```

| 키 | 모티프 | 바꿀 것(블라인드 판정) | 프롬프트 요약 |
|---|---|---|---|
| quilt | near-alone.quilt(기존) | 점무늬 벡터 타원 → 수묵 이불 | 옆에서 본 접힌 이불, 담묵 면 + 성긴 박음질 땀, 접힌 곳 젖은 테, 무언가 잠든 듯 둥근 윗선 |
| teacup | near-alone.teacup(기존) | 벡터 외곽선 잔 → 수묵 잔 | 작은 찻사발 옆모습, 아래 가장자리 먹 고임, 입술은 종이 여백, 김 한 획 |
| teacuptwo | near-with.teacup-two(기존) | 같음 + '찻잔 하나'와 64px 구별 | 크기 다른 두 사발을 비스듬히(앞·아래 / 뒤·위), 두 김이 서로 감김 |
| inkstone | near-alone.inkstone | 검은 조각이 벼루로 안 읽힘 | 비스듬히 본 벼루, 한쪽 연지에 고인 먹(젖은 광택 테), 곁에 먹 한 자루 |
| stones | far-with.stepping-stones | 흰 조각 돌이 안 읽힘 | 멀어지는 납작 디딤돌 다섯, 물에 닿는 아랫선이 짙음, 멀수록 작고 옅게 |
| washingline | near-alone.washing-line | 벡터 줄 + 반투명 회색 사각 | 비백 줄 하나에 걸린 한지 한 장, 윗변이 줄 처짐을 따르고 아랫변 찢긴 결 |

## 2. 손질 → 판 2 에셋

1. `scripts/motif-raster.mjs`의 `PICKS`에 고른 안을 더하고(모티프 id → `<키>-o<n>`), `ART_REV=2 node scripts/motif-raster.mjs` → `apps/mobile/assets/motifs/r2/` (r1은 지우지 않는다).
2. core `sim/dreamMotifs.ts`: `DREAM_ART_REV = 2`, `ART_REV_RASTERS[2]` = 1판 6장 + 위 6장(바뀌지 않은 장도 r2에 다시 둔다 — 판 폴더 = 그 판 목록 규칙).
3. 형상 데이터: 기존 3장(이불·찻잔·찻잔 둘)은 그릇(vessel) 대신 래스터 자리(`raster.box`·`cover`)를 받게 하고, 벼루·징검다리·빨랫줄은 `raster`를 더한다. **판 1의 형상·장면 해시는 남긴다**(`SCENE_SNAPSHOT_BY_REV[1]`).
4. 앱 `motifRasters.ts` `sources()`에 판 2 줄을 더한다(판 1 줄은 남김). 번들 예산 시험(판당 760KB·전체 2MB)을 넘으면 예산을 PM과 다시 정한다.
5. 시험·시트: `pnpm verify`, `RENDER_HEAVY=1`, `node scripts/c14b-capture.mjs`, 블라인드 시트는 새 시드로.
