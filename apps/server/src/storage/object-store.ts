// 파일 저장소 인터페이스(B3, architecture.md v2.2 2-4·3-5-3). 버킷 셋:
//  - page-staging(비공개): 앱이 서명 URL로만 올린다. commit 전 파일은 공개 주소가 없다(A4 리뷰 I10).
//  - public-pages(공개 읽기, 클라이언트 쓰기 없음): commit이 검사를 통과한 파일만 옮긴다. 판마다 새 경로(pageKey)라 immutable 캐시.
//  - quarantine(비공개): 신고 격리(B5).
//  - ota-assets(비공개, 서버가 읽어 내보냄): 자체 OTA 에셋(V21, docs/design/server-v1/ota-self-host.md). 키 = 내용 해시(SHA-256 base64url 43자)
//    + 선택 접미 `.br`·`.gz`(미리 압축한 판). 내용 주소라 한 번 쓰면 바뀌지 않는다. 사용자와 무관 — 링크 코드·pageKey 규칙 밖.
// 구현: LocalObjectStore(파일 시스템, 개발·시험·compose) / NoStore(설정 안 됨 — 링크 기능 503) / SupabaseObjectStore(운영, B6a supabase-store.ts).
// 키에 링크 코드를 넣지 않는다 — 경로는 pageKey(서버 난수 128비트)뿐이라 파일 주소로 코드를 거꾸로 찾을 수 없다.
import { randomBytes } from 'node:crypto';
import type { Readable } from 'node:stream';

export const BUCKETS = { staging: 'page-staging', public: 'public-pages', quarantine: 'quarantine', ota: 'ota-assets' } as const;
export type Bucket = (typeof BUCKETS)[keyof typeof BUCKETS];
export const ALL_BUCKETS: readonly Bucket[] = Object.values(BUCKETS);

/** 버킷 상한(Supabase 버킷 설정 file_size_limit·allowed_mime_types와 같은 값을 B6에서 건다 — 서명 업로드에도 걸리는지 확인 필요) */
export const STAGING_LIMITS = { fileSizeLimit: 600 * 1024, allowedMimeTypes: ['image/jpeg', 'video/mp4'] as readonly string[] };

export interface ObjectInfo {
  size: number;
  contentType: string;
}

export interface SignedUpload {
  signedUrl: string;
  token: string;
}

export interface ObjectStore {
  /** false면 링크 기능은 503 storage_unavailable, 삭제 대기열은 다음 시도로 미룬다 */
  readonly configured: boolean;
  /** 앱이 한 번 PUT할 서명 URL(유형·크기 고정, ttlSec 뒤 만료, 1회) */
  signUpload(bucket: Bucket, key: string, opts: { contentType: string; maxBytes: number; ttlSec: number }): Promise<SignedUpload>;
  /** 서버가 직접 쓰기(snap.json) */
  put(bucket: Bucket, key: string, body: Uint8Array, contentType: string): Promise<void>;
  stat(bucket: Bucket, key: string): Promise<ObjectInfo | null>;
  /** 파일 전체 읽기(게시 때 해시 검사). 없으면 null */
  read(bucket: Bucket, key: string): Promise<{ body: Uint8Array; contentType: string } | null>;
  /** 스트림 읽기(OTA 에셋 내보내기 — 메모리에 통째로 올리지 않는다, 리뷰 M5). 없으면 null */
  openRead(bucket: Bucket, key: string): Promise<{ stream: Readable; size: number; contentType: string } | null>;
  /** 앞 n바이트(Range 읽기). 파일이 더 짧으면 있는 만큼 */
  readHead(bucket: Bucket, key: string, n: number): Promise<Uint8Array>;
  /** 버킷 사이 옮기기(같은 키). 옮긴 뒤 원본은 없다 */
  move(from: Bucket, to: Bucket, key: string): Promise<void>;
  /** prefix/ 아래를 모두 지운다. 이미 없으면 성공 */
  removePrefix(bucket: Bucket, prefix: string): Promise<void>;
  /** 시험·운영 확인용 목록 */
  list(bucket: Bucket, prefix: string): Promise<string[]>;
  /** 공개 버킷 파일의 절대 주소(og:image·poster) */
  publicUrl(key: string): string;
  /** 공개 파일 출처(CSP img-src·media-src·connect-src) */
  readonly publicOrigin: string;
}

export class StorageNotConfigured extends Error {
  constructor() {
    super('Storage가 설정되지 않았다(STORAGE_DRIVER=none — 실제 연결은 B6)');
    this.name = 'StorageNotConfigured';
  }
}

/** 설정 안 됨: 모든 쓰기·읽기가 던진다(B2의 '삭제기 자리'와 같은 동작 — 대기열 행은 남아 다음에 지운다) */
export class NoStore implements ObjectStore {
  readonly configured = false;
  readonly publicOrigin = 'https://storage.invalid';
  private fail(): never {
    throw new StorageNotConfigured();
  }
  signUpload(): Promise<SignedUpload> {
    return Promise.reject(new StorageNotConfigured());
  }
  put(): Promise<void> {
    return Promise.reject(new StorageNotConfigured());
  }
  stat(): Promise<ObjectInfo | null> {
    return Promise.reject(new StorageNotConfigured());
  }
  read(): Promise<{ body: Uint8Array; contentType: string } | null> {
    return Promise.reject(new StorageNotConfigured());
  }
  openRead(): Promise<{ stream: Readable; size: number; contentType: string } | null> {
    return Promise.reject(new StorageNotConfigured());
  }
  readHead(): Promise<Uint8Array> {
    return Promise.reject(new StorageNotConfigured());
  }
  move(): Promise<void> {
    return Promise.reject(new StorageNotConfigured());
  }
  removePrefix(): Promise<void> {
    return Promise.reject(new StorageNotConfigured());
  }
  list(): Promise<string[]> {
    return Promise.reject(new StorageNotConfigured());
  }
  publicUrl(): string {
    return this.fail();
  }
}

/** Nest 주입 토큰 */
export const OBJECT_STORE = Symbol('OBJECT_STORE');

/**
 * 키 모양(서버가 만든 값만 — 경로 조작 막기). 파일 = `{storeKey 16진 32자}/{pageKey 22자}/{파일}`.
 * storeKey = 몽망이별 접두(public_pages.store_key) — 계정 삭제가 이 접두로 세 버킷을 통째로 지운다(B3 리뷰 I1 '접두 소거').
 */
export const STORE_KEY_RE = /^[0-9a-f]{32}$/;
export const PAGE_KEY_RE = /^[A-Za-z0-9_-]{22}$/;
/** removePrefix·list가 받는 접두: storeKey 하나 또는 storeKey/pageKey */
export const PREFIX_RE = /^[0-9a-f]{32}(?:\/[A-Za-z0-9_-]{22})?$/;
export const OBJECT_KEY_RE = /^[0-9a-f]{32}\/[A-Za-z0-9_-]{22}\/(?:poster\.jpg|og\.jpg|loop\.mp4|snap\.json)$/;
/** OTA 에셋 키: SHA-256 base64url(43자) + 선택 압축 접미. ota-assets 버킷에서만 쓴다 */
export const OTA_KEY_RE = /^[A-Za-z0-9_-]{43}(?:\.br|\.gz)?$/;
/** 버킷별 키 모양(ota-assets만 내용 해시 키, 나머지는 페이지 키) */
export function validObjectKey(bucket: Bucket, key: string): boolean {
  return bucket === BUCKETS.ota ? OTA_KEY_RE.test(key) : OBJECT_KEY_RE.test(key);
}
/** 서버 난수 pageKey(128비트). 코드에서 파생하지 않는다 — 파일 주소로 코드를 찾을 수 없게 */
export function newPageKey(): string {
  return randomBytes(16).toString('base64url');
}
/** 판 폴더 `{storeKey}/{pageKey}` */
export function pageDir(storeKey: string, pageKey: string): string {
  if (!STORE_KEY_RE.test(storeKey) || !PAGE_KEY_RE.test(pageKey)) throw new Error('저장소 키 모양이 아니다');
  return `${storeKey}/${pageKey}`;
}

/**
 * 공개 파일 캐시(B3 리뷰 M3): 처리방침 5·6절 '웹 캐시 최대 1시간'과 맞춘다. 판마다 새 경로라 immutable이 아니어도 낡은 판을
 * 보여 줄 일은 없고, 끄기·이름 가리기·삭제 뒤 브라우저·CDN에 남는 시간이 1시간을 넘지 않게 한다. Supabase 쪽 값은 B6에서 같은 값으로
 */
export const PUBLIC_FILE_CACHE = 'public, max-age=3600';

/**
 * 버킷 권한(정본 architecture 2-4 Storage 행, B6a): 공개 읽기는 public-pages 하나. 나머지는 비공개(서버의 서비스 롤만 읽고 쓴다).
 * 상한은 page-staging만(앱이 서명 URL로 직접 올리는 유일한 버킷). Supabase 드라이버의 checkBuckets()가 이 표와 실제 설정을 대조한다.
 * page-staging의 MIME에 application/json이 더 있는 까닭: Supabase 버킷 상한은 서비스 롤 업로드에도 걸려, 서버가 쓰는 snap.json이 막힌다
 * (정본 2-4 'JSON 없음'과 다름 — DECISIONS B6a). 앱 쪽은 그대로 막힌다: 서명은 키(og.jpg 등) 하나에 묶이고 snap.json 서명은 없으며,
 * commit이 유형 머리글·크기·JPEG/MP4 내용을 다시 본다(local 드라이버의 서명 업로드는 STAGING_LIMITS 그대로 json을 거부).
 */
export const BUCKET_POLICY: Readonly<Record<Bucket, { public: boolean; fileSizeLimit: number | null; allowedMimeTypes: readonly string[] | null }>> = {
  'page-staging': { public: false, fileSizeLimit: STAGING_LIMITS.fileSizeLimit, allowedMimeTypes: [...STAGING_LIMITS.allowedMimeTypes, 'application/json'] },
  'public-pages': { public: true, fileSizeLimit: null, allowedMimeTypes: null },
  quarantine: { public: false, fileSizeLimit: null, allowedMimeTypes: null },
  'ota-assets': { public: false, fileSizeLimit: null, allowedMimeTypes: null },
};
