// 서버가 받아들이는 세이브 형식 버전 = 서버에 묶인 @mong/core의 값(번들 때 고정).
// /healthz가 내보내고, OTA 게시 전 ota-guard가 앱 core 값과 비교한다(architecture.md 3-11·6-4).
import { SCHEMA_VERSION, sim } from '@mong/core';

export const SAVE_SCHEMA = SCHEMA_VERSION;
export const SIM_SCHEMA = sim.SIM_SCHEMA_VERSION;
