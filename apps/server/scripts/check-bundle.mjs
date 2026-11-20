// 번들 검사(B1 리뷰 I6 → CI 승격). 서버는 워크스페이스 패키지(@mong/core·@mong/contract)를 TS 원본째 번들에 넣는다(빌드 없음).
//  ① dist의 어떤 파일도 런타임에 '@mong/core'·'@mong/contract'를 import/require하지 않는다(번들 누락이면 운영 이미지에서만 깨진다)
//  ② core에 런타임 dependencies가 없다(생기면 서버 package.json에 없어 번들/누락 어느 쪽인지 검사가 없다 → 방식 재검토)
//  ③ contract의 런타임 dependencies는 서버 dependencies에 **같은 버전**으로 있어야 한다(번들 밖 외부 모듈로 남으므로 — 지금은 zod 하나)
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const files = readdirSync(dist).filter((f) => f.endsWith('.js'));
const bad = files.filter((f) => /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\(\s*)['"]@mong\/(?:core|contract)/.test(readFileSync(join(dist, f), 'utf8')));
const core = readJson('../../../packages/core/package.json');
const contract = readJson('../../../packages/contract/package.json');
const server = readJson('../package.json');
const coreDeps = Object.keys(core.dependencies ?? {});
const contractMismatch = Object.entries(contract.dependencies ?? {}).filter(([k, v]) => server.dependencies?.[k] !== v);
const errors = [];
if (bad.length) errors.push(`dist가 워크스페이스 패키지를 런타임에 import한다: ${bad.join(', ')}`);
if (coreDeps.length) errors.push(`@mong/core에 런타임 dependencies가 생겼다(${coreDeps.join(', ')}) — 서버 번들 방식 재검토`);
if (contractMismatch.length) {
  errors.push(`@mong/contract 의존성이 서버 dependencies와 다르다: ${contractMismatch.map(([k, v]) => `${k}@${v}(서버 ${server.dependencies?.[k] ?? '없음'})`).join(', ')}`);
}
for (const e of errors) console.error(`::error::${e}`);
if (errors.length) process.exit(1);
console.log(`번들 검사 통과: dist ${files.length}개 파일, @mong/core·@mong/contract import 0건, core 런타임 의존성 0개, contract 의존성 서버와 일치`);
