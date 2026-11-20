// 번들 검사(B1 리뷰 I6 → CI 승격). 서버는 @mong/core를 TS 원본째 번들에 넣는다(core 빌드 없음).
//  ① dist의 어떤 파일도 런타임에 '@mong/core'를 import/require하지 않는다(번들 누락이면 운영 이미지에서만 깨진다)
//  ② core에 런타임 dependencies가 없다(생기면 서버 package.json에 없어 번들/누락 어느 쪽인지 검사가 없다 → 방식 재검토)
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const bad = readdirSync(dist)
  .filter((f) => f.endsWith('.js'))
  .filter((f) => /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\(\s*)['"]@mong\/core/.test(readFileSync(join(dist, f), 'utf8')));
const core = JSON.parse(readFileSync(new URL('../../../packages/core/package.json', import.meta.url), 'utf8'));
const deps = Object.keys(core.dependencies ?? {});
if (bad.length) console.error(`::error::dist가 @mong/core를 런타임에 import한다: ${bad.join(', ')}`);
if (deps.length) console.error(`::error::@mong/core에 런타임 dependencies가 생겼다(${deps.join(', ')}) — 서버 번들 방식 재검토`);
if (bad.length || deps.length) process.exit(1);
console.log(`번들 검사 통과: dist ${readdirSync(dist).filter((f) => f.endsWith('.js')).length}개 파일, @mong/core import 0건, core 런타임 의존성 0개`);
