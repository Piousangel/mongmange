// 공통 바텀시트(DECISIONS 'UI 공통 바텀시트'). gorhom/react-native-bottom-sheet v5의 설계를 참고한 자체 구현:
// 스냅 지점·속도 기반 스냅·과도 당김 저항·손잡이/내용 두 갈래 제스처·스크롤 맨 위에서만 시트가 내려감은 gorhom과 같고,
// 제스처는 RNGH v3 훅(usePanGesture·useNativeGesture), 애니메이션은 아트 8절(튀는 스프링 없음, ease-out)을 따른다.
// 계산은 전부 sheetMath.ts(순수 함수, 시험 bottom-sheet-math.test.ts).
//
// 쓰는 법: 부모가 visible을 쥔다(제어형). 배경 탭·뒤로 가기(Android)·Esc(웹)·아래로 끌어 닫기·손잡이 두 번 탭은 모두 onClose를 부르고,
// 부모는 onClose에서 visible=false로 바꿔야 한다. 닫히는 애니메이션이 끝나면 Modal을 내린다.
import { PALETTE } from '@mong/core';
import { useEffect, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { GestureDetector, GestureHandlerRootView, useNativeGesture, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../../i18n';
import { PARAMS } from '../../render/clock';
import { KText, SANS, SERIF, track } from '../type';
import {
  OVERDRAG_FACTOR,
  backdropProgress,
  detentPositions,
  dragPosition,
  pickSnap,
  resolveDetents,
  settleDuration,
  shouldClose,
  stepContentDrag,
  stepDetent,
  type SnapPoint,
} from './sheetMath';

export type SheetTheme = 'day' | 'night';

/** 여는 시간·닫는 시간(ms): 공방 노트가 쓰던 값 그대로(320 ease-out cubic / 240) */
const OPEN_MS = 320;
const CLOSE_MS = 240;
/** 아직 재지 않은 시트는 화면 밖 */
const OFFSCREEN = 100000;
/** 손잡이 줄 높이 = 공방 노트의 위 여백(14)과 같게 — 옮긴 뒤 머리 줄 자리가 그대로다 */
const HANDLE_H = 14;

const BACKDROP: Record<SheetTheme, string> = { day: 'rgba(20,18,16,0.38)', night: 'rgba(5,7,14,0.55)' };

export type BottomSheetProps = {
  visible: boolean;
  /** 사용자가 닫기를 요청했다. 부모는 visible=false로 바꾼다 */
  onClose: () => void;
  /** 스냅 지점(기본 ['content'] = 내용 높이 하나). 높이가 시트 최대 높이를 넘으면 잘린다 */
  snapPoints?: readonly SnapPoint[];
  /** 처음 열 자리: 스냅 지점을 낮은 것부터 센 번호. 기본 = 가장 높은 지점 */
  initialSnap?: number;
  /** 끌어 내려 닫기·배경 탭·뒤로 가기·Esc로 닫을 수 있나(기본 true). false면 가장 낮은 지점 아래는 저항 */
  closable?: boolean;
  theme?: SheetTheme;
  /** 기본 머리 줄(명조 제목 + 닫기 버튼). header를 주면 그것을 쓴다 */
  title?: string;
  /** 머리 줄 직접 그리기. 손잡이와 함께 시트를 끄는 자리다 */
  header?: ReactNode;
  children?: ReactNode;
  /** true(기본)면 안쪽을 스크롤로 감싸고 시트 드래그와 조율한다 */
  scroll?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** 시트 위에 겹칠 것(같은 Modal 안, 예: 카드 크게 보기) */
  overlay?: ReactNode;
  /** 배경(누르면 닫힘)의 스크린리더 라벨 */
  backdropLabel?: string;
  /** 열릴 때 스크린리더가 읽을 말(기본 title) */
  announce?: string;
  /** 손잡이(위쪽 짧은 선) — 끌 수 있다는 표시. 기본 true */
  handle?: boolean;
  sheetStyle?: StyleProp<ViewStyle>;
  /** 넓은 화면(웹·태블릿)에서 시트 최대 폭. 없으면 화면 폭 전체 */
  maxWidth?: number;
  testID?: string;
};

export function BottomSheet({
  visible,
  onClose,
  snapPoints = DEFAULT_SNAPS,
  initialSnap,
  closable = true,
  theme = 'day',
  title,
  header,
  children,
  scroll = true,
  contentContainerStyle,
  overlay,
  backdropLabel,
  announce,
  handle = true,
  sheetStyle,
  maxWidth,
  testID,
}: BottomSheetProps) {
  const C = PALETTE[theme];
  const insets = useSafeAreaInsets();
  const sysRM = useReducedMotion();
  const rm = PARAMS.rm || sysRM;

  const [mounted, setMounted] = useState(visible);
  const [container, setContainer] = useState(0);
  const [sheetH, setSheetH] = useState(0);
  const [kb, setKb] = useState(0);

  /** 시트 translateY(sheetMath 좌표) */
  const pos = useSharedValue(OFFSCREEN);
  /** 레이아웃: 컨테이너·시트 높이, 안쪽이 스크롤되나 */
  const geo = useSharedValue({ container: 0, sheet: 0 });
  const canScroll = useSharedValue(false);
  const scrollY = useSharedValue(0);
  /** 드래그 중 상태(한 제스처 안): 시작 위치·raw 위치·지난 이동량·시트가 움직였나·스크롤을 묶을 자리 */
  const drag = useSharedValue({ start: 0, raw: 0, prevT: 0, moved: false });
  const pinned = useSharedValue(false);
  const pinY = useSharedValue(0);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  // ── 여닫기(visible이 정본) ──
  const openIdx = initialSnap;
  /**
   * 사용자가 끌거나 조절해서 고른 스냅 칸(위치 목록, 위쪽부터의 번호). -1 = 아직 고르지 않음 → initialSnap.
   * 고른 뒤에는 높이가 바뀌어도(앨범 썸네일이 늦게 그려짐 등) 그 칸을 지킨다. 처음 몇 번의 레이아웃은 내용이 덜 재어져
   * 스냅이 하나로 겹칠 수 있어, 사용자가 고르기 전까지는 늘 initialSnap으로 다시 계산한다.
   */
  const snapIdx = useSharedValue(-1);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      if (sheetH <= 0 || container <= 0) return;
      const positions = detentPositions(resolveDetents(snapPoints, container, sheetH), sheetH);
      const last = positions.length - 1;
      const k = snapIdx.value >= 0 ? Math.min(last, snapIdx.value) : openIdx === undefined ? 0 : last - Math.max(0, Math.min(last, openIdx));
      const target = positions[k]!;
      if (pos.value >= OFFSCREEN) pos.value = sheetH; // 처음 잰 순간: 닫힌 자리에서 출발
      cancelAnimation(pos);
      const d = settleDuration(Math.abs(pos.value - target), 0, rm, OPEN_MS);
      pos.value = d === 0 ? target : withTiming(target, { duration: d, easing: Easing.out(Easing.cubic) });
    } else if (mounted) {
      const closed = sheetH > 0 ? sheetH : OFFSCREEN;
      cancelAnimation(pos);
      snapIdx.value = -1;
      const unmount = () => {
        setMounted(false);
        pos.value = OFFSCREEN;
      };
      if (rm || sheetH <= 0) unmount();
      else
        pos.value = withTiming(closed, { duration: CLOSE_MS }, (done) => {
          if (done) runOnJS(unmount)();
        });
    }
  }, [visible, mounted, sheetH, container, snapPoints, openIdx, rm, pos, snapIdx]);

  // 열릴 때 스크린리더에 알린다(시트가 무엇인지). 포커스는 Modal이 가둔다(iOS accessibilityViewIsModal, 웹 RNW 포커스 트랩)
  const said = announce ?? title;
  useEffect(() => {
    if (visible && said) AccessibilityInfo.announceForAccessibility(said);
  }, [visible, said]);

  // 키보드 회피(iOS): 시트를 키보드 높이만큼 올린다. Android는 Modal 창이 adjustResize로 줄어들고, 웹은 브라우저가 맡는다
  useEffect(() => {
    if (Platform.OS !== 'ios' || !visible) return;
    const show = Keyboard.addListener('keyboardWillShow', (e) => setKb(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardWillHide', () => setKb(0));
    return () => {
      show.remove();
      hide.remove();
      setKb(0);
    };
  }, [visible]);

  const onContainer = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setContainer(h);
    geo.value = { ...geo.value, container: h };
  };
  const onSheet = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setSheetH(h);
    geo.value = { ...geo.value, sheet: h };
  };

  // ── UI 스레드 계산 묶음 ──
  const closeJS = () => onClose();
  // worklet은 만들어지는 순간 클로저를 잡는다 — 부르는 worklet보다 먼저 선언한다(core worklet-order 시험과 같은 이유, 11-20 S25 TDZ)
  const bounds = () => {
    'worklet';
    const g = geo.value;
    const positions = detentPositions(resolveDetents(snapPoints, g.container, g.sheet), g.sheet);
    const top = positions[0] ?? 0;
    const lowest = positions[positions.length - 1] ?? 0;
    return { positions, top, lowest, closed: g.sheet, bottom: closable ? g.sheet : lowest };
  };
  const settle = (target: number, velocity: number) => {
    'worklet';
    const closed = geo.value.sheet;
    const d = settleDuration(target - pos.value, velocity, rm, OPEN_MS);
    const closing = closable && shouldClose(target, closed);
    if (!closing) snapIdx.value = bounds().positions.findIndex((x) => Math.abs(x - target) < 0.5);
    if (d === 0) {
      pos.value = target;
      if (closing) runOnJS(closeJS)();
      return;
    }
    pos.value = withTiming(target, { duration: d, easing: Easing.out(Easing.cubic) }, (done) => {
      if (done && closing) runOnJS(closeJS)();
    });
  };
  const begin = () => {
    'worklet';
    cancelAnimation(pos);
    drag.value = { start: pos.value, raw: pos.value, prevT: 0, moved: false };
  };
  const release = (velocityY: number) => {
    'worklet';
    pinned.value = false;
    if (!drag.value.moved) return;
    const b = bounds();
    settle(pickSnap(pos.value, velocityY, b.positions, closable ? b.closed : null), velocityY);
  };

  // 손잡이·머리 줄: 손가락을 그대로 따른다(위로 넘치면 저항)
  const handlePan = usePanGesture({
    activeOffsetY: [-6, 6],
    onActivate: () => {
      'worklet';
      begin();
    },
    onUpdate: (e) => {
      'worklet';
      const b = bounds();
      const raw = drag.value.start + e.translationY;
      drag.value = { ...drag.value, raw, moved: true };
      pos.value = dragPosition({ raw, top: b.top, bottom: b.bottom, overTop: true, overBottom: !closable, factor: OVERDRAG_FACTOR });
    },
    onDeactivate: (e) => {
      'worklet';
      release(e.velocityY);
    },
  });

  // 안쪽 스크롤: 네이티브 스크롤과 동시에 돌고, 어느 쪽이 손가락을 가질지는 stepContentDrag가 프레임마다 정한다
  const native = useNativeGesture({ disableReanimated: true });
  const contentPan = usePanGesture({
    activeOffsetY: [-8, 8],
    failOffsetX: [-24, 24],
    simultaneousWith: native,
    onActivate: () => {
      'worklet';
      begin();
      pinY.value = scrollY.value;
    },
    onUpdate: (e) => {
      'worklet';
      const b = bounds();
      const d = drag.value;
      const step = stepContentDrag({ pos: d.raw, delta: e.translationY - d.prevT, scrollY: scrollY.value, top: b.top, bottom: b.bottom, scrollable: canScroll.value });
      const movedNow = step.pos !== d.raw;
      drag.value = { ...d, raw: step.pos, prevT: e.translationY, moved: d.moved || movedNow };
      if (step.sheetOwns && !pinned.value) pinY.value = scrollY.value;
      pinned.value = step.sheetOwns;
      pos.value = dragPosition({ raw: step.pos, top: b.top, bottom: b.bottom, overTop: !canScroll.value, overBottom: !closable, factor: OVERDRAG_FACTOR });
    },
    onDeactivate: (e) => {
      'worklet';
      release(e.velocityY);
    },
    onFinalize: () => {
      'worklet';
      pinned.value = false;
    },
  });

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
      // 시트가 손가락을 가진 동안 스크롤은 제자리(gorhom의 scrollable lock과 같은 방식)
      if (pinned.value && Math.abs(e.contentOffset.y - pinY.value) > 0.5) scrollTo(scrollRef, 0, pinY.value, false);
    },
  });
  // 안쪽이 실제로 스크롤되나(내용 > 보이는 칸). 스크롤할 게 없으면 내용 드래그도 손잡이처럼 위로 저항
  const sizes = useSharedValue({ viewport: 0, content: 0 });
  const setSize = (k: 'viewport' | 'content', h: number) => {
    const next = { ...sizes.value, [k]: h };
    sizes.value = next;
    canScroll.value = next.content > next.viewport + 1;
  };

  // ── 그림 ──
  const sheetSt = useAnimatedStyle(() => ({ transform: [{ translateY: pos.value - kb }] }));
  const backSt = useAnimatedStyle(() => {
    const b = bounds();
    return { opacity: pos.value >= OFFSCREEN ? 0 : backdropProgress(pos.value, b.lowest, b.closed) };
  });

  // 스크린리더: 손잡이 = 조절 막대(스냅이 둘 이상) 또는 버튼. 두 번 탭 = 닫기, 위/아래 쓸기 = 한 칸
  const multi = sheetH > 0 && container > 0 && resolveDetents(snapPoints, container, sheetH).length > 1;
  const onA11yAction = (e: AccessibilityActionEvent) => {
    const name = e.nativeEvent.actionName;
    if (name === 'activate') {
      if (closable) onClose();
      return;
    }
    if (name !== 'increment' && name !== 'decrement') return;
    const positions = detentPositions(resolveDetents(snapPoints, container, sheetH), sheetH);
    const target = stepDetent(pos.value, positions, name === 'increment' ? 'up' : 'down');
    snapIdx.value = positions.findIndex((x) => Math.abs(x - target) < 0.5);
    cancelAnimation(pos);
    const d = settleDuration(Math.abs(target - pos.value), 0, rm, OPEN_MS);
    pos.value = d === 0 ? target : withTiming(target, { duration: d, easing: Easing.out(Easing.cubic) });
  };

  const head =
    header ??
    (title !== undefined ? (
      <View style={[styles.head, { borderColor: C.wash }]}>
        <KText style={[styles.title, { color: C.text }]} accessibilityRole="header" serif="title">
          {title}
        </KText>
        {closable && (
          <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel={t('sheet.close')} testID={testID ? `${testID}-close` : undefined}>
            <KText style={[styles.closeText, { color: C.textSub }]}>{t('sheet.close')}</KText>
          </Pressable>
        )}
      </View>
    ) : null);

  const body = scroll ? (
    <GestureDetector gesture={contentPan}>
      <View style={styles.shrink}>
        <GestureDetector gesture={native}>
          <Animated.ScrollView
            ref={scrollRef}
            onScroll={onScroll}
            scrollEventThrottle={16}
            bounces={false}
            overScrollMode="never"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={contentContainerStyle}
            onLayout={(e) => setSize('viewport', e.nativeEvent.layout.height)}
            onContentSizeChange={(_, h) => setSize('content', h)}
            testID={testID ? `${testID}-scroll` : undefined}
          >
            {children}
          </Animated.ScrollView>
        </GestureDetector>
      </View>
    </GestureDetector>
  ) : (
    <GestureDetector gesture={contentPan}>
      <View style={contentContainerStyle}>{children}</View>
    </GestureDetector>
  );

  return (
    <Modal visible={mounted} animationType="none" transparent onRequestClose={closable ? onClose : noop} statusBarTranslucent navigationBarTranslucent>
      <GestureHandlerRootView style={styles.fill}>
        <View style={styles.fill} onLayout={onContainer}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: BACKDROP[theme] }, backSt]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={closable ? onClose : undefined}
              accessibilityRole={closable ? 'button' : undefined}
              accessibilityLabel={closable ? (backdropLabel ?? t('sheet.closeBackdrop')) : undefined}
              importantForAccessibility={closable ? 'auto' : 'no'}
              testID={testID ? `${testID}-backdrop` : undefined}
            />
          </Animated.View>
          <Animated.View
            style={[
              styles.sheet,
              { backgroundColor: C.bg, maxHeight: Math.max(0, container - insets.top - 24 - kb), paddingBottom: insets.bottom + 16 },
              maxWidth !== undefined && { maxWidth, alignSelf: 'center', width: '100%' },
              sheetStyle,
              sheetSt,
            ]}
            onLayout={onSheet}
            accessibilityViewIsModal
            testID={testID}
          >
            <View style={[styles.grain, { backgroundColor: C.bgShade }]} pointerEvents="none" />
            <GestureDetector gesture={handlePan}>
              <View style={styles.webNoSelect}>
                {handle && (
                  <View
                    style={styles.handleRow}
                    {...(Platform.OS === 'web'
                      ? // 웹: 조절 동작을 전달할 길이 없고, role=button이면 RNGH가 포인터 캡처를 하지 않아 마우스가 손잡이 밖으로 나가면 끌기가 끊긴다.
                        // 그래서 손잡이는 그림만(닫기 = 머리 줄 버튼·배경·Esc)
                        { accessible: false }
                      : {
                          accessible: true,
                          accessibilityRole: multi ? ('adjustable' as const) : ('button' as const),
                          accessibilityLabel: t('sheet.handle'),
                          accessibilityHint: multi ? t('sheet.handle.hintAdjust') : t('sheet.handle.hint'),
                          accessibilityActions: multi ? A11Y_ACTIONS_MULTI : A11Y_ACTIONS,
                          onAccessibilityAction: onA11yAction,
                        })}
                    testID={testID ? `${testID}-handle` : undefined}
                  >
                    <View style={[styles.grabber, { backgroundColor: C.wash }]} />
                  </View>
                )}
                {!handle && <View style={{ height: HANDLE_H }} />}
                {head}
              </View>
            </GestureDetector>
            {body}
          </Animated.View>
          {overlay}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const DEFAULT_SNAPS: readonly SnapPoint[] = ['content'];
const A11Y_ACTIONS = [{ name: 'activate' as const }];
const A11Y_ACTIONS_MULTI = [{ name: 'activate' as const }, { name: 'increment' as const }, { name: 'decrement' as const }];
function noop() {}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  shrink: { flexShrink: 1 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingHorizontal: 20, overflow: 'hidden' },
  // 노트의 유일한 장식: 상단 한지 결(아트 7-2)
  grain: { position: 'absolute', left: 0, right: 0, top: 0, height: 6, opacity: 0.7 },
  handleRow: { height: HANDLE_H, alignItems: 'center', justifyContent: 'flex-end' },
  grabber: { width: 36, height: 4, borderRadius: 2, opacity: 0.8 },
  webNoSelect: Platform.select({ web: { userSelect: 'none', cursor: 'grab' } as unknown as ViewStyle, default: {} }),
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontFamily: SERIF, fontSize: 19, letterSpacing: track.serif(19), flexShrink: 1 },
  close: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  closeText: { fontFamily: SANS, fontSize: 15 },
});
