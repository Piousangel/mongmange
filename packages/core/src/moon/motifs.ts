// 보름 모티프(dreams-30days v1.1 4-1·4-2·5-1·5-2). 번들 3 + 원격 팩 연결 자리 + 오프라인 대체(`월 mod 3`).
// 원격 팩의 매니페스트·파일 스키마 정본은 `@mong/contract`(zod). core는 의존성 0이라 **구조 타입만** 여기 두고,
// 둘이 맞는지는 apps/mobile/test/moon-contract.test.ts가 타입·런타임 양쪽으로 묶는다.

/** 원격 모티프 파일 스키마 1의 zone(contract `MOTIF_ZONES`와 같은 값) */
export type MotifFileZone = 'near-alone' | 'near-with' | 'far-alone' | 'far-with' | 'center' | 'moon';

export interface MotifTextData {
  /** 이름(`motif.*` 자리) ko ≤ 12·en ≤ 32 */
  readonly title: string;
  /** 결과 조각(`caption.line.*` 자리) ko ≤ 22·en ≤ 45 */
  readonly line: string;
  /** 접근성 장면(`scene.*` 자리) ko ≤ 45·en ≤ 100 */
  readonly scene: string;
}

export interface MotifPathData {
  readonly d: string;
  readonly w: number;
  readonly layer: 'ink' | 'gold' | 'wash';
}

export interface MotifShaderData {
  readonly bleed: number;
  readonly grain: number;
  readonly tone: 'day' | 'night';
}

/** 모티프 파일 스키마 1의 구조 타입(contract `MotifFile`이 여기에 대입돼야 한다) */
export interface MotifFileData {
  readonly schema: 1;
  readonly id: string;
  readonly zone: MotifFileZone;
  readonly family: string;
  readonly paths: readonly MotifPathData[];
  readonly shader: MotifShaderData;
  readonly text: { readonly ko?: MotifTextData; readonly en?: MotifTextData };
  readonly tags?: readonly string[];
}

/** 매니페스트 항목의 구조 타입(contract `ContentManifest['motifs'][number]`가 대입돼야 한다) */
export type ManifestMotifEntry =
  | { readonly kind: 'weekly'; readonly id: string; readonly from: string; readonly minAppBuild: number }
  | { readonly kind: 'moon'; readonly id: string; readonly month: number; readonly minAppBuild: number };

export interface ManifestLike {
  readonly motifs: readonly ManifestMotifEntry[];
  readonly revoked: readonly string[];
}

export type MoonMotifId =
  | 'moon-01'
  | 'moon-02'
  | 'moon-03'
  | 'moon-04'
  | 'moon-05'
  | 'moon-06'
  | 'moon-07'
  | 'moon-08'
  | 'moon-09'
  | 'moon-10'
  | 'moon-11'
  | 'moon-12';

/** 앱에 내장한 보름 모티프. 스키마 1 모양 그대로 + 내장 표시 */
export interface BundledMoonMotif extends MotifFileData {
  readonly id: MoonMotifId;
  readonly zone: 'moon';
  readonly family: 'moon';
  /** 이 모티프가 맡은 현지 월 */
  readonly month: number;
  /**
   * 형상 데이터가 아직 없다(아트 레인 C14 — 1-2 보름 4×3 시트 시험 뒤 형상 제작). 빈 `paths`는 자리표시이고,
   * 렌더는 그동안 기존 꿈 카드 형상으로 대신한다. 형상이 들어오면 이 표시를 지운다.
   */
  readonly placeholder: true;
  /** 정본에 없어 개발이 쓴 초안 문구(`'en.scene'` 등). 검수로 확정되면 지운다 — `moonMotifBlockers`가 막는다 */
  readonly draft?: readonly ('ko.title' | 'ko.line' | 'ko.scene' | 'en.title' | 'en.line' | 'en.scene')[];
}

/** 보름 카드인지는 motifId 접두로 안다(5-1 'DreamCard 그대로') */
export function isMoonMotifId(id: string): id is MoonMotifId {
  return /^moon-(0[1-9]|1[0-2])$/.test(id);
}

/** 현지 월 1..12 → 그 달의 보름 모티프 id `moon-MM` */
export function moonMotifIdOfMonth(month: number): MoonMotifId {
  const m = Math.min(12, Math.max(1, Math.trunc(month)));
  return `moon-${String(m).padStart(2, '0')}` as MoonMotifId;
}

/** 오프라인 대체 표(4-1): `월 mod 3` 0 → moon-12, 1 → moon-01, 2 → moon-02. 12·1·2월은 자기 자신 */
export function moonFallbackId(month: number): MoonMotifId {
  const r = Math.trunc(month) % 3;
  return r === 0 ? 'moon-12' : r === 1 ? 'moon-01' : 'moon-02';
}

const NIGHT_SHADER: MotifShaderData = { bleed: 0.25, grain: 0.15, tone: 'night' };

/**
 * 번들 보름 3(4-2 표 — 이름·장면·결과는 정본 문구 그대로). 첫 3개월분(12·1·2월) = 출시 전후 세 보름.
 * en `scene`은 정본 표에 없어 개발 초안이다 — `draft: ['en.scene']`(★ 원어민 검수·카피 레인 C14 대기).
 * 자리표시·초안이 남은 모티프는 제품 빌드에서 고르지도(`pickNightCard`) 그리지도(`buildDreamScene`) 않는다.
 */
export const BUNDLED_MOON_MOTIFS: readonly BundledMoonMotif[] = [
  {
    schema: 1,
    id: 'moon-12',
    zone: 'moon',
    family: 'moon',
    month: 12,
    paths: [],
    shader: NIGHT_SHADER,
    text: {
      ko: { title: '달길', line: '꿈속 물 위로 달길이 놓였어요', scene: '물 위로 금빛 달길이 몽망이 쪽으로 놓여요' },
      en: {
        title: 'the moon’s road',
        line: 'A road of moonlight lay on the water',
        scene: 'A golden road of moonlight stretches across the water toward Mongmangi',
      },
    },
    placeholder: true,
    draft: ['en.scene'],
  },
  {
    schema: 1,
    id: 'moon-01',
    zone: 'moon',
    family: 'moon',
    month: 1,
    paths: [],
    shader: NIGHT_SHADER,
    text: {
      ko: { title: '달빛 그네', line: '꿈속에서 달빛 그네를 탔어요', scene: '위에서 내려온 금빛 두 줄에 몽망이가 앉아 흔들려요' },
      en: {
        title: 'a swing of moonlight',
        line: 'It rode a swing of moonlight',
        scene: 'Mongmangi sits swaying on two golden strands that hang down from above',
      },
    },
    placeholder: true,
    draft: ['en.scene'],
  },
  {
    schema: 1,
    id: 'moon-02',
    zone: 'moon',
    family: 'moon',
    month: 2,
    paths: [],
    shader: NIGHT_SHADER,
    text: {
      ko: { title: '달 건지기', line: '꿈속 바가지에 달빛이 고였어요', scene: '물에 뜬 달빛이 박 바가지 안으로 고여 들고, 몽망이가 곁에서 봐요' },
      en: {
        title: 'scooping up the moon',
        line: 'Moonlight pooled in a gourd dipper',
        scene: 'Moonlight from the water pools into a gourd dipper while Mongmangi watches beside it',
      },
    },
    placeholder: true,
    draft: ['en.scene'],
  },
];

export function bundledMoonMotif(id: string): BundledMoonMotif | null {
  return BUNDLED_MOON_MOTIFS.find((m) => m.id === id) ?? null;
}

/**
 * 제품에 낼 수 없는 까닭(빈 배열 = 낼 수 있음): 형상 자리표시(`placeholder`·빈 `paths`)와 초안 문구(`draft`).
 * 번들 보름만 본다 — 원격 파일은 contract `motifFileSchema`(paths 1개 이상)를 통과한 것만 기기에 남는다.
 */
export function moonMotifBlockers(id: string): string[] {
  const m = bundledMoonMotif(id);
  if (!m) return [];
  const out: string[] = [];
  if (m.placeholder || m.paths.length === 0) out.push(`${m.id}: 형상 자리표시(C14)`);
  for (const d of m.draft ?? []) out.push(`${m.id}: ${d} 초안`);
  return out;
}

/** 이 빌드에서 그 보름 모티프를 고르거나 그릴 수 있는가. 개발 빌드는 자리표시도 허용(확인용) */
export function moonMotifUsable(id: string, dev: boolean): boolean {
  return dev || moonMotifBlockers(id).length === 0;
}

/**
 * 원격 팩 연결 자리: 매니페스트에서 **이 앱 빌드가 받을 수 있는** 보름 항목 id(revoked 제외, minAppBuild 통과).
 * 내려받기·sha256 검증·파싱(`motifFileSchema`)은 앱 net 층 몫이다 — 여기는 무엇을 받을지만 정한다.
 */
export function moonPackIds(manifest: ManifestLike, appBuild: number): MoonMotifId[] {
  const revoked = new Set(manifest.revoked);
  const out: MoonMotifId[] = [];
  for (const e of manifest.motifs) {
    if (e.kind !== 'moon' || !isMoonMotifId(e.id) || revoked.has(e.id) || e.minAppBuild > appBuild) continue;
    if (moonMotifIdOfMonth(e.month) !== e.id || out.includes(e.id)) continue;
    out.push(e.id);
  }
  return out;
}

/**
 * 그달 보름 모티프 id(4-1): 번들에 있으면 그것, 아니면 기기에 받아 둔 원격 파일, 둘 다 없으면 `월 mod 3` 대체.
 * @param month 당일 밤의 현지 월(`MoonNight.month`)
 * @param availableRemote 기기에 있고 파싱을 통과했으며 revoked가 아닌 원격 보름 id(앱 net 층이 넘긴다)
 */
export function resolveMoonMotifId(month: number, availableRemote: readonly string[]): MoonMotifId {
  const id = moonMotifIdOfMonth(month);
  if (bundledMoonMotif(id) || availableRemote.includes(id)) return id;
  return moonFallbackId(month);
}
