// A7 눈 소실 결함 재현(GPU): CanvasKit WebGL에서 '경로'에 건 블러 마스크 필터의 장치 sigma를 바꿔 가며 눈 구멍이 남는지 잰다.
// 결과(11-20, Chromium headless ANGLE): 장치 sigma ≤ 0.32px → 경로가 통째로 안 그려짐(dstOut·srcOver 모두), ≥ 0.34px → 정상.
// 해석적 원(drawCircle)은 모든 sigma에서 정상, CPU 래스터도 정상 → 몸 폭 22pt·2x의 눈(σ 0.006W = 0.26px)만 사라졌다.
// 사용: node scripts/a7-gpu-blur-probe.mjs   (포트 안 씀, file://, 끝나면 브라우저 종료)
import { chromium } from 'playwright';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ck = path.resolve('node_modules/canvaskit-wasm/bin/full');
const dir = await mkdtemp(path.join(tmpdir(), 'a7-gpu-'));
const html = `<!doctype html><body><canvas id="c" width="1200" height="320"></canvas>
<script src="file://${ck}/canvaskit.js"></script><script>
CanvasKitInit({ locateFile: (f) => 'file://${ck}/' + f }).then((CK) => {
  const surf = CK.MakeWebGLCanvasSurface('c');
  const cv = surf.getCanvas();
  cv.clear(CK.Color(239, 232, 218, 1));
  const devSig = [0.1, 0.2, 0.25, 0.28, 0.3, 0.32, 0.34, 0.36, 0.4, 0.5, 0.8];
  const kinds = [['path', 60], ['circle', 60], ['path', 30]];
  const out = [];
  kinds.forEach(([kind, w], r) => devSig.forEach((ds, c) => {
    const ox = 50 + c * 105, oy = 60 + r * 100;
    cv.save(); cv.translate(ox, oy); cv.scale(w, w); cv.saveLayer(null);
    const bp = new CK.Paint(); bp.setColor(CK.Color(26, 24, 22, 1)); bp.setAntiAlias(true);
    cv.drawCircle(0, 0, 0.5, bp);
    const ep = new CK.Paint(); ep.setAntiAlias(true); ep.setColor(CK.BLACK); ep.setBlendMode(CK.BlendMode.DstOut);
    ep.setMaskFilter(CK.MaskFilter.MakeBlur(CK.BlurStyle.Normal, ds / w, true));
    if (kind === 'circle') cv.drawCircle(-0.15, -0.02, 0.08, ep);
    else { const pb = new CK.PathBuilder(); for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2; const x = -0.15 + Math.cos(a) * 0.08, y = -0.02 + Math.sin(a) * 0.08; i ? pb.lineTo(x, y) : pb.moveTo(x, y); } pb.close(); cv.drawPath(pb.detach(), ep); }
    cv.restore(); cv.restore();
  }));
  surf.flush();
  kinds.forEach(([kind, w], r) => devSig.forEach((ds, c) => {
    const ox = 50 + c * 105, oy = 60 + r * 100;
    const px = cv.readPixels(Math.round(ox - 0.15 * w), Math.round(oy - 0.02 * w), { width: 1, height: 1, colorType: CK.ColorType.RGBA_8888, alphaType: CK.AlphaType.Unpremul, colorSpace: CK.ColorSpace.SRGB });
    out.push({ kind, wpx: w, deviceSigma: ds, eye: px[0] > 128 ? 'visible' : 'GONE' });
  }));
  window.__out = out;
});
</script>`;
const file = path.join(dir, 'probe.html');
await writeFile(file, html);
const b = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--allow-file-access-from-files'] });
const p = await b.newPage();
await p.goto(`file://${file}`);
await p.waitForFunction(() => window.__out, null, { timeout: 60000 });
const out = await p.evaluate(() => window.__out);
await p.screenshot({ path: 'docs/app/a7/gpu-blur-probe.png' });
await b.close();
console.table(out);
