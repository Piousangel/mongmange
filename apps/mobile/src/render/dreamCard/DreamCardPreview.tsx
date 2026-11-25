import { DREAM_TEMPERS, day7ClumsyRecords, day7Records, sim, type DreamAspect } from '@mong/core';
import { useEffect, useMemo, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { morningLine } from '../../game/text';
import { cardLabels } from '../../screens/cardText';
import { t as tr } from '../../i18n';
import { useAppFonts } from '../../ui/type';
import { DreamCard, type DreamCardLabels } from './DreamCard';
import { renderDreamCardImage } from './renderImage';

/**
 * 미리보기: ?screen=card&motif=<id>&seed=<n>&t=a|b|c&aspect=45|916&comp=0|1|2&hand=base|clumsy&night=7&export=1&rev=0|1&theme=night
 * rev = 그림 판(C14b): 없으면 카드에 판 번호를 싣지 않는다(빌드 1 카드 = 판 0, 새 모티프 = 판 1)
 * export=1이면 공유 이미지 함수(renderDreamCardImage)의 결과 PNG를 그대로 보여 주고 window.__dreamPng에 base64를 둔다.
 */
export function DreamCardPreview() {
  const q = useMemo(() => new URLSearchParams(Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.search : ''), []);
  const { width: vw, height: vh } = useWindowDimensions();
  const motifId = q.get('motif') ?? 'center.moon';
  const seed = Number(q.get('seed') ?? 1);
  const t = (q.get('t') ?? 'b') as keyof typeof DREAM_TEMPERS;
  const aspect: DreamAspect = q.get('aspect') === '916' ? '9:16' : '4:5';
  const night = Number(q.get('night') ?? 7);
  const comp = q.get('comp');
  const rev = q.get('rev');
  const nightTheme = q.get('theme') === 'night';
  const exportMode = q.get('export') === '1';
  const temper = DREAM_TEMPERS[t] ?? DREAM_TEMPERS.b;
  const card: sim.DreamCard = useMemo(
    () => ({
      night,
      motifId,
      composition: (comp !== null ? Number(comp) % 3 : seed % 3) as 0 | 1 | 2,
      inkTone: temper.inkTone,
      flow: temper.flow,
      flowSeed: Math.imul(seed + 1, 2654435761) >>> 0,
      strokeRef: null,
      nightsMerged: 1,
      ...(rev !== null ? { artRev: Number(rev) } : {}),
    }),
    [night, motifId, comp, seed, temper, rev],
  );
  const strokes = useMemo(() => (q.get('hand') === 'clumsy' ? day7ClumsyRecords() : day7Records()).slice(0, Math.max(1, Math.min(7, night))), [q, night]);
  const labels: DreamCardLabels = cardLabels(card, morningLine({ kind: 'observation', axis: null, keys: [] }, card));
  const ratio = aspect === '9:16' ? 16 / 9 : 1.25;
  const width = Math.min(vw, vh / ratio);
  const fontsReady = useAppFonts();
  const [png, setPng] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!fontsReady) return;
    if (!exportMode) {
      const id = setTimeout(() => {
        (window as unknown as { __cardReady?: boolean }).__cardReady = true;
      }, 300);
      return () => clearTimeout(id);
    }
    let alive = true;
    renderDreamCardImage({ card, strokes, labels }, { aspect, width: 1080, theme: nightTheme ? 'night' : 'day' })
      .then((r) => {
        if (!alive) return;
        (window as unknown as { __dreamPng?: string }).__dreamPng = r.base64;
        setPng(r.base64);
      })
      .catch((e) => alive && setErr(String(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- labels는 card에서 매 렌더 새로 만드는 객체라 넣으면 매번 다시 인화한다(card가 바뀌면 labels도 바뀐다)
  }, [fontsReady, exportMode, card, strokes, aspect, nightTheme]);

  return (
    <View style={styles.root}>
      {exportMode ? (
        png ? (
          <Image source={{ uri: `data:image/png;base64,${png}` }} style={{ width, height: width * ratio }} />
        ) : (
          <Text style={styles.msg}>{err ?? tr('card.rendering')}</Text>
        )
      ) : !fontsReady ? null : (
        <DreamCard card={card} strokes={strokes} labels={labels} width={width} aspect={aspect} theme={nightTheme ? 'night' : 'day'} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0C101D', alignItems: 'center', justifyContent: 'center' },
  msg: { color: '#E9E2D2' },
});
