// 글꼴·글자 토큰(아트 6절, 리뷰 U3·U4). 번들 글꼴(OFL): 명조 = Gowun Batang(본문·제목·시 한 줄), 고딕 = Pretendard(UI 라벨).
// 영어판(D-17): 명조 자리는 Cormorant Garamond — 제목 Medium, 시 한 줄 Medium Italic(아트 6절). KText가 언어에 따라 바꿔 끼운다.
// 글꼴은 expo-font useFonts로 싣는다(네이티브 재빌드 불필요). 원장: docs/team/license-ledger.md 3절.
// 한국어 줄바꿈 = 어절 단위: 웹 word-break keep-all, iOS lineBreakStrategyIOS 'hangul-word', Android는 어절 안 글자 사이에 WORD JOINER(U+2060).
import { useFonts } from 'expo-font';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, type TextProps, type TextStyle } from 'react-native';
import { PARAMS } from '../render/clock';
import { getLocale, type Locale } from '../i18n';

export const FONT_FILES = {
  // 서브셋(v1.2): 앱 글자 + KS X 1001 한글 2,350자 + 영문·숫자·문장부호, 8.4MB → 1.4MB. 다시 만들기: node tools/font/subset.mjs
  GowunBatang: require('../../assets/fonts/GowunBatang_400Regular.subset.ttf'),
  Pretendard: require('pretendard/dist/public/static/Pretendard-Regular.otf'),
  // 영어 명조(라틴 서브셋 약 150KB + 100KB). 다시 만들기: node tools/font/subset-latin.mjs
  CormorantGaramond: require('../../assets/fonts/CormorantGaramond_500Medium.subset.ttf'),
  CormorantGaramondItalic: require('../../assets/fonts/CormorantGaramond_500Medium_Italic.subset.ttf'),
};

/** 앱 시작 때 한 번. 실패해도(웹 오프라인 등) 시스템 글꼴로 계속 간다 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts(FONT_FILES);
  return loaded || !!error;
}

export const SERIF = Platform.select({ web: 'GowunBatang, "Noto Serif KR", serif', default: 'GowunBatang' });
export const SANS = Platform.select({ web: 'Pretendard, "Apple SD Gothic Neo", system-ui, sans-serif', default: 'Pretendard' });
const SERIF_EN = Platform.select({ web: 'CormorantGaramond, Garamond, Georgia, serif', default: 'CormorantGaramond' });
const SERIF_EN_ITALIC = Platform.select({ web: 'CormorantGaramondItalic, Garamond, Georgia, serif', default: 'CormorantGaramondItalic' });

/** 명조 역할: title = 날 세기·제목·노트 머리(Medium), line = 시 한 줄·안내 문장(Italic) */
export type SerifRole = 'title' | 'line';
/** Cormorant는 x높이가 작아 같은 pt에서 한글 명조보다 작아 보인다 → 영어 명조만 키운다 */
export const EN_SERIF_SCALE = 1.16;

/** 언어별 명조 글꼴 이름(KText 밖 — 세로 제목·Skia 카드 — 에서 쓴다) */
export function serifFamily(role: SerifRole = 'line', loc: Locale = getLocale()): string {
  if (loc === 'ko') return SERIF;
  return role === 'title' ? SERIF_EN : SERIF_EN_ITALIC;
}

/** 명조 스타일을 현재 언어에 맞춘다: 영어면 Cormorant + 크기·행간 보정, 자간은 1%로 */
export function localizeSerif(style: TextProps['style'], role: SerifRole, loc: Locale = getLocale()): TextProps['style'] {
  if (loc === 'ko') return style;
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  if (flat.fontFamily !== SERIF) return style;
  const size = flat.fontSize ?? 14;
  return [
    style,
    {
      fontFamily: serifFamily(role, loc),
      fontSize: size * EN_SERIF_SCALE,
      lineHeight: flat.lineHeight ? flat.lineHeight * EN_SERIF_SCALE : undefined,
      letterSpacing: size * 0.01,
    },
  ];
}

/** 자간 토큰 두 개: 명조 +4%, 고딕 0 */
export const track = {
  serif: (size: number) => size * 0.04,
  sans: 0,
};

/** 글자 크기 배율. 네이티브 = OS 설정, 웹 = ?fs=1.5(품질 관문 캡처용) */
export function useFontScale(): number {
  const { fontScale } = useWindowDimensions();
  return Platform.OS === 'web' ? PARAMS.fs : fontScale;
}

const WJ = '⁠';
/** 어절 안 글자 사이에 WORD JOINER → 공백에서만 줄이 바뀐다(Android용) */
export function keepWords(s: string): string {
  return s.replace(/(\S)(?=\S)/gu, `$1${WJ}`);
}

function mapStrings(node: ReactNode): ReactNode {
  if (typeof node === 'string') return keepWords(node);
  if (Array.isArray(node)) return node.map(mapStrings);
  return node;
}

/**
 * 본문 Text: 한국어 어절 단위 줄바꿈 + 명조 자리의 언어별 글꼴(serif 역할) + (웹) 글자 배율 흉내. maxFontSizeMultiplier 기본 2(D-08 200%).
 */
export function KText({ children, style, serif = 'line', maxFontSizeMultiplier = 2, ...rest }: TextProps & { children?: ReactNode; serif?: SerifRole }) {
  const fs = useFontScale();
  const loc = getLocale();
  let st: TextProps['style'] = localizeSerif(style, serif, loc);
  if (Platform.OS === 'web') {
    const flat = (StyleSheet.flatten(st) ?? {}) as TextStyle;
    const k = Math.min(fs, maxFontSizeMultiplier ?? 2);
    st = [
      st,
      { wordBreak: 'keep-all', overflowWrap: 'break-word' } as unknown as TextStyle,
      k !== 1 && flat.fontSize ? { fontSize: flat.fontSize * k, lineHeight: flat.lineHeight ? flat.lineHeight * k : undefined } : null,
    ];
  }
  return (
    <Text
      {...rest}
      style={st}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      lineBreakStrategyIOS="hangul-word"
    >
      {Platform.OS === 'android' && loc === 'ko' ? mapStrings(children) : children}
    </Text>
  );
}
