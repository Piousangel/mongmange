// 언어와 무관하게 한 곳에 두는 이름·표식(D-06, D-17).

/**
 * 영어판에서 몽망이를 부르는 일반 호칭 — **임시**. D-06 R5 이름 테스트(① Mongmangi ② Mong-mangE ③ mongmangE) 판정 전까지
 * 1순위 'Mongmangi'를 쓴다(스토어 문안 3-2와 같음, 11-20 리뷰 P1-1). 판정이 나면 이 한 줄만 바꾼다. 영어 문구는 이 상수를 끼워 넣는다(en.ts).
 */
export const MONG_EN = 'Mongmangi';

/** 공방 노트 입구 주사 낙관에 새긴 글자. 그림(인장)의 일부라 언어와 무관하게 같다(아트 7-2) */
export const SEAL_GLYPH = '몽';

/** 언어 고르기에 쓰는 자기 이름(어느 언어 화면에서도 그 언어 글자로 보인다) */
export const LANGUAGE_NAMES = { ko: '한국어', en: 'English' } as const;
