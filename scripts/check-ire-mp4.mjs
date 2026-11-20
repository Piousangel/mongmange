// 실기기 이레 영상 산출물 검사(C10, 12-05 관문). 서버 커밋 검사(architecture 3-5-3 ③)와 같은 규칙 + 앱 계약(메타 0·공유판 소리 트랙·루프 600KB).
// 규칙 코드는 앱이 쓰는 것과 같은 파일(apps/mobile/src/share/ireMp4.ts)을 Node 타입 지우기로 그대로 불러 쓴다(Node 23.6+).
//
//   node scripts/check-ire-mp4.mjs <파일.mp4> [--kind share|webLoop] [--json]
//   adb exec-out run-as com.piousangel.mongmange cat cache/mong-share/loop.mp4 > /tmp/loop.mp4 && node scripts/check-ire-mp4.mjs /tmp/loop.mp4
//
// --kind를 빼면 파일 이름으로 정한다(loop.mp4 = webLoop, 그 밖 = share). 종료 코드 0 = 통과, 1 = 불합격, 2 = 사용법.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

// apps/mobile은 "type": "module"이 아니라 Node가 .ts를 ESM으로 다시 읽으며 경고를 낸다 — 검사 출력만 남긴다
process.removeAllListeners('warning');
const { checkIreMp4 } = await import('../apps/mobile/src/share/ireMp4.ts');

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const kindArg = args.includes('--kind') ? args[args.indexOf('--kind') + 1] : undefined;
if (!file || (kindArg && kindArg !== 'share' && kindArg !== 'webLoop')) {
  console.error('사용법: node scripts/check-ire-mp4.mjs <파일.mp4> [--kind share|webLoop] [--json]');
  process.exit(2);
}
const kind = kindArg ?? (basename(file) === 'loop.mp4' ? 'webLoop' : 'share');
const bytes = new Uint8Array(readFileSync(file));
const r = checkIreMp4(bytes, kind);

if (args.includes('--json')) {
  console.log(JSON.stringify({ file, kind, ...r }, null, 2));
} else {
  const i = r.info;
  console.log(`${file} (${kind})`);
  if (i) {
    console.log(`  크기 ${(i.fileSize / 1024).toFixed(1)}KB · 최상위 [${i.top.join(', ')}] · moov 끝 ${i.moovEnd}B · 길이 ${i.durationSec.toFixed(3)}초`);
    for (const t of i.tracks) console.log(`  트랙 ${t.handler} ${t.width}×${t.height} · ${t.durationSec.toFixed(3)}초`);
    if (i.metaBoxes.length || i.dated.length) console.log(`  메타: ${[...i.metaBoxes, ...i.dated.map((d) => `${d}(시각)`)].join(' ')}`);
  }
  console.log(r.ok ? '  합격' : `  불합격: ${r.reason} — ${r.detail}`);
}
process.exit(r.ok ? 0 : 1);
