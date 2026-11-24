#!/usr/bin/env bash
# V0-5 정본 일괄 개정 뒤 검사 (읽기 전용 — 파일을 고치지 않는다)
# 쓰는 법(저장소 뿌리에서):
#   bash docs/design/concept-v3/v0-5-amendments/checks.sh c-prime    # C′
#   bash docs/design/concept-v3/v0-5-amendments/checks.sh keyboard   # C′-키보드
# 통과 = 마지막 줄 "남은 것 0", 종료 코드 0. 남은 것이 있으면 1, 인자·파일 오류는 2.
# 표시로 인정하는 것(A3 방식, 독립 리뷰 반영 11-25):
#   ① 옛 값 자체가 ~~취소선~~ 안에 있음(줄의 다른 곳 취소선은 인정하지 않음)
#   ② 같은 줄에 [대체됨…] · [개정…] · [해소…] · […기록…] · [옛 값] · (D-26 대체)
set -u
BRANCH="${1:-}"
case "$BRANCH" in
  c-prime|keyboard) ;;
  *) echo "인자: c-prime 또는 keyboard" >&2; exit 2 ;;
esac
exec python3 -I - "$BRANCH" <<'PY'
import re, sys, os
branch = sys.argv[1]
FILES = """DECISIONS.md docs/creative/v1/art-bible-v1.md docs/design/systems-v1.md docs/design/sim-impl-v1.md
docs/design/plan-v2/plan-v2.md docs/design/pillars-v1/C-integrated.md docs/design/content-v1/dreams-30days.md
docs/design/server-v1/architecture.md docs/strategy/number-one.md docs/strategy/marketing-plan.md
docs/release/store-listing.md docs/release/privacy-policy.ko.md docs/release/privacy-policy.en.md
docs/release/legal-review-questions.md docs/release/privacy-checklist.md docs/team/feature-map.md
docs/sound/sound-v0.md docs/team/owner-todo.md""".split()
META = ["docs/design/concept-v3/concept-review.md", "docs/team/roadmap.md", "docs/design/concept-v3/rollout-plan.md"]
DATE_ONLY = ["docs/release/tester-recruit.md"]   # 빌드 1(현행 컨셉) 안내문 — '한 획'이 맞다
missing = [f for f in FILES + META + DATE_ONLY if not os.path.isfile(f)]
if missing:
    print("파일 없음(이름이 바뀌었나?):", *missing, sep="\n  "); sys.exit(2)
MARK = re.compile(r"\[(대체됨|개정|해소)[^\]]*\]|\[[^\]]*기록[^\]]*\]|\[옛 값\]|\(D-26 대체\)")
STRIKE = re.compile(r"~~.*?~~")
OK_HAN = re.compile(r"몸에 붙은 한 획|몸에 붙는 한 획|남는 한 획|붓 한 획|한 획 \+ 말결|한 획의 좌표|한 획과 (그 말의 )?분류값")
def lines(files):
    for f in files:
        for i, l in enumerate(open(f, encoding="utf-8"), 1):
            yield f, i, l.rstrip("\n")
total = 0
def check(name, pat, files, ok=None):
    global total
    rx = re.compile(pat); hits = []
    for f, i, l in lines(files):
        if not rx.search(l) or MARK.search(l): continue
        rest = STRIKE.sub("", l)
        if ok: rest = ok.sub("", rest)
        if rx.search(rest): hits.append(f"    {f}:{i}: {l[:200]}")
    print(f"{name:<26} {len(hits):>4}")
    if hits: print(*hits, sep="\n")
    total += len(hits)
print(f"== 옛 값 (갈래: {branch})")
check("하루 한 획 / 한 획", r"하루 한 획|오늘의 한 획|한 획씩|한 획을 그어|\"한 획\"|한 획 / Stroke", FILES, OK_HAN)
check("One stroke a day (en)", r"[Oo]ne stroke a day|Draw one stroke|Today.s stroke", FILES)
check("30일차·30밤·30획", r"30일차|30밤|30획|이레 뒤 30일|이레 이후 30일", FILES)
check("30일(시스템·꿈)", r"30일", ["docs/design/systems-v1.md", "docs/design/content-v1/dreams-30days.md"])
check("씻기", r"씻기|물로 씻|washUsed", FILES)
check("이레 = 7획 끝 표식", r"이레\(7획\)|이레째\(7획\)|MVP 끝 표식", FILES)
check("옛 날짜 12-22", r"12-22", FILES + DATE_ONLY + META)
check("옛 날짜 01-21", r"01-21", FILES + DATE_ONLY + META)
check("옛 날짜 12-10", r"12-10", FILES + DATE_ONLY + META)
check("옛 RC 12-19", r"RC1?\)? ?12-19|12-19 RC|빌드 3\(RC1?\) ?12-19", FILES + META)
check("옛 출시 '2월 초'", r"2월 초", FILES + META)
check("옛 관문 Q1~Q14", r"Q1~Q14", FILES + META)
check("옛 용어 마음 결 48", r"마음 결 48", FILES + META)
check("옛 용어 곁에 앉기 등", r"곁에 앉기|고요 .갸웃|인식 실패 = 고요", FILES + META)
check("잠정 표시", r"\[잠정 — 11-30|5일 검증 뒤 세부 확정\]|팀 토론안|상태: \*\*잠정", ["DECISIONS.md"] + META)
check("sim 옛 용어", r"타고난 결|결 축", ["docs/design/sim-impl-v1.md"])
if branch == "keyboard":
    print("== C′-키보드: 필기 인식이 남은 곳")
    check("ML Kit·손글씨·handwriting", r"ML Kit|Digital Ink|ink-recognizer|손글씨|필기 인식|[Hh]andwriting", FILES)
    check("가장 긴 획", r"가장 긴 획|longest stroke", FILES)
print("== 새 링크가 가리키는 파일")
for p in ["docs/design/concept-v3/rollout-plan.md", "docs/design/concept-v3/heart-grain-48.md",
          "docs/design/concept-v3/care-rituals.md", "docs/design/concept-v3/v0-5-applied.md"]:
    ok = os.path.isfile(p)
    print(("  있음  " if ok else "  없음  ") + p)
    if not ok: total += 1
print(f"== 남은 것 {total}")
sys.exit(1 if total else 0)
PY
