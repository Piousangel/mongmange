// 바이너리가 갖춘 네이티브 조건(빌드 때 정해지는 값). 지금은 하나: 세션 저장소(MMKV `mong.session`)가 OS 백업에서 빠졌는가(architecture 3-3 ④).
// 주입: C10b 설정 플러그인이 백업 제외 규칙(iOS isExcludedFromBackup·Android dataExtractionRules/fullBackupContent)을 넣을 때
//   app config `expo.extra.mongSessionBackupExcluded = true`도 함께 쓴다 → 앱은 expo-constants(expoConfig.extra)로 읽는다.
//   플러그인이 config를 바꾸면 fingerprint(런타임 판)가 바뀌므로, 이 값이 true인 OTA는 같은 플러그인으로 만든 바이너리에만 내려간다.
// 값이 없거나 true가 아니면 false(안전 쪽) — 이때 원격 설정으로도 맡겨 두기(cloud)를 켤 수 없다(C11 리뷰 H1, net/remoteGate.ts).
import { optionalModule } from '../lib/optionalModule';

export const SESSION_BACKUP_EXCLUDED_EXTRA_KEY = 'mongSessionBackupExcluded';

/** app config extra → 세션 백업 제외 여부(정확히 true만) */
export function readSessionBackupExcluded(extra: unknown): boolean {
  return !!extra && typeof extra === 'object' && (extra as Record<string, unknown>)[SESSION_BACKUP_EXCLUDED_EXTRA_KEY] === true;
}

type ExpoConstants = { default?: { expoConfig?: { extra?: unknown } | null }; expoConfig?: { extra?: unknown } | null };
const constants = optionalModule<ExpoConstants>(() => require('expo-constants'));

export const SESSION_BACKUP_EXCLUDED: boolean = readSessionBackupExcluded((constants?.default ?? constants)?.expoConfig?.extra);
