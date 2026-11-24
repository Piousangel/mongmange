#!/usr/bin/env bash
# V0-5 정본 일괄 개정 뒤 검사 v2 (읽기 전용 — 파일을 고치지 않는다)
# 쓰는 법(저장소 안 어디서나):
#   bash docs/design/concept-v3/v0-5-amendments/checks.sh c-prime     # C′
#   bash docs/design/concept-v3/v0-5-amendments/checks.sh keyboard    # C′-키보드
#   bash docs/design/concept-v3/v0-5-amendments/checks.sh age-gate    # C′-키보드(연령 미확인 기기만, 법률 H-2)
# 종료 코드: 0 = 남은 것 0 / 1 = 남음 / 2 = 인자·파일 오류.
# 시험용: CHECKS_ROOT=<폴더>면 그 폴더를 저장소 뿌리로 본다(selftest.sh가 씀).
#
# 표시로 인정하는 것(재리뷰 H4 반영 — 옛 값을 하나하나 따로 본다):
#   ① 그 옛 값이 ~~취소선~~ 안에 있다
#   ② 그 옛 값 바로 뒤(6자 안)에 '→'가 온다 — "12-22 → 01-12"처럼 바뀐 값을 함께 적은 기록
#   ③ 그 옛 값 뒤 같은 줄에 이번 묶음 표시가 있다(표시 뒤에 오는 옛 값은 덮지 않음):
#      [대체됨·개정·해소·기록·v… …] 괄호 안에 '11-30'·'D-26'·그 파일의 이번 판 이름이 있을 때만.
#      D-23 시절의 [개정 …]·[대체됨 → D-23 …]은 인정하지 않는다.
#   ④ 줄에 정확히 '[기록]'(지난 판 기록 줄 표시, 링크 '[기록](…)'는 아님)
#   ⑤ 기록용 절 전체: store-listing 10절(바꾼 문장과 근거)·12절(자체 점검), rollout-plan 4절(목록 자신)
set -u
BRANCH="${1:-}"
case "$BRANCH" in
  c-prime|keyboard|age-gate) ;;
  *) echo "인자: c-prime / keyboard / age-gate" >&2; exit 2 ;;
esac
if [ -n "${CHECKS_ROOT:-}" ]; then cd "$CHECKS_ROOT" || exit 2
else cd "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || { echo "저장소 밖입니다" >&2; exit 2; }; fi
exec python3 -I - "$BRANCH" <<'PY'
import re, sys, os
branch = sys.argv[1]
FILES = """DECISIONS.md docs/creative/v1/art-bible-v1.md docs/design/systems-v1.md docs/design/sim-impl-v1.md
docs/design/plan-v2/plan-v2.md docs/design/pillars-v1/C-integrated.md docs/design/content-v1/dreams-30days.md
docs/design/server-v1/architecture.md docs/strategy/number-one.md docs/strategy/marketing-plan.md
docs/release/store-listing.md docs/release/privacy-policy.ko.md docs/release/privacy-policy.en.md
docs/release/privacy-policy-tester.ko.md docs/release/privacy-policy-tester.en.md
docs/release/pia-quebec.md docs/release/lawyer-check-list.md
docs/release/legal-review-questions.md docs/release/privacy-checklist.md docs/team/feature-map.md
docs/sound/sound-v0.md docs/team/owner-todo.md""".split()
META = ["docs/design/concept-v3/concept-review.md", "docs/team/roadmap.md", "docs/design/concept-v3/rollout-plan.md"]
DATE_ONLY = ["docs/release/tester-recruit.md"]          # 빌드 1(현행 컨셉) 안내문 — '한 획'이 맞다
KB_EXTRA = ["docs/release/README.md"]                   # 키보드 검사에만
missing = [f for f in FILES + META + DATE_ONLY + KB_EXTRA if not os.path.isfile(f)]
if missing:
    print("파일 없음(이름이 바뀌었나? 저장소 뿌리인가?):", *missing, sep="\n  "); sys.exit(2)
VER = {"docs/design/systems-v1.md": "v1.5", "docs/creative/v1/art-bible-v1.md": "v1.6",
       "docs/design/plan-v2/plan-v2.md": "v2.4", "docs/strategy/number-one.md": "v0.4",
       "docs/strategy/marketing-plan.md": "v0.3", "docs/design/content-v1/dreams-30days.md": "v1.2",
       "docs/design/server-v1/architecture.md": "v2.4", "docs/sound/sound-v0.md": "v0.2",
       "docs/release/store-listing.md": "v0.6", "docs/release/privacy-policy.ko.md": "v3.4",
       "docs/release/privacy-policy.en.md": "v3.4"}
RECORD = {"docs/release/store-listing.md": [r"^## 10\. ", r"^## 12\. "],
          "docs/design/concept-v3/rollout-plan.md": [r"^## 4\. "]}
# 새 일정의 정당한 날짜(옛 값처럼 보이지만 새 값) — 줄 단위 예외, 늘릴 때는 README 4-1에 까닭을 적는다
ALLOW = [("docs/design/concept-v3/rollout-plan.md", re.compile(r"^\| V12c "))]   # V12c 블라인드 12-20~12-23 = '12-22 전후'
STRIKE = re.compile(r"~~.*?~~")
REC_TAG = re.compile(r"\[기록\](?!\()")              # 정확히 '[기록]' — 링크 '[기록](…)'는 아님
OK_HAN = re.compile(r"몸에 붙은 한 획|몸에 붙는 한 획|남는 한 획|붓 한 획|한 획 \+ 말결|한 획의 좌표|한 획과 (그 말의 )?분류값")
def mark_rx(f):
    keys = r"11-30|D-26" + ("|" + re.escape(VER[f]) if f in VER else "")
    return re.compile(r"\[(?=대체됨|개정|해소|기록|v\d)[^\]]*(?:" + keys + r")[^\]]*\]")
def lines(files):
    for f in files:
        rec = RECORD.get(f, []); inrec = False; mk = mark_rx(f)
        for i, l in enumerate(open(f, encoding="utf-8"), 1):
            l = l.rstrip("\n")
            if l.startswith("#"):
                inrec = any(re.match(p, l) for p in rec)
            yield f, i, l, inrec, mk
total = 0
def ok_at(l, m, mk):
    s, e = m.span()
    for sm in STRIKE.finditer(l):
        if sm.start() <= s and e <= sm.end(): return True
    if re.match(r"[\s'\"`*)]{0,4}→", l[e:e + 6]): return True
    for mm in mk.finditer(l):                 # 표시는 그 앞(마지막 표시 뒤)의 옛 값만 덮는다
        if mm.start() >= e: return True
    return False
def check(name, pat, files, ok=None):
    global total
    rx = re.compile(pat); hits = []
    for f, i, l, inrec, mk in lines(files):
        if inrec or REC_TAG.search(l) or any(f == af and ar.search(l) for af, ar in ALLOW): continue
        text = OK_HAN.sub(lambda x: " " * len(x.group()), l) if ok else l
        bad = [m.group() for m in rx.finditer(text) if not ok_at(l, m, mk)]
        if bad: hits.append(f"    {f}:{i}: [{', '.join(bad)}] {l[:170]}")
    print(f"{name:<28} {len(hits):>4}")
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
check("옛 RC 12-19(변형 포함)", r"RC1?\)?[ (,|]*12-19|12-19[ ,)]*RC|빌드 3[^|\n]{0,12}12-19", FILES + META)
check("옛 출시 '2월 초'", r"2월 초", FILES + META)
check("옛 관문 Q1~Q14", r"Q1~Q14", FILES + META)
check("옛 처리방침 게시 12-08", r"12-08 게시", FILES + META)
check("옛 용어 마음 결 48", r"마음 결 48", FILES + META)
check("옛 용어 곁에 앉기 등", r"곁에 앉기|고요 .갸웃|인식 실패 = 고요", FILES + META)
check("잠정 표시", r"\[잠정 — 11-30|5일 검증 뒤 세부 확정\]|팀 토론안|상태: \*\*잠정", ["DECISIONS.md"] + META)
check("sim 옛 용어", r"타고난 결|결 축", ["docs/design/sim-impl-v1.md"])
KB = r"ML Kit|Digital Ink|ink-recognizer|손글씨|필기 인식|[Hh]andwriting"
if branch == "keyboard":
    print("== C′-키보드: 필기 인식이 남은 곳(테스터판·PIA·lawyer-check-list·release README 포함)")
    check("ML Kit·손글씨·handwriting", KB, FILES + KB_EXTRA)
    check("가장 긴 획", r"가장 긴 획|longest stroke", FILES)
if branch == "age-gate":
    print("== 연령 게이트(H-2): 방침·라벨의 ML Kit 문장마다 연령 확인 조건이 같은 줄에 있어야 함")
    rx = re.compile(KB); gate = re.compile(r"연령 확인|만 14세 확인|age check|passed the age")
    hits = [f"    {f}:{i}: {l[:170]}" for f, i, l, inrec, mk in lines([
        "docs/release/privacy-policy.ko.md", "docs/release/privacy-policy.en.md",
        "docs/release/privacy-policy-tester.ko.md", "docs/release/privacy-policy-tester.en.md",
        "docs/release/store-listing.md"])
        if not inrec and not REC_TAG.search(l) and rx.search(STRIKE.sub("", l)) and not gate.search(l)]
    print(f"{'ML Kit 조건 없는 문장':<28} {len(hits):>4}")
    if hits: print(*hits, sep="\n")
    total += len(hits)
print("== 새 링크가 가리키는 파일")
for p in ["docs/design/concept-v3/rollout-plan.md", "docs/design/concept-v3/heart-grain-48.md",
          "docs/design/concept-v3/care-rituals.md", "docs/design/concept-v3/v0-5-applied.md"]:
    ok = os.path.isfile(p)
    print(("  있음  " if ok else "  없음  ") + p)
    if not ok: total += 1
print(f"== 남은 것 {total}")
sys.exit(1 if total else 0)
PY
