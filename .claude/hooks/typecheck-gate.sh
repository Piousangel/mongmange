#!/bin/sh
# 완료 관문(OPERATING 8절): 앱·서버·코어 코드에 미커밋 변경이 있으면 끝내기 전에 타입 검사를 돌린다.
# 실패하면 종료 코드 2로 완료를 막고, 오류 요약을 Claude에게 돌려준다. 문서만 바뀐 턴은 그냥 통과.
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
if git status --porcelain -- apps packages 2>/dev/null | grep -q .; then
  out=$(pnpm -s typecheck 2>&1)
  if [ $? -ne 0 ]; then
    echo "[완료 관문] 타입 검사 실패 — 고친 뒤 완료하세요." >&2
    echo "$out" | grep -E "error TS|ERR_" | head -20 >&2
    exit 2
  fi
fi
exit 0
