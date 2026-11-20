// /m 살아 있는 몽망이(architecture.md v2.2 3-5 '페이지' 2·3). 페이지 인라인 스크립트가 조건(WebGL2·절약 모드 아님·움직임 줄이기 아님·
// config webLive)을 다 본 뒤에만 이 파일을 붙인다. 하는 일: snap.json(공개 버킷) → core parsePublicSnapshot → CanvasKit 로드 →
// core 기하(핵 윤곽·극좌표 획·리본·눈)로 숨 쉬고 깜빡이며 톡 치면 흔들리는 몸을 그리고, 첫 프레임이 되면 포스터·영상 위로 페이드.
// 실패·시간 초과(5초)면 아무것도 바꾸지 않는다. 이름은 HTML 제목이 이미 보여 줘 여기서 DOM에 넣지 않는다(몸 아래 세로 이름은 아트 몫 —
// 넣게 되면 textContent로만, innerHTML 금지 — 정적 빌드 검사가 막는다). 통신은 snap.json·CanvasKit 두 곳뿐.
import {
  BODY_ASPECTS,
  buildRibbon,
  coreOutline,
  coreParams,
  coreRadius1,
  decodeSnapPoints,
  eyeCenters,
  eyeMix,
  eyeShapeCached,
  INK_TOKENS,
  PALETTE,
  parsePublicSnapshot,
  polarToLocal,
  type PublicSnapshot,
} from '@mong/core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- CanvasKit 타입 패키지를 들이지 않는다(번들 밖 전역 스크립트, 쓰는 API 몇 개뿐)
type CK = any;
declare const CanvasKitInit: (o: { locateFile: (f: string) => string }) => Promise<CK>;

const TIMEOUT_MS = 5000;
const CK_RE = /^\/w\/ck\/[0-9A-Za-z.]+\/$/;

interface Geo {
  body: number[];
  strokes: Array<{ positions: number[]; indices: number[]; color: string }>;
  eyes: { lx: number; rx: number; y: number };
}

/** 스냅숏 → 그릴 기하(W 단위, 핵 중심 원점). 앱 렌더와 같은 core 함수 */
export function geometryOf(snap: PublicSnapshot): Geo {
  const p = coreParams(BODY_ASPECTS[snap.born.shape]);
  const s = snap.coreScale / 1000;
  const ink = INK_TOKENS[snap.ink].day.strokeInk;
  const tone = [ink, PALETTE.day.inkMid, PALETTE.day.inkFaded, PALETTE.day.inkFaded];
  const ribbon = (b64: string, opts: { taper?: number; roundEnd?: boolean }, color: string) => {
    const polar = decodeSnapPoints(b64).map((q, i) => ({ theta: q.theta, d: q.d, r1: coreRadius1(q.theta, p), t: i * 16 }));
    const r = buildRibbon(polarToLocal(polar, s), opts);
    return { positions: r.positions, indices: r.indices, color };
  };
  return {
    body: coreOutline(s, 144, p),
    strokes: [
      ...snap.soak.map((k) => ribbon(k.pts, {}, PALETTE.day.inkFaded)),
      ...snap.strokes.map((k) => ribbon(k.pts, { taper: k.tp ? 1 : 0, roundEnd: k.base === 1 }, k.fixed ? ink : tone[k.st]!)),
    ],
    eyes: (() => {
      const e = eyeCenters(p);
      return { lx: e.lx * s, rx: e.rx * s, y: e.y * s };
    })(),
  };
}

function loadScript(src: string): Promise<void> {
  return new Promise((ok, no) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => ok();
    el.onerror = () => no(new Error('script'));
    document.head.appendChild(el);
  });
}

async function main(): Promise<void> {
  const me = document.currentScript as HTMLScriptElement | null;
  const ck = me?.getAttribute('data-ck') ?? '';
  const m = document.getElementById('m');
  const stage = m?.querySelector('.stage') as HTMLElement | null;
  const snapUrl = m?.getAttribute('data-snap');
  if (!stage || !snapUrl || !CK_RE.test(ck)) return;
  const deadline = Date.now() + TIMEOUT_MS;

  const res = await fetch(snapUrl, { credentials: 'omit', referrerPolicy: 'no-referrer' });
  const parsed = parsePublicSnapshot(await res.json());
  if (!parsed.ok) return;
  const geo = geometryOf(parsed.snap);
  await loadScript(`${ck}canvaskit.js`);
  const CK = await CanvasKitInit({ locateFile: (f) => ck + f });
  if (Date.now() > deadline) return;

  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(stage.clientWidth * dpr);
  canvas.height = Math.round(stage.clientHeight * dpr);
  canvas.setAttribute('aria-hidden', 'true');
  stage.appendChild(canvas);
  const surface = CK.MakeWebGLCanvasSurface(canvas) ?? CK.MakeSWCanvasSurface(canvas);
  if (!surface) return;

  const paint = new CK.Paint();
  paint.setAntiAlias(true);
  // CanvasKit 0.41: Path는 불변, 만들기는 PathBuilder → detachAndDelete
  const path = (flat: readonly number[]) => {
    const b = new CK.PathBuilder();
    b.moveTo(flat[0], flat[1]);
    for (let i = 2; i < flat.length; i += 2) b.lineTo(flat[i], flat[i + 1]);
    b.close();
    return b.detachAndDelete();
  };
  const bodyPath = path(geo.body);
  const strokeVerts = geo.strokes.map((st) => ({
    v: CK.MakeVertices(CK.VertexMode.Triangles, st.positions, null, null, st.indices),
    c: CK.parseColorString(st.color),
  }));
  const bg = CK.parseColorString(PALETTE.day.bg);
  const bodyColor = CK.parseColorString(PALETTE.day.body);
  const eyeColor = CK.parseColorString(PALETTE.day.eye);
  const open = eyeShapeCached('open');
  let wobble = 0;
  canvas.addEventListener('pointerdown', () => {
    wobble = 1;
  });

  const t0 = performance.now();
  let first = true;
  const frame = (c: CK) => {
    const t = (performance.now() - t0) / 1000;
    const unit = canvas.width / 3.2;
    const breath = 1 + 0.018 * Math.sin((t * 2 * Math.PI) / 3.4);
    wobble *= 0.94;
    c.clear(bg);
    c.save();
    c.translate(canvas.width / 2, canvas.height * 0.56);
    c.scale(unit, unit * breath);
    c.rotate(Math.sin(t * 18) * wobble * 4, 0, 0.5);
    paint.setStyle(CK.PaintStyle.Fill);
    for (const s of strokeVerts) {
      paint.setColor(s.c);
      c.drawVertices(s.v, CK.BlendMode.Src, paint);
    }
    paint.setColor(bodyColor);
    c.drawPath(bodyPath, paint);
    const phase = t % 4.2;
    const blink = phase < 0.14 ? Math.sin((phase / 0.14) * Math.PI) : 0;
    const eye = eyeMix(open, open, 0, blink);
    paint.setColor(eyeColor);
    for (const x of [geo.eyes.lx, geo.eyes.rx]) {
      const pts = eye.map((v, i) => (i % 2 ? v + geo.eyes.y : v + x));
      const ep = path(pts);
      c.drawPath(ep, paint);
      ep.delete();
    }
    c.restore();
    if (first) {
      first = false;
      requestAnimationFrame(() => canvas.classList.add('on'));
    }
    surface.requestAnimationFrame(frame);
  };
  surface.requestAnimationFrame(frame);
}

void main().catch(() => undefined);
