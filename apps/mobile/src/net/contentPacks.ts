// 원격 콘텐츠 `content/v1.json`(매니페스트) + 모티프·사전 팩 로더(C11 — architecture 3-7-2·3-10, B4 보고 3절 7·8).
// - 매니페스트: signedDoc.ts(서명 필수 `verifyRemoteDocStrict`만·만료·되감기 막기·ETag·max-age) + 사전 팩 (언어, 판) 불변 —
//   이 기기가 본 적 있는 `lang-lexVer → sha256`(lexSeen)과 다른 값이 있으면(`lexImmutableViolations`) 그 매니페스트를 통째로 쓰지 않는다.
// - 팩 파일: 매니페스트 항목의 bytes·sha256(`sha256Hex`)과 맞을 때만 기기에 둔다. 틀리면 `cache: 'reload'`로 한 번만 다시 받는다
//   (기기 HTTP 캐시에 깨진 immutable 파일이 남지 않게). 모티프는 motifFileSchema, 사전은 머리 lexPackHeaderSchema·lexPackMatchesEntry.
// - 크래시 루프 탈출 중(escaping): 원격 모티프를 새로 내지 않고(번들 25 + 보름 3), 사전은 `pickLexPack(…, {escaping:true})` 고정 판만.
// - 이 모듈은 원격 플래그 `remoteMotifs`가 켜졌을 때만 refresh한다(net/index.ts). 지금 읽는 곳은 없다 — 꿈 풀·V5d 사전이 연결할 자리.
import type { KV } from '@mong/core';
import {
  CONFIG_TTL_MAX_SEC,
  contentManifestSchema,
  lexHashIndex,
  lexImmutableViolations,
  lexPackHeaderSchema,
  lexPackMatchesEntry,
  LEX_LANGS,
  motifFileSchema,
  pickLexPack,
  REMOTE_BUNDLE_FLOOR,
  sha256Hex,
  utf8Bytes,
  type ContentManifest,
  type LexLang,
  type LexPackEntry,
  type MotifFile,
  type RemotePublicKey,
} from '@mong/contract';
import { request, type FetchLike } from './http';
import { createSignedDoc } from './signedDoc';

export const CONTENT_KEYS = {
  cache: 'mong.net.content',
  floor: 'mong.net.contentFloor',
  /** 본 적 있는 사전 팩 `{ 'ko-3': sha256 }` — 영구 */
  lexSeen: 'mong.net.lexSeen',
  /** 검사를 통과한 팩 파일 본문(키 뒤에 sha256) */
  packPrefix: 'mong.net.pack.',
} as const;

/** 앱 번들 바닥 판(매니페스트 seq). 빌드 때 배포본 seq로 올린다 */
export const APP_CONTENT_FLOOR = 0;

export interface ContentPacksDeps {
  kv: KV;
  fetch: FetchLike;
  staticBase: string;
  keys: readonly RemotePublicKey[];
  appBuild: number;
  /** 앱에 든 사전 판(언어별) — 이보다 큰 원격 팩만 쓴다 */
  bundledLexVer: Readonly<Record<LexLang, number>>;
  now: () => number;
  /** 크래시 루프 탈출 중인가(remoteConfig.escaping) */
  escaping: () => boolean;
  bundleFloor?: number;
}

type MotifEntry = ContentManifest['motifs'][number];

export function createContentPacks(deps: ContentPacksDeps) {
  const { kv } = deps;

  function readSeen(): Record<string, string> {
    try {
      const o = JSON.parse(kv.getString(CONTENT_KEYS.lexSeen) ?? '{}') as unknown;
      return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, string>) : {};
    } catch {
      return {};
    }
  }

  const doc = createSignedDoc<ContentManifest>({
    kind: 'content/v1',
    url: deps.staticBase ? `${deps.staticBase}/content/v1.json` : '',
    kv,
    cacheKey: CONTENT_KEYS.cache,
    floorKey: CONTENT_KEYS.floor,
    keys: deps.keys,
    bundleFloor: deps.bundleFloor ?? Math.max(REMOTE_BUNDLE_FLOOR['content/v1'], APP_CONTENT_FLOOR),
    fetch: deps.fetch,
    now: deps.now,
    parse: (raw) => {
      const m = contentManifestSchema.safeParse(raw);
      return m.success ? m.data : null;
    },
    accept: (m) => lexImmutableViolations(readSeen(), m).length === 0,
  });

  const packKey = (sha: string) => `${CONTENT_KEYS.packPrefix}${sha}`;
  function stored(sha: string): string | null {
    try {
      return kv.getString(packKey(sha)) ?? null;
    } catch {
      return null;
    }
  }

  const usableMotif = (m: ContentManifest, e: MotifEntry) => e.minAppBuild <= deps.appBuild && !m.revoked.includes(e.id);

  /** 기기에 둘 팩 목록(모티프 + 평소·탈출 사전 판) */
  function wanted(m: ContentManifest): Array<{ sha: string; url: string; bytes: number; ok: (text: string) => boolean }> {
    const out: Array<{ sha: string; url: string; bytes: number; ok: (text: string) => boolean }> = [];
    for (const e of m.motifs) {
      if (!usableMotif(m, e)) continue;
      out.push({ sha: e.sha256, url: e.url, bytes: e.bytes, ok: (t) => motifOk(t, e.id) });
    }
    const lex = new Map<string, LexPackEntry>();
    for (const lang of LEX_LANGS) {
      for (const escaping of [false, true]) {
        const e = pickLexPack(m, lang, { appBuild: deps.appBuild, bundledLexVer: deps.bundledLexVer[lang], escaping });
        if (e) lex.set(e.sha256, e);
      }
    }
    for (const e of lex.values()) out.push({ sha: e.sha256, url: e.url, bytes: e.bytes, ok: (t) => lexOk(t, e) });
    return out;
  }

  function parseMotif(text: string): MotifFile | null {
    try {
      const r = motifFileSchema.safeParse(JSON.parse(text));
      return r.success ? r.data : null;
    } catch {
      return null;
    }
  }
  function motifOk(text: string, id: string): boolean {
    return parseMotif(text)?.id === id;
  }
  function lexOk(text: string, e: LexPackEntry): boolean {
    try {
      const h = lexPackHeaderSchema.safeParse(JSON.parse(text));
      return h.success && lexPackMatchesEntry(h.data, e);
    } catch {
      return false;
    }
  }

  const intact = (text: string, sha: string, bytes: number) => utf8Bytes(text).length === bytes && sha256Hex(text) === sha;

  /** 팩 하나 받기: 해시가 틀리면 cache: 'reload'로 한 번만 다시 */
  async function fetchPack(p: { sha: string; url: string; bytes: number; ok: (t: string) => boolean }): Promise<void> {
    if (stored(p.sha) !== null) return;
    for (const cache of [undefined, 'reload'] as const) {
      const r = await request(deps.fetch, `${deps.staticBase}${p.url}`, cache ? { cache } : {});
      if (r.kind !== 'ok') return; // 못 받음 — 다음 refresh에
      if (!intact(r.body, p.sha, p.bytes)) continue;
      if (!p.ok(r.body)) return; // 해시는 맞는데 모양이 틀림 = 배포 실수 — 다시 받아도 같다
      try {
        kv.set(packKey(p.sha), r.body);
      } catch {
        /* 저장 실패 — 다음에 다시 받는다 */
      }
      return;
    }
  }

  let motifMemo: { seq: number; list: MotifFile[] } | null = null;

  return {
    /** 매니페스트를 (때가 되면) 받고, 쓸 팩을 받아 둔다. 실패해도 던지지 않는다 */
    async refresh(opts: { foreground?: boolean; force?: boolean } = {}): Promise<void> {
      const r = await doc.refresh({ ttlSec: CONFIG_TTL_MAX_SEC, ...opts });
      const cur = doc.current();
      if (!cur) return;
      if (r === 'updated') {
        try {
          kv.set(CONTENT_KEYS.lexSeen, JSON.stringify({ ...readSeen(), ...lexHashIndex(cur.doc) }));
        } catch {
          /* 다음 받기 때 다시 */
        }
        motifMemo = null;
      }
      for (const p of wanted(cur.doc)) await fetchPack(p);
      motifMemo = null;
    },

    /** 풀에 넣을 원격 모티프(검사를 통과해 기기에 있는 것만). 탈출 중·매니페스트 없음(만료)이면 [] */
    motifs(): MotifFile[] {
      if (deps.escaping()) return [];
      const cur = doc.current();
      if (!cur) return [];
      if (motifMemo?.seq === cur.version) return motifMemo.list;
      const list: MotifFile[] = [];
      for (const e of cur.doc.motifs) {
        if (!usableMotif(cur.doc, e)) continue;
        const text = stored(e.sha256);
        const m = text === null ? null : parseMotif(text);
        if (m && m.id === e.id) list.push(m);
      }
      motifMemo = { seq: cur.version, list };
      return list;
    },

    /** 이 언어에서 쓸 원격 사전 팩(기기에 있는 것만). null = 번들 사전 */
    lexPack(lang: LexLang): { entry: LexPackEntry; text: string } | null {
      const cur = doc.current();
      if (!cur) return null;
      const e = pickLexPack(cur.doc, lang, { appBuild: deps.appBuild, bundledLexVer: deps.bundledLexVer[lang], escaping: deps.escaping() });
      const text = e ? stored(e.sha256) : null;
      return e && text !== null ? { entry: e, text } : null;
    },
  };
}
