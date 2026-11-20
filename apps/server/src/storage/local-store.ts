// 로컬 파일 시스템 저장소(개발·시험·compose 전용). 운영 이미지에서는 STORAGE_DRIVER=local을 거부한다(env.ts).
// Supabase Storage의 동작을 흉내 낸다: 비공개 버킷 + 서명 업로드 URL(유형·크기 고정, 만료, 1회) + 버킷 상한(크기·MIME).
// 서명 업로드·공개 파일 읽기는 local-storage.controller.ts(이 드라이버일 때만 붙는다).
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { ALL_BUCKETS, OBJECT_KEY_RE, PREFIX_RE, STAGING_LIMITS, type Bucket, type ObjectInfo, type ObjectStore, type SignedUpload } from './object-store';

interface UploadGrant {
  bucket: Bucket;
  key: string;
  contentType: string;
  maxBytes: number;
  exp: number;
}

export class LocalObjectStore implements ObjectStore {
  readonly configured = true;
  readonly publicOrigin: string;
  private readonly secret = randomBytes(32);
  /** 쓴 토큰(1회성). 만료된 것은 쓸 때 지운다 */
  private readonly used = new Map<string, number>();

  constructor(
    private readonly root: string,
    /** 이 서버의 바깥 주소(서명 URL·공개 주소의 앞) */
    private readonly baseUrl: string,
    private readonly now: () => number = Date.now,
  ) {
    this.publicOrigin = new URL(baseUrl).origin;
  }

  private path(bucket: Bucket, key: string): string {
    if (!ALL_BUCKETS.includes(bucket)) throw new Error('모르는 버킷');
    if (!OBJECT_KEY_RE.test(key)) throw new Error('키 모양이 아니다');
    return join(this.root, bucket, ...key.split('/'));
  }

  async signUpload(bucket: Bucket, key: string, o: { contentType: string; maxBytes: number; ttlSec: number }): Promise<SignedUpload> {
    this.path(bucket, key);
    const g: UploadGrant = { bucket, key, contentType: o.contentType, maxBytes: o.maxBytes, exp: this.now() + o.ttlSec * 1000 };
    const body = Buffer.from(JSON.stringify(g)).toString('base64url');
    const token = `${body}.${this.sign(body)}`;
    return { token, signedUrl: `${this.baseUrl}/_local-storage/upload?token=${token}` };
  }

  /** 서명 업로드 받기: 토큰 검사 → 버킷 상한 → 유형·크기 → 1회. 실패 이유를 돌려준다(성공이면 null) */
  async acceptUpload(token: string, contentType: string | undefined, body: Uint8Array): Promise<string | null> {
    const [b, sig] = token.split('.');
    if (!b || !sig || !this.verify(b, sig)) return 'bad_token';
    const g = JSON.parse(Buffer.from(b, 'base64url').toString('utf8')) as UploadGrant;
    const now = this.now();
    for (const [t, exp] of this.used) if (exp < now) this.used.delete(t);
    if (g.exp < now) return 'expired';
    if (this.used.has(sig)) return 'used';
    if (g.bucket === 'page-staging') {
      if (body.length > STAGING_LIMITS.fileSizeLimit) return 'too_big';
      if (!STAGING_LIMITS.allowedMimeTypes.includes(contentType ?? '')) return 'mime';
    }
    if (contentType !== g.contentType) return 'mime';
    if (body.length > g.maxBytes) return 'too_big';
    this.used.set(sig, g.exp);
    await this.put(g.bucket, g.key, body, g.contentType);
    return null;
  }

  async put(bucket: Bucket, key: string, body: Uint8Array, contentType: string): Promise<void> {
    const p = this.path(bucket, key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body);
    await writeFile(`${p}.type`, contentType);
  }

  async stat(bucket: Bucket, key: string): Promise<ObjectInfo | null> {
    const p = this.path(bucket, key);
    try {
      const s = await stat(p);
      return { size: s.size, contentType: (await readFile(`${p}.type`, 'utf8')).trim() };
    } catch {
      return null;
    }
  }

  async readHead(bucket: Bucket, key: string, n: number): Promise<Uint8Array> {
    const f = await open(this.path(bucket, key), 'r');
    try {
      const buf = Buffer.alloc(n);
      const { bytesRead } = await f.read(buf, 0, n, 0);
      return new Uint8Array(buf.subarray(0, bytesRead));
    } finally {
      await f.close();
    }
  }

  async move(from: Bucket, to: Bucket, key: string): Promise<void> {
    const a = this.path(from, key);
    const b = this.path(to, key);
    await mkdir(dirname(b), { recursive: true });
    await rename(a, b);
    await rename(`${a}.type`, `${b}.type`);
  }

  async removePrefix(bucket: Bucket, prefix: string): Promise<void> {
    if (!PREFIX_RE.test(prefix)) throw new Error('prefix 모양이 아니다');
    await rm(join(this.root, bucket, prefix), { recursive: true, force: true });
  }

  async list(bucket: Bucket, prefix: string): Promise<string[]> {
    if (prefix && !PREFIX_RE.test(prefix)) throw new Error('prefix 모양이 아니다');
    const base = join(this.root, bucket);
    const out: string[] = [];
    const walk = async (d: string): Promise<void> => {
      let names: string[];
      try {
        names = await readdir(d);
      } catch {
        return;
      }
      for (const n of names) {
        const p = join(d, n);
        if ((await stat(p)).isDirectory()) await walk(p);
        else if (!n.endsWith('.type')) out.push(relative(base, p).split(sep).join('/'));
      }
    };
    await walk(prefix ? join(base, prefix) : base);
    return out.sort();
  }

  publicUrl(key: string): string {
    return `${this.baseUrl}/_local-storage/public/${key}`;
  }

  /** 공개 버킷 파일 읽기(로컬 공개 주소용) */
  async readPublic(key: string): Promise<{ body: Buffer; contentType: string } | null> {
    if (!OBJECT_KEY_RE.test(key)) return null;
    const p = this.path('public-pages', key);
    try {
      return { body: await readFile(p), contentType: (await readFile(`${p}.type`, 'utf8')).trim() };
    } catch {
      return null;
    }
  }

  private sign(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }
  private verify(body: string, sig: string): boolean {
    const want = Buffer.from(this.sign(body));
    const got = Buffer.from(sig);
    return want.length === got.length && timingSafeEqual(want, got);
  }
}
