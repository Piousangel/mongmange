// C7 이레 영상 프레임 캡처 보드(개발·웹 전용). 저장된 세이브(localStorage 'mong.save.main')로 프레임 몇 장을 실제 렌더 경로
// (prepare → renderIreFrame)로 그려 나란히 놓고, 결과를 window.__mongIreFrames에 남긴다(scripts/c7-capture.mjs).
//  ?screen=ire&kind=share|webLoop&f=0,18,60,…&w=360&nm=달무리&name=1   (nm = 이 보드에서만 그 이름을 지은 것으로 보기 — 세이브에는 쓰지 않음, name=1 = 이름 공개 켬 흉내 — ?ff=naming과 함께)
import { IRE_OUTPUTS, sim, type IreOutputKind } from '@mong/core';
import { useEffect, useState } from 'react';
import { Image, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { isOn } from '../features';
import { boot, getSnapshot } from '../game/store';
import type { DreamCardImage } from '../render/dreamCard/renderImage.types';
import { prepareIreLoop, prepareIreShare, type IrePrepared } from '../render/ireVideo/prepare';
import { renderIreFrame } from '../render/ireVideo/renderFrame';
import { ireStrings } from '../share/ireVideo';

function q(name: string, def: string): string {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return def;
  return new URLSearchParams(window.location.search).get(name) ?? def;
}

type Shot = DreamCardImage & { i: number; ms: number };

async function shoot(kind: IreOutputKind, frames: number[], width: number, nameVisible: boolean, nm: string): Promise<Shot[]> {
  boot();
  const saved = getSnapshot().state;
  if (!saved) return [];
  // 표시 전용: 순수 reduce로 복사본에만 이름을 얹는다(dispatch하면 이 브라우저의 진짜 세이브 이름이 바뀐다, C7 리뷰 L-2)
  const state = nm ? sim.reduce(saved, { type: 'setName', at: saved.clock.lastSimAt, text: nm }).state : saved;
  let p: IrePrepared;
  if (kind === 'webLoop') p = await prepareIreLoop({ state, width });
  else {
    const base = await prepareIreShare({ state, width, nameVisible: isOn('naming') && nameVisible, strings: { app: '' } });
    p = { ...base, strings: ireStrings(base.src, { label: isOn('temperamentLabel'), ink: isOn('inkChoice') }) };
  }
  const out: Shot[] = [];
  for (const i of frames) {
    const t0 = performance.now();
    const img = await renderIreFrame(p, i);
    out.push({ ...img, i, ms: Math.round(performance.now() - t0) });
  }
  return out;
}

export function IreFramesBoard() {
  const kind: IreOutputKind = q('kind', 'share') === 'webLoop' ? 'webLoop' : 'share';
  const width = Number(q('w', String(IRE_OUTPUTS[kind].width)));
  const list = q('f', '0,12,30,60,120,165,200,239');
  const name = q('name', '0') === '1';
  const nm = q('nm', '');
  const [shots, setShots] = useState<Shot[]>([]);
  useEffect(() => {
    let alive = true;
    const frames = list.split(',').map(Number).filter(Number.isFinite);
    shoot(kind, frames, width, name, nm)
      .then((s) => {
        if (!alive) return;
        (globalThis as { __mongIreFrames?: unknown }).__mongIreFrames = s.map(({ i, ms, width: w, height: h, base64 }) => ({ i, ms, w, h, base64 }));
        setShots(s);
      })
      .catch((e: unknown) => {
        console.error('[ire] 프레임 실패', e);
        (globalThis as { __mongIreFrames?: unknown }).__mongIreFrames = { error: String(e) };
      });
    return () => {
      alive = false;
    };
  }, [kind, width, list, name, nm]);
  const thumbW = 160;
  return (
    <ScrollView contentContainerStyle={styles.row} testID="ire-board">
      {shots.map((s) => (
        <View key={s.i} style={styles.cell}>
          <Image source={{ uri: `data:image/png;base64,${s.base64}` }} style={{ width: thumbW, height: (thumbW * s.height) / s.width }} />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', padding: 8, gap: 8, backgroundColor: '#ccc' },
  cell: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#888' },
});
