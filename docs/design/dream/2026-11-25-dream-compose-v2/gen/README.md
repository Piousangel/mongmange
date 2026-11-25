# gen/ — 생성 이미지 자리 (11-25: 0장)

- 11-25 22시대 회의 실험 `exp/dream-compose.mjs`를 다시 돌렸으나 첫 호출(probe)이 **HTTP 402 `RESOURCE_EXHAUSTED` — prepayment credits are depleted**로 막혔다(`docs/design/meetings/2026-11-25-owner-direction/exp/log.txt` 두 번째 줄). 지시대로 멈췄고 재시도하지 않았다. 과금 0.
- 그래서 몸 4획 Gemini 시안(`stroke4-gemini.mjs`, 3안 × 2묶음 = 6장, 약 $0.40)도 **실행하지 않았다.** 스크립트는 충전 뒤 그대로 돌릴 수 있게 두었다(첫 호출 실패 시 멈춤, 키 비노출, 프롬프트를 장마다 `.prompt.txt`로 남김).
- 대신 같은 세 안(A 네 자리 · B 두름 넷 · C 고리 넷)을 **코드 렌더**로 그려 블라인드에 올렸다 → `../captures/face-{A,B,C}.png`. AI 생성물이 아니다.
- 충전 뒤 순서: ① `node docs/design/meetings/2026-11-25-owner-direction/exp/dream-compose.mjs`(5장, 약 $0.34) ② `node docs/design/dream/2026-11-25-dream-compose-v2/gen/stroke4-gemini.mjs`(6장) ③ 결과를 license-ledger 1절에 '탐색'으로 한 줄씩 ④ README 1·4절 판정 갱신.
