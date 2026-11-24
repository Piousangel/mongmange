#!/usr/bin/env bash
# checks.sh 자체 시험 — 재리뷰 H4(거짓 통과)·H5/M4(거짓 실패)를 실행으로 증명한다.
# 저장소 파일은 건드리지 않고, 임시 폴더에 가짜 저장소를 만들어 checks.sh를 돌린다.
# 쓰는 법: bash docs/design/concept-v3/v0-5-amendments/selftest.sh   → 마지막 줄 "selftest 통과"
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
FILES="DECISIONS.md docs/creative/v1/art-bible-v1.md docs/design/systems-v1.md docs/design/sim-impl-v1.md
docs/design/plan-v2/plan-v2.md docs/design/pillars-v1/C-integrated.md docs/design/content-v1/dreams-30days.md
docs/design/server-v1/architecture.md docs/strategy/number-one.md docs/strategy/marketing-plan.md
docs/release/store-listing.md docs/release/privacy-policy.ko.md docs/release/privacy-policy.en.md
docs/release/privacy-policy-tester.ko.md docs/release/privacy-policy-tester.en.md docs/release/pia-quebec.md
docs/release/lawyer-check-list.md docs/release/legal-review-questions.md docs/release/privacy-checklist.md
docs/team/feature-map.md docs/sound/sound-v0.md docs/team/owner-todo.md docs/design/concept-v3/concept-review.md
docs/team/roadmap.md docs/design/concept-v3/rollout-plan.md docs/release/tester-recruit.md docs/release/README.md
docs/design/concept-v3/heart-grain-48.md docs/design/concept-v3/care-rituals.md docs/design/concept-v3/v0-5-applied.md"
reset() { rm -rf "$T"/*; for f in $FILES; do mkdir -p "$T/$(dirname "$f")"; : > "$T/$f"; done; }
run() { CHECKS_ROOT="$T" bash "$HERE/checks.sh" "$1" | tail -1 | sed 's/== 남은 것 //'; }
fail=0
expect() { # 이름 기대값 실제값
  if [ "$2" = "$3" ]; then echo "  통과  $1 (남은 것 $3)"; else echo "  실패  $1 — 기대 $2, 실제 $3"; fail=1
    CHECKS_ROOT="$T" bash "$HERE/checks.sh" "${4:-c-prime}" 2>&1 | grep '^    ' | sed 's/^/      /'; fi; }

echo "== 1. 거짓 통과가 없어야 함(옛 값이 잡혀야 함)"
reset
echo '- 정정: 소프트런칭 12-22 전후 [대체됨 → D-23: 소프트런칭 12-22 전후]' >> "$T/DECISIONS.md"   # D-23 표시
echo '- ~~빌드 2 12-10~~ 판정 01-21~01-26 그대로' >> "$T/DECISIONS.md"                          # 다른 곳 취소선
echo '| 빌드 3(12-19, RC) | x |' >> "$T/docs/design/pillars-v1/C-integrated.md"                  # RC 변형 1
echo '| W4 | RC1(12-19), 버그 |' >> "$T/docs/strategy/number-one.md"                              # RC 변형 2
echo '| 빌드 3(RC1) | 12-19 | M5 |' >> "$T/docs/strategy/number-one.md"                          # RC 변형 3
echo '옛 날짜 12-22 [기록](link.md)' >> "$T/docs/team/owner-todo.md"                             # 링크 '[기록](…)'
echo '- 마음 결 48 [개정 11-30] 그리고 같은 줄 앞쪽이 아닌 곳의 2월 초' >> "$T/docs/team/roadmap.md"  # 표시 앞 옛 값 + 뒤 옛 값
expect "C′ 옛 값 7줄" 7 "$(run c-prime)"
reset
echo '### 1-2. 손글씨 인식 (모든 테스터)' >> "$T/docs/release/privacy-policy-tester.ko.md"
echo '| C. ML Kit 진단 |' >> "$T/docs/release/pia-quebec.md"
echo '| A5 | 새 N1 | ML Kit |' >> "$T/docs/release/lawyer-check-list.md"
echo '| privacy-policy-tester | ML Kit 모델 |' >> "$T/docs/release/README.md"
expect "키보드: 테스터판·PIA·lawyer·README 4줄" 4 "$(run keyboard)"
expect "같은 파일을 C′로 보면 0" 0 "$(run c-prime)"
reset
echo '- ML Kit 손글씨 인식은 모든 기기에서 동작' >> "$T/docs/release/privacy-policy.ko.md"
echo '- ML Kit 손글씨 인식은 만 14세 확인을 통과한 기기에서만' >> "$T/docs/release/privacy-policy.ko.md"
expect "연령 게이트: 조건 없는 문장 1줄" 1 "$(run age-gate)"

echo "== 2. 거짓 실패가 없어야 함(표시된 줄은 통과해야 함)"
reset
printf '## 10. 바꾼 문장과 근거\n| 3 | 부제 | 하루 한 획, 아침마다 꿈 한 장 | 새 부제 |\n| 6 | en | One stroke a day becomes | x |\n## 11. 글자 수\n' >> "$T/docs/release/store-listing.md"
echo '| 8 | **B8 처리방침·라벨** | 빌드 2 제출(~~12-10~~ 12-19) 전 테스터판 12-15 |' >> "$T/docs/design/server-v1/architecture.md"
printf '## 4. 정본 개정 목록\n| 22 | owner-todo | 소프트런칭 12-22 → 01-12 |\n' >> "$T/docs/design/concept-v3/rollout-plan.md"
echo '- 일정: 소프트런칭 약 3주 연기(12-22 → 1월 둘째 주)' >> "$T/DECISIONS.md"
echo '| 236 | 판정 ~~01-21~01-26~~ 02-11~02-16 [개정 11-30, D-26] |' >> "$T/docs/strategy/marketing-plan.md"
echo '- 빌드: 빌드 1 → 빌드 2(12-10) → 빌드 3(12-19, RC). [대체됨 11-30 → D-18 개정 줄]' >> "$T/DECISIONS.md"
echo '| W2 | 12-04~12-10 | 이레 뒤 이어짐 [v0.4 → 대체됨] |' >> "$T/docs/strategy/number-one.md"
echo '- v2.2 변경 이력: 소프트런칭 12-22 전후 [기록]' >> "$T/docs/design/plan-v2/plan-v2.md"
expect "C′ 표시된 줄 8 + 기록 절 → 0" 0 "$(run c-prime)"

echo "== 3. 인자·위치 오류"
CHECKS_ROOT="$T" bash "$HERE/checks.sh" >/dev/null 2>&1; expect "인자 없음 → 종료 2" 2 "$?"
(cd /tmp && bash "$HERE/checks.sh" c-prime >/dev/null 2>&1); expect "저장소 밖 → 종료 2" 2 "$?"
[ "$fail" = 0 ] && echo "selftest 통과" || { echo "selftest 실패"; exit 1; }
