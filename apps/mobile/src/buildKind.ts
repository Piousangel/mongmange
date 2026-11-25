// 이 바이너리가 어떤 빌드인가(빌드 때 정해지는 값). 내부 시험 APK(eas.json `internal-test`)는 plugins/withInternalTest.js가
// app config `expo.extra.internalTest = true`(상수 — 빌드마다 다른 값은 fingerprint를 갈라 EAS가 멈춘다)를 넣고, 앱은 expo-constants로 읽는다.
// production·preview·development 바이너리에는 이 값이 없다 → false(안전 쪽). 시험: test/internal-test.test.ts.
// 시험판에서 켜는 것은 **새 컨셉 v3 화면과 그 개발 메뉴('처음부터 다시'·'밤 넘기기'·'밤 ×7')만**이다. dreamContent 등 다른 시험 플래그는
// 개발 빌드에서도 기본 꺼짐이라 v3 화면에 필요 없고, 맡겨 두기(cloud)는 features.ts 규칙(v3가 켜지면 끔)을 그대로 따른다.
import { optionalModule } from "./lib/optionalModule";

export const INTERNAL_TEST_EXTRA_KEY = "internalTest";

/** app config extra → 내부 시험 바이너리인가(정확히 true만) */
export function readInternalTest(extra: unknown): boolean {
  return (
    !!extra &&
    typeof extra === "object" &&
    (extra as Record<string, unknown>)[INTERNAL_TEST_EXTRA_KEY] === true
  );
}

type ExpoConstants = {
  default?: { expoConfig?: { extra?: unknown } | null };
  expoConfig?: { extra?: unknown } | null;
};
const constants = optionalModule<ExpoConstants>(() =>
  require("expo-constants"),
);

export const INTERNAL_TEST: boolean = readInternalTest(
  (constants?.default ?? constants)?.expoConfig?.extra,
);

/** 새 컨셉 v3 기본값: 개발 빌드 또는 내부 시험판에서만 켜짐(운영·preview 꺼짐) */
export function conceptV3Default(b: {
  dev: boolean;
  internalTest: boolean;
}): boolean {
  return b.dev || b.internalTest;
}

/** 개발 메뉴: 개발 빌드 = 전부, 내부 시험판 = v3 단추만, 그 밖 = 없음 */
export function devMenuMode(b: {
  dev: boolean;
  internalTest: boolean;
}): "full" | "v3" | null {
  if (b.dev) return "full";
  return b.internalTest ? "v3" : null;
}
