// 원격 문서 서명 CLI(B4 — architecture.md 3-7-2). 오너 노트북에서만 돈다. 서버·DB·네트워크를 쓰지 않는다.
//   pnpm --filter server build
//   node apps/server/dist/remote-cli.js keygen --kid prod-1 --out <저장소 밖 폴더>      → prod-1.private.pem(0600) + prod-1.public.json({kid,n,e}: 앱 번들에 넣는 값)
//   node apps/server/dist/remote-cli.js sign   --kind config/v1 --in apps/web-static/src/config/v1.json --key <저장소 밖 개인키> --kid prod-1
//        [--prev <지난 배포본>] [--ttl-days 14] [--out <파일>]
//        → expiresAt = 지금 + ttl(기본 14일, 최대 30일)을 넣고 서명. --prev가 있으면 판(config v·매니페스트 seq)이 더 커야 하고,
//          매니페스트는 같은 (언어, 판) 사전 팩의 sha256이 바뀌면 거부(B4 리뷰 M5·L5). 주 1회 판을 올려 다시 서명한다(만료 전).
//   node apps/server/dist/remote-cli.js verify --kind content/v1 --in <파일> --pub <공개키 json>
// sign은 strict 스키마(config: remoteConfigStrictSchema, content: contentManifestSchema)를 통과한 문서만 서명하고, 만든 서명을
// 계약의 순수 JS 검사기(앱과 같은 코드)로 되검사한다. 개인키가 저장소 안에 있으면(심볼릭 링크 포함) 거부한다(ota-cli와 같은 규칙).
// 서명 뒤 문서를 고치면(한 글자라도) 서명이 깨진다 — 고칠 때마다 다시 sign. 판 번호(config `v`·매니페스트 `seq`)는 앱이 되감기를 막으므로 늘 올린다.
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  contentManifestSchema,
  lexHashIndex,
  lexImmutableViolations,
  REMOTE_DEFAULT_LIFETIME_DAYS,
  REMOTE_MAX_LIFETIME_DAYS,
  REMOTE_DOC_KINDS,
  REMOTE_KID_RE,
  remoteConfigStrictSchema,
  remotePublicKeySchema,
  verifyRemoteDoc,
  type RemoteDocKind,
} from '@mong/contract';
import { insideRepo } from '../ota/publish';
import { generateRemoteKey, signRemoteDoc } from './remote-sign';

export interface CliIo {
  log: (s: string) => void;
  err: (s: string) => void;
}
const HELP = '사용: remote-cli <keygen|sign|verify> [옵션] — 머리 주석 참고';

function repoRoot(): string {
  let d = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(join(d, 'pnpm-workspace.yaml'))) return d;
    const up = dirname(d);
    if (up === d) throw new Error('저장소 뿌리를 찾지 못했다(CLI는 저장소 안에서 실행한다)');
    d = up;
  }
}

const STRICT = { 'config/v1': remoteConfigStrictSchema, 'content/v1': contentManifestSchema } as const;

/** 종료 코드: 0 성공, 1 실패, 2 사용법 */
export async function runRemoteCli(argv: string[], io: CliIo): Promise<number> {
  const [cmd, ...rest] = argv;
  if (cmd !== 'keygen' && cmd !== 'sign' && cmd !== 'verify') {
    io.err(HELP);
    return 2;
  }
  const { values: v } = parseArgs({
    args: rest,
    options: {
      kid: { type: 'string' },
      out: { type: 'string' },
      kind: { type: 'string' },
      in: { type: 'string' },
      key: { type: 'string' },
      pub: { type: 'string' },
      prev: { type: 'string' },
      'ttl-days': { type: 'string' },
    },
    strict: true,
  });
  const fail = (msg: string) => {
    io.err(`remote-cli: ${msg}`);
    return 1;
  };
  try {
    if (cmd === 'keygen') {
      if (!v.kid || !REMOTE_KID_RE.test(v.kid)) return fail('--kid(소문자·숫자·하이픈 1~32자)가 필요하다');
      if (!v.out) return fail('--out <저장소 밖 폴더>가 필요하다');
      if (insideRepo(v.out, repoRoot())) return fail('개인키를 저장소 안에 만들지 않는다 — 저장소 밖 폴더를 고른다');
      mkdirSync(v.out, { recursive: true });
      // 만든 뒤 실제 경로로 다시 본다(저장소 안을 가리키는 링크 아래의 새 폴더 — 리뷰 L4)
      if (insideRepo(realpathSync(v.out), repoRoot())) return fail('개인키를 저장소 안에 만들지 않는다(링크를 따라가면 저장소 안이다)');
      const priv = join(v.out, `${v.kid}.private.pem`);
      if (existsSync(priv)) return fail(`이미 있다: ${priv}`);
      const k = generateRemoteKey(v.kid);
      writeFileSync(priv, k.privateKeyPem, { mode: 0o600 });
      chmodSync(priv, 0o600);
      writeFileSync(join(v.out, `${v.kid}.public.json`), `${JSON.stringify(k.publicKey)}\n`);
      io.log(`키 만듦: ${priv}(오너 보관 — 비밀번호 관리자 + 오프라인 사본 1), 공개키 ${v.kid}.public.json → 앱 번들의 원격 공개키 목록에`);
      return 0;
    }
    const kind = v.kind as RemoteDocKind;
    if (!(REMOTE_DOC_KINDS as readonly string[]).includes(kind)) return fail(`--kind는 ${REMOTE_DOC_KINDS.join('|')}`);
    if (!v.in) return fail('--in <문서 파일>이 필요하다');
    const doc = JSON.parse(readFileSync(v.in, 'utf8')) as unknown;
    const r = STRICT[kind].safeParse(doc);
    if (!r.success) return fail(`스키마 실패: ${r.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    if (cmd === 'sign') {
      if (!v.key || !v.kid) return fail('--key <저장소 밖 개인키>와 --kid가 필요하다');
      if (!REMOTE_KID_RE.test(v.kid)) return fail('--kid 모양이 틀리다');
      if (insideRepo(realpathSync(v.key), repoRoot())) return fail('개인키가 저장소 안에 있다(심볼릭 링크 포함) — 저장소 밖으로 옮긴다');
      if ((statSync(v.key).mode & 0o077) !== 0) io.err(`remote-cli: 경고 — 개인키 권한이 0600이 아니다(${(statSync(v.key).mode & 0o777).toString(8)}): chmod 600`);
      const ttl = v['ttl-days'] === undefined ? REMOTE_DEFAULT_LIFETIME_DAYS : Number(v['ttl-days']);
      if (!Number.isInteger(ttl) || ttl < 1 || ttl > REMOTE_MAX_LIFETIME_DAYS) return fail(`--ttl-days는 1~${REMOTE_MAX_LIFETIME_DAYS}`);
      const verOf = (d: Record<string, unknown>) => (kind === 'config/v1' ? d.v : d.seq) as number;
      if (v.prev) {
        const prevRaw = JSON.parse(readFileSync(v.prev, 'utf8')) as Record<string, unknown>;
        const pr = STRICT[kind].safeParse(prevRaw);
        if (!pr.success) return fail('--prev 문서가 스키마를 통과하지 못한다');
        if (!(verOf(doc as Record<string, unknown>) > verOf(prevRaw))) return fail(`판이 --prev(${verOf(prevRaw)})보다 커야 한다(앱이 같은·작은 판을 바꿔 끼우지 못하게)`);
        if (kind === 'content/v1') {
          const bad = lexImmutableViolations(lexHashIndex(pr.data as never), r.data as never);
          if (bad.length) return fail(`한 번 낸 사전 팩의 내용이 바뀌었다(${bad.join(', ')}) — 판을 올린다`);
        }
      } else {
        io.err('remote-cli: 경고 — --prev 없이 서명(판 증가·사전 팩 불변을 확인하지 않음). 첫 배포가 아니면 지난 배포본을 넘긴다');
      }
      const expiresAt = new Date(Date.now() + ttl * 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      const signed = signRemoteDoc(kind, { ...(doc as Record<string, unknown>), expiresAt }, { kid: v.kid, privateKeyPem: readFileSync(v.key, 'utf8') });
      const out = v.out ?? v.in;
      writeFileSync(out, `${JSON.stringify(signed, null, 2)}\n`);
      io.log(`서명함: ${out} (${kind}, kid ${v.kid}, 만료 ${expiresAt} — 그 전에 판을 올려 다시 서명)`);
      return 0;
    }
    if (!v.pub) return fail('--pub <공개키 json>이 필요하다');
    const pub = remotePublicKeySchema.parse(JSON.parse(readFileSync(v.pub, 'utf8')));
    const res = verifyRemoteDoc(kind, doc, [pub]);
    if (res !== 'ok') return fail(`서명 검사 실패: ${res}`);
    io.log(`서명 맞음: ${v.in} (${kind}, kid ${pub.kid})`);
    return 0;
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

/** 직접 실행할 때만(시험이 import하면 돌지 않는다) */
function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (isMain()) {
  void runRemoteCli(process.argv.slice(2), { log: (s) => process.stdout.write(`${s}\n`), err: (s) => process.stderr.write(`${s}\n`) }).then((code) => {
    process.exitCode = code;
  });
}
