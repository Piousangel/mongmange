// 이레 두루마리 영상 한 프레임의 그림(글 없음). 장면 값은 core `ireFrameAt`(결정적)에서만 오고, 여기서는 그리기만 한다.
// 몸 = 화면과 같은 Mongmangi(BodyFrame을 프레임 값으로 채움), 일곱 날 점 = 꿈 카드와 같은 장치, 카드 = 앨범 썸네일 캐시(thumbImage).
// 글(결 이름·꼬리표·앱 이름)은 플랫폼별 renderFrame(.web).tsx가 얹는다(웹 CanvasKit에는 한글 시스템 글꼴이 없다).
import { Circle, Fill, Group, Image as SkiaImage, Path, Rect, RoundedRect, type SkImage } from '@shopify/react-native-skia';
import { COMB_REST, IRE_OUTPUTS, IRE_SLOTS, PALETTE, grammarOf, ireLayout, sealOutlineOf, type IreFrame, type IreOutputKind, type MongLook, type StrokeRecord, type sim } from '@mong/core';
import { useMemo } from 'react';
import { sealPath } from '../sealPath';
import { useSharedValue } from 'react-native-reanimated';
import { Mongmangi, REST_FRAME, type BodyFrame } from '../Mongmangi';

export interface IreArtInput {
  kind: IreOutputKind;
  /** 출력 폭(px). 기본 = 규격 폭. 높이는 규격 비율 */
  width: number;
  /** 슬롯 순서의 획 기록(첫 일곱) */
  records: StrokeRecord[];
  look?: MongLook;
  strokeInks?: readonly (sim.InkId | null)[];
  /** 슬롯별 꿈 카드 그림(없으면 빈 칸) */
  cardImages: (SkImage | null)[];
  /** M2 그 아이의 인장 씨앗(naming 켬·공유판). 있으면 큰 인장 = 이 빠짐 무늬, 없으면 둥근 사각(C7 그대로) */
  sealSeed?: number;
}

export function ireSize(kind: IreOutputKind, width?: number): { width: number; height: number } {
  const o = IRE_OUTPUTS[kind];
  const w = width ?? o.width;
  return { width: w, height: Math.round((w * o.height) / o.width) };
}

/** core 프레임 → Mongmangi BodyFrame */
export function bodyFrameOf(frame: IreFrame, input: Pick<IreArtInput, 'kind' | 'width' | 'look'>): BodyFrame {
  const { width, height } = ireSize(input.kind, input.width);
  const L = ireLayout(input.kind).body;
  const wpx = L.w * width;
  const coreH = input.look?.shape.core.h ?? 1;
  return {
    ...REST_FRAME,
    ox: L.cx * width,
    oy: L.cy * height - (coreH / 2) * frame.scale * wpx,
    wpx,
    s: frame.scale,
    combN: frame.combN,
    comb: COMB_REST,
    hop: frame.hop,
    eyeA: 'open',
    eyeB: 'joy',
    eyeMix: frame.joy,
    ink: frame.drop,
    ringScale: 0.6 + 0.4 * frame.drop,
    ringAlpha: frame.drop,
    attachK: frame.attachK,
    fresh: frame.fresh,
  };
}

function Body({ frame, input }: { frame: IreFrame; input: IreArtInput }) {
  // 오프스크린 한 장마다 새로 마운트되므로 초기값 = 이 프레임
  const sv = useSharedValue<BodyFrame>(bodyFrameOf(frame, input));
  const grammar = grammarOf('');
  return <Mongmangi frame={sv} records={input.records} mode="A" grammar={grammar} look={input.look} strokeInks={input.strokeInks} />;
}

export function IreFrameArt({ frame, input }: { frame: IreFrame; input: IreArtInput }) {
  const { width, height } = ireSize(input.kind, input.width);
  const L = ireLayout(input.kind);
  const d = L.dots;
  const lw = Math.max(1, width * 0.0016);
  const seal = L.text?.seal;
  const sealSize = seal ? seal.w * width : 0;
  const sealP = useMemo(
    () => (seal && input.sealSeed !== undefined ? sealPath(sealOutlineOf(input.sealSeed, sealSize), sealSize, seal.x * width, seal.y * height) : null),
    [seal, input.sealSeed, sealSize, width, height],
  );
  return (
    <Group>
      <Fill color={PALETTE.day.bg} />
      <Group opacity={frame.fade}>
        {/* 두루마리 축과 카드 칸(공유만): 카드는 위에서 아래로 펼쳐진다 */}
        {L.cards.length > 0 && (
          <Rect x={(L.cards[0]!.x - 0.012) * width} y={L.cards[0]!.y * height - lw * 3} width={(L.cards[IRE_SLOTS - 1]!.x + L.cards[0]!.w - L.cards[0]!.x + 0.024) * width} height={lw * 2} color={PALETTE.day.inkFaded} opacity={frame.drop} />
        )}
        {L.cards.map((c, k) => {
          const open = frame.cards[k] ?? 0;
          const img = input.cardImages[k];
          const r = { x: c.x * width, y: c.y * height, w: c.w * width, h: c.h * height };
          return (
            <Group key={k}>
              <Rect x={r.x} y={r.y} width={r.w} height={r.h} style="stroke" strokeWidth={lw} color={PALETTE.day.wash} opacity={0.6 * frame.drop} />
              {img && open > 0 && (
                <Group clip={{ x: r.x, y: r.y, width: r.w, height: r.h * open }}>
                  <SkiaImage image={img} x={r.x} y={r.y} width={r.w} height={r.h} fit="fill" />
                </Group>
              )}
            </Group>
          );
        })}
        <Body frame={frame} input={input} />
        {/* 일곱 날 점: 빈 점 = 테두리(방울과 함께 나타남 — 첫 프레임은 빈 한지라 루프가 끊김 없이 이어진다), 찬 점 = 먹 */}
        {Array.from({ length: IRE_SLOTS }, (_, k) => {
          const cx = (d.cx + (k - 3) * d.gap) * width;
          const cy = d.y * height;
          const r = d.r * width;
          const fill = frame.dots[k] ?? 0;
          return (
            <Group key={`d${k}`}>
              <Circle cx={cx} cy={cy} r={r} style="stroke" strokeWidth={lw} color={PALETTE.day.inkFaded} opacity={frame.drop} />
              {fill > 0 && <Circle cx={cx} cy={cy} r={r * (0.6 + 0.4 * fill)} color={PALETTE.day.body} opacity={fill} />}
            </Group>
          );
        })}
        {/* 인장(주사, 한 화면 한 곳) — 꼬리표와 함께 나타난다 */}
        {L.text && frame.tag > 0 && sealP && <Path path={sealP} color={PALETTE.day.accent} opacity={0.93 * frame.tag} />}
        {L.text && frame.tag > 0 && !sealP && (
          <RoundedRect
            x={L.text.seal.x * width}
            y={L.text.seal.y * height}
            width={L.text.seal.w * width}
            height={L.text.seal.h * height}
            r={width * 0.004}
            color={PALETTE.day.accent}
            opacity={0.93 * frame.tag}
          />
        )}
      </Group>
    </Group>
  );
}
