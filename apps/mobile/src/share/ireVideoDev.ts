// 개발 메뉴 전용(12-05 기기 관문, docs/app/c7/device-gate.md): 웹 루프는 아직 앱 흐름에서 만들지 않으므로(링크 켜기 = C11·B3)
// 여기서 지금 세이브로 루프를 한 번 인코딩해 시간을 잰다. 파일 크기·검사·단계별 대기는 어댑터가 '[ire-video]' 줄로 남긴다.
import type { sim } from '@mong/core';
import { prepareIreLoop } from '../render/ireVideo/prepare';
import { encodeIreVideo, registeredIreEncoder } from './ireVideo';

export async function measureIreLoop(state: sim.State): Promise<string> {
  const enc = registeredIreEncoder();
  if (!enc) return 'loop: no encoder (module missing)';
  try {
    const t0 = Date.now();
    const p = await prepareIreLoop({ state });
    const t1 = Date.now();
    const { uri } = await encodeIreVideo(p, enc, new AbortController().signal);
    const msg = `loop: prepare ${t1 - t0}ms + encode ${Date.now() - t1}ms → ${uri}`;
    console.info(`[ire-video] ${msg}`);
    return msg;
  } catch (e) {
    console.warn('[ire-video] loop failed:', e);
    return `loop failed: ${String(e)}`;
  }
}
