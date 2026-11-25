// 시험 공용 준비물: 처리방침 사본(테스터판 보호책임자 칸을 채운 것 / 출시 준비가 끝난 정본), 원격 문서 서명용 시험 키.
import { generateKeyPairSync, sign } from 'node:crypto';
import { cpSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { remoteSigningInput } from '@mong/contract';
import { ROOT } from '../scripts/build.mjs';

export const DOCS = join(ROOT, '../../docs/release');
/** 테스터판(빌드 2) 보호책임자 칸 — 오너가 상호를 채우기 전 정본의 글자 그대로 */
export const OFFICER_SLOT = { ko: '[성명 또는 상호 — 오너 기입]', en: '[Name or business name — owner to fill]' };
export const OFFICER = '시험상호';

/** docs/release의 처리방침 네 파일을 dir로 복사하고, 테스터판 보호책임자 칸을 채운다(W7 성공 경로 = '기입한 사본') */
export function filledDocs(dir, officer = OFFICER) {
  for (const f of readdirSync(DOCS).filter((n) => /^privacy-policy(-tester)?\.(ko|en)\.md$/.test(n))) cpSync(join(DOCS, f), join(dir, f));
  for (const l of ['ko', 'en']) {
    const p = join(dir, `privacy-policy-tester.${l}.md`);
    const md = readFileSync(p, 'utf8');
    if (!md.includes(OFFICER_SLOT[l])) throw new Error(`시험 준비: 테스터판 ${l}에 보호책임자 칸이 없다`);
    writeFileSync(p, md.replace(OFFICER_SLOT[l], officer));
  }
  return dir;
}

/** 내부 메모·기입 칸·작업 메모를 걷어 낸 '출시 준비가 끝난' 정본 사본(출시 모드 성공 경로 시험용). 체크리스트 상자는 그대로 둔다 */
export function cleanDocs(dir, { blankInBox = false } = {}) {
  filledDocs(dir);
  for (const l of ['ko', 'en']) {
    let md = readFileSync(join(DOCS, `privacy-policy.${l}.md`), 'utf8');
    if (blankInBox) md = md.replace(/^(> \| K1 \|.*)$/m, '\n$1'); // 변이 M4: 상자 안 빈 줄
    const lines = md.split('\n');
    const boxStart = lines.findIndex((x) => /게시 전 삭제|Remove before publishing/.test(x));
    let boxEnd = boxStart + 1;
    while (boxEnd < lines.length && (/^>/.test(lines[boxEnd]) || !lines[boxEnd].trim())) boxEnd++;
    const clean = (t) =>
      t
        .replace(/\s*\[[^\]\n]+\]/g, '')
        .replace(/초안|draft|법률 검토|확인 필요|도입 시 추가|독립 리뷰|independent review|legal first-pass review|legal review|P1~P19|P1–P19|To verify/gi, '');
    const out = [...lines.slice(0, boxStart).map(clean), ...lines.slice(boxStart, boxEnd), ...lines.slice(boxEnd).map(clean)].join('\n');
    writeFileSync(join(dir, `privacy-policy.${l}.md`), out);
  }
  return dir;
}

const DAY = 86_400_000;
/** 시험 키(2048비트 RS256). 만들기가 느려 한 번만 */
let keyMemo;
export function testKey() {
  if (!keyMemo) {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = publicKey.export({ format: 'jwk' });
    keyMemo = { pub: { kid: 'test-1', n: jwk.n, e: jwk.e }, privateKey };
  }
  return keyMemo;
}
export const isoSec = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** 원격 문서에 expiresAt을 넣고 시험 키로 서명(remote-cli sign과 같은 원문). days: null이면 expiresAt 없이 */
export function signDoc(kind, doc, { days = 14, now = Date.now(), key = testKey() } = {}) {
  const body = { ...doc, expiresAt: isoSec(now + days * DAY) };
  if (days === null) delete body.expiresAt; // 만료 없이 서명(no_expiry 시험)
  delete body.sig;
  const value = sign('sha256', Buffer.from(remoteSigningInput(kind, body), 'utf8'), key.privateKey).toString('base64url');
  return { ...body, sig: { alg: 'RS256', kid: key.pub.kid, value } };
}

/**
 * src를 dir로 복사하고 config/v1.json·content/v1.json을 서명한다. edit(kind, doc)로 서명 **전에** 문서를 고칠 수 있다.
 * @returns {string} dir
 */
export function signedSrc(dir, { days = 14, now = Date.now(), edit } = {}) {
  cpSync(join(ROOT, 'src'), dir, { recursive: true });
  for (const [rel, kind] of [['config/v1.json', 'config/v1'], ['content/v1.json', 'content/v1']]) {
    const p = join(dir, rel);
    let doc = JSON.parse(readFileSync(p, 'utf8'));
    if (edit) doc = edit(kind, doc) ?? doc;
    writeFileSync(p, JSON.stringify(signDoc(kind, doc, { days, now }), null, 2) + '\n');
  }
  return dir;
}

/** 공개키 목록 파일(빌드 설정의 자리 remote-public-keys.json과 같은 모양) */
export function keysFile(dir, keys = [testKey().pub]) {
  const p = join(dir, 'remote-public-keys.json');
  writeFileSync(p, JSON.stringify({ keys }));
  return p;
}
