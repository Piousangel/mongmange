// 공통 바텀시트(DECISIONS 'UI 공통 바텀시트'). gorhom/react-native-bottom-sheet v5의 설계를 참고한 자체 구현:
// 스냅 지점·속도 기반 스냅·과도 당김 저항·손잡이/내용 두 갈래 제스처·스크롤 소유권(맨 위 스냅이 아니면 시트가 손가락을 가짐)은 gorhom과 같고,
// 제스처는 RNGH v3 훅(usePanGesture·useNativeGesture), 애니메이션은 아트 8절(튀는 스프링 없음, ease-out)을 따른다.
// 계산·제스처 수명은 전부 sheetMath.ts(순수 함수, 시험 bottom-sheet-math.test.ts).
//
// 쓰는 법: 부모가 visible을 쥔다(제어형). 배경 탭·뒤로 가기(Android)·Esc(웹)·두 손가락 Z(iOS)·아래로 끌어 닫기·손잡이 두 번 탭(단일 스냅)은
// 모두 onClose를 부르고, 부모는 onClose에서 visible=false로 바꿔야 한다. 닫히는 애니메이션이 끝나면 Modal을 내린다.
// 닫히는 중(visible=false)에 잡은 손가락·조절 동작은 무시한다(리뷰 H1, sheetMath beginDrag).
import { PALETTE } from '@mong/core';
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
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
  type ViewProps,
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
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../../i18n';
import { useLater } from '../../lib/useLater';
import { PARAMS } from '../../render/clock';
import { KText, SANS, SERIF, track } from '../type';
import {
  IDLE_DRAG,
  OVERDRAG_FACTOR,
  backdropProgress,
  beginDrag,
  detentPositions,
  dragPosition,
  endDrag,
  ownsDrag,
  releaseTarget,
  resolveDetents,
  settleDuration,
  shouldClose,
  stepContentDrag,
  stepDetent,
  type DragSource,
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
/** 열린 뒤 첫 포커스를 제목으로 보내기까지(ms): Modal이 제 포커스를 먼저 옮긴 뒤에 덮어쓴다 */
const FOCUS_DELAY_MS = 350;

const BACKDROP: Record<SheetTheme, string> = { day: 'rgba(20,18,16,0.38)', night: 'rgba(5,7,14,0.55)' };

export type BottomSheetProps = {
  visible: boolean;
  /** 사용자가 닫기를 요청했다. 부모는 visible=false로 바꾼다 */
  onClose: () => void;
  /** 머리 줄의 명조 제목. 열리면 스크린리더 첫 포커스가 여기 간다 */
  title: string;
  /** 스냅 지점(기본 ['content'] = 내용 높이 하나). 값으로 비교하므로 인라인 배열도 된다 */
  snapPoints?: readonly SnapPoint[];
  /** 처음 열 자리: 스냅 지점을 낮은 것부터 센 번호. 기본 = 가장 높은 지점 */
  initialSnap?: number;
  /** 끌어 내려 닫기·배경 탭·뒤로 가기·Esc·닫기 버튼(기본 true). false면 가장 낮은 지점 아래는 저항 */
  closable?: boolean;
  theme?: SheetTheme;
  children?: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** 시트 위에 겹칠 것(같은 Modal 안, 예: 카드 크게 보기). 있으면 시트는 스크린리더에서 숨고 뒤로 가기·Esc는 onOverlayBack */
  overlay?: ReactNode;
  onOverlayBack?: () => void;
  /** 시트 `testID`. 닫기 버튼 `${testID}-close`, 손잡이 `-handle`, 스크롤 `-scroll`, 배경 `-backdrop`, 웹 크기 조절 `-size` */
  testID?: string;
};

export function BottomSheet({
  visible,
  onClose,
  title,
  snapPoints = DEFAULT_SNAPS,
  initialSnap,
  closable = true,
  theme = 'day',
  children,
  contentContainerStyle,
  overlay,
  onOverlayBack,
  testID,
}: BottomSheetProps) {
  const C = PALETTE[theme];
  const insets = useSafeAreaInsets();
  const later = useLater();
  const sysRM = useSystemReduceMotion();
  const rm = PARAMS.rm || sysRM;
  // 리뷰 M5: 배열 동일성이 아니라 값으로 비교한다 — 인라인 배열을 넘겨도 다시 그릴 때마다 재스냅하지 않는다
  const snapKey = JSON.stringify(snapPoints);
  const snaps = useMemo(() => JSON.parse(snapKey) as SnapPoint[], [snapKey]);

  const [mounted, setMounted] = useState(visible);
  const [container, setContainer] = useState(0);
  const [sheetH, setSheetH] = useState(0);
  const [kb, setKb] = useState(0);
  /** 스크린리더 조절 값: 낮은 스냅부터 1, 2, … */
  const [level, setLevel] = useState(0);

  /** 시트 translateY(sheetMath 좌표) */
  const pos = useSharedValue(OFFSCREEN);
  /** visible의 UI 스레드 사본: 닫히는 중이면 제스처가 아무것도 하지 않는다(리뷰 H1) */
  const open = useSharedValue(visible);
  /** 레이아웃: 컨테이너·시트 높이 */
  const geo = useSharedValue({ container: 0, sheet: 0 });
  const canScroll = useSharedValue(false);
  const scrollY = useSharedValue(0);
  /** 한 제스처의 상태(주인·시작·raw·지난 이동량·움직였나). 수명 규칙은 sheetMath beginDrag/ownsDrag/releaseTarget/endDrag */
  const drag = useSharedValue(IDLE_DRAG);
  const pinned = useSharedValue(false);
  const pinY = useSharedValue(0);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const titleRef = useRef<ComponentRef<typeof View>>(null);
  /**
   * 사용자가 끌거나 조절해서 고른 스냅 칸(위치 목록, 위쪽부터의 번호). -1 = 아직 고르지 않음 → initialSnap.
   * 고른 뒤에는 높이가 바뀌어도(앨범 썸네일이 늦게 그려짐 등) 그 칸을 지킨다. 처음 몇 번의 레이아웃은 내용이 덜 재어져
   * 스냅이 하나로 겹칠 수 있어, 사용자가 고르기 전까지는 늘 initialSnap으로 다시 계산한다.
   */
  const snapIdx = useSharedValue(-1);
  const focused = useRef(false);

  // ── 여닫기(visible이 정본) ──
  useEffect(() => {
    open.value = visible;
    if (visible) {
      setMounted(true);
      if (sheetH <= 0 || container <= 0) return;
      // 리뷰 M5: 손가락이 시트를 쥔 동안에는 높이·스냅이 바뀌어도 되감지 않는다(놓을 때 settle이 새 레이아웃으로 계산)
      if (drag.value.owner !== null) return;
      const positions = detentPositions(resolveDetents(snaps, container, sheetH), sheetH);
      const last = positions.length - 1;
      const k = snapIdx.value >= 0 ? Math.min(last, snapIdx.value) : initialSnap === undefined ? 0 : last - Math.max(0, Math.min(last, initialSnap));
      const target = positions[k]!;
      setLevel(last - k + 1);
      if (pos.value >= OFFSCREEN) pos.value = sheetH; // 처음 잰 순간: 닫힌 자리에서 출발
      cancelAnimation(pos);
      const d = settleDuration(Math.abs(pos.value - target), 0, rm, OPEN_MS);
      pos.value = d === 0 ? target : withTiming(target, { duration: d, easing: Easing.out(Easing.cubic) });
    } else if (mounted) {
      snapIdx.value = -1;
      focused.current = false;
      const unmount = () => {
        setMounted(false);
        pos.value = OFFSCREEN;
      };
      // 이미 닫힌 자리(끌어 닫기 직후)면 240ms를 더 돌지 않고 바로 내린다(리뷰 L5)
      if (rm || sheetH <= 0 || Math.abs(pos.value - sheetH) < 0.5) {
        cancelAnimation(pos);
        unmount();
        return;
      }
      cancelAnimation(pos);
      pos.value = withTiming(sheetH, { duration: CLOSE_MS }, (done) => {
        if (done) runOnJS(unmount)();
      });
    }
  }, [visible, mounted, sheetH, container, snaps, initialSnap, rm, pos, snapIdx, open, drag]);

  // 첫 포커스 = 제목(리뷰 M3). Modal이 첫 요소(배경)로 포커스를 옮긴 뒤 덮어쓴다. 웹은 DOM 포커스(tabIndex -1)
  const ready = mounted && visible && sheetH > 0;
  useEffect(() => {
    if (!ready || focused.current) return;
    focused.current = true;
    later(() => {
      const node = titleRef.current;
      if (!node) return;
      if (Platform.OS === 'web') (node as unknown as { focus?: () => void }).focus?.();
      else AccessibilityInfo.sendAccessibilityEvent(node, 'focus');
    }, FOCUS_DELAY_MS);
  }, [ready, later]);

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
  // worklet은 만들어지는 순간 클로저를 잡는다 — 부르는 worklet보다 먼저 선언한다(worklet-order 시험, 11-20 S25 TDZ)
  const closeJS = () => onClose();
  const levelJS = (n: number) => setLevel(n);
  const bounds = () => {
    'worklet';
    const g = geo.value;
    const positions = detentPositions(resolveDetents(snaps, g.container, g.sheet), g.sheet);
    const top = positions[0] ?? 0;
    const lowest = positions[positions.length - 1] ?? 0;
    return { positions, top, lowest, closed: g.sheet, bottom: closable ? g.sheet : lowest };
  };
  const settle = (target: number, velocity: number) => {
    'worklet';
    const b = bounds();
    const d = settleDuration(target - pos.value, velocity, rm, OPEN_MS);
    const closing = closable && shouldClose(target, b.closed);
    if (!closing) {
      const k = b.positions.findIndex((x) => Math.abs(x - target) < 0.5);
      snapIdx.value = k;
      if (k >= 0) runOnJS(levelJS)(b.positions.length - k);
    }
    if (d === 0) {
      pos.value = target;
      if (closing) runOnJS(closeJS)();
      return;
    }
    pos.value = withTiming(target, { duration: d, easing: Easing.out(Easing.cubic) }, (done) => {
      if (done && closing) runOnJS(closeJS)();
    });
  };
  const begin = (source: DragSource) => {
    'worklet';
    const next = beginDrag(drag.value, source, open.value, pos.value);
    if (next === null) return false;
    cancelAnimation(pos);
    drag.value = next;
    return true;
  };
  const release = (source: DragSource, velocityY: number) => {
    'worklet';
    if (source === 'content') pinned.value = false;
    const b = bounds();
    const target = releaseTarget(drag.value, source, open.value, pos.value, velocityY, b.positions, closable ? b.closed : null);
    if (target !== null) settle(target, velocityY);
  };
  const finish = (source: DragSource) => {
    'worklet';
    if (source === 'content') pinned.value = false;
    drag.value = endDrag(drag.value, source);
  };

  // 손잡이·머리 줄: 손가락을 그대로 따른다(위로 넘치면 저항)
  const handlePan = usePanGesture({
    activeOffsetY: [-6, 6],
    onActivate: () => {
      'worklet';
      begin('handle');
    },
    onUpdate: (e) => {
      'worklet';
      if (!ownsDrag(drag.value, 'handle', open.value)) return;
      const b = bounds();
      const raw = drag.value.start + e.translationY;
      drag.value = { ...drag.value, raw, moved: true };
      pos.value = dragPosition({ raw, top: b.top, bottom: b.bottom, overTop: true, overBottom: !closable, factor: OVERDRAG_FACTOR });
    },
    onDeactivate: (e) => {
      'worklet';
      release('handle', e.velocityY);
    },
    onFinalize: () => {
      'worklet';
      finish('handle');
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
      if (begin('content')) pinY.value = scrollY.value;
    },
    onUpdate: (e) => {
      'worklet';
      if (!ownsDrag(drag.value, 'content', open.value)) return;
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
      release('content', e.velocityY);
    },
    onFinalize: () => {
      'worklet';
      finish('content');
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
  // 위로 과도 당김(또는 키보드)으로 들린 만큼 바닥에 생기는 틈을 시트 색으로 채운다(리뷰 L1, gorhom과 같은 방식)
  const skirtSt = useAnimatedStyle(() => ({ height: pos.value >= OFFSCREEN ? 0 : Math.max(0, kb - pos.value) }));
  const backSt = useAnimatedStyle(() => {
    const b = bounds();
    return { opacity: pos.value >= OFFSCREEN ? 0 : backdropProgress(pos.value, b.lowest, b.closed) };
  });

  // ── 스크린리더·키보드(리뷰 M3·M4) ──
  const detentCount = sheetH > 0 && container > 0 ? resolveDetents(snaps, container, sheetH).length : 0;
  const multi = detentCount > 1;
  const step = (dir: 'up' | 'down') => {
    if (!visible || !multi) return; // 닫히는 중에는 조절하지 않는다(리뷰 H1)
    const positions = detentPositions(resolveDetents(snaps, container, sheetH), sheetH);
    const target = stepDetent(pos.value, positions, dir);
    const k = positions.findIndex((x) => Math.abs(x - target) < 0.5);
    snapIdx.value = k;
    setLevel(positions.length - k);
    cancelAnimation(pos);
    const d = settleDuration(Math.abs(target - pos.value), 0, rm, OPEN_MS);
    pos.value = d === 0 ? target : withTiming(target, { duration: d, easing: Easing.out(Easing.cubic) });
  };
  const onA11yAction = (e: AccessibilityActionEvent) => {
    const name = e.nativeEvent.actionName;
    if (name === 'activate' && closable && !multi && visible) onClose();
    else if (name === 'increment') step('up');
    else if (name === 'decrement') step('down');
  };
  // 조절 막대의 현재 값(리뷰 M3). aria-* 값 속성은 RN(네이티브)과 RNW(웹 aria-valuenow) 모두 그대로 읽는다
  const nowLv = Math.max(1, level);
  const maxLv = Math.max(1, detentCount);
  const sizeValue = { 'aria-valuemin': 1, 'aria-valuemax': maxLv, 'aria-valuenow': nowLv, 'aria-valuetext': t('sheet.level', { now: nowLv, max: maxLv }) } as const;
  /**
   * 손잡이의 스크린리더 갈래: 여러 스냅 = 조절 막대(값 있음, 위아래 쓸기, 닫기는 머리 줄 버튼·Z·뒤로 가기 — 슬라이더 두 번 탭은 관례 밖),
   * 단일 스냅 + 닫을 수 있음 = 버튼(두 번 탭 = 닫기), 단일 + 닫을 수 없음 = 할 일이 없어 숨김.
   * 웹은 그림만 둔다 — role이 있으면 RNGH 웹이 포인터 캡처를 하지 않아 마우스 끌기가 끊긴다. 웹 조절은 아래 형제 노드.
   */
  const handleA11y: ViewProps =
    Platform.OS === 'web' || (!multi && !closable)
      ? { accessible: false }
      : multi
        ? {
            accessible: true,
            accessibilityRole: 'adjustable',
            accessibilityLabel: t('sheet.handle'),
            accessibilityHint: t('sheet.handle.hintAdjust'),
            ...sizeValue,
            accessibilityActions: A11Y_ACTIONS_ADJUST,
            onAccessibilityAction: onA11yAction,
          }
        : {
            accessible: true,
            accessibilityRole: 'button',
            accessibilityLabel: t('sheet.handle'),
            accessibilityHint: t('sheet.handle.hint'),
            accessibilityActions: A11Y_ACTIONS_CLOSE,
            onAccessibilityAction: onA11yAction,
          };
  // 웹 여러 스냅: GestureDetector 밖 형제 노드(포인터는 통과)로 slider + 화살표 키(리뷰 M4)
  const webSize = {
    accessible: true,
    focusable: true,
    accessibilityRole: 'adjustable',
    accessibilityLabel: t('sheet.handle'),
    accessibilityHint: t('sheet.handle.hintAdjust'),
    ...sizeValue,
    // RNW는 DOM 키보드 이벤트를 그대로 넘긴다(e.key)
    onKeyDown: (e: { key?: string; nativeEvent?: { key?: string }; preventDefault?: () => void }) => {
      const key = e.key ?? e.nativeEvent?.key;
      if (key !== 'ArrowUp' && key !== 'ArrowDown') return;
      e.preventDefault?.();
      step(key === 'ArrowUp' ? 'up' : 'down');
    },
  } as unknown as ViewProps;
  const back = overlay ? (onOverlayBack ?? onClose) : closable ? onClose : noop;
  const tid = (s: string) => (testID ? `${testID}-${s}` : undefined);

  return (
    <Modal visible={mounted} animationType="none" transparent onRequestClose={back} statusBarTranslucent navigationBarTranslucent>
      <GestureHandlerRootView style={styles.fill}>
        <View style={styles.fill} onLayout={onContainer}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: BACKDROP[theme] }, backSt]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={closable ? onClose : undefined}
              accessibilityRole={closable ? 'button' : undefined}
              accessibilityLabel={closable ? t('sheet.closeBackdrop', { title }) : undefined}
              importantForAccessibility={closable ? 'auto' : 'no'}
              testID={tid('backdrop')}
            />
          </Animated.View>
          <Animated.View style={[styles.skirt, { backgroundColor: C.bg }, skirtSt]} pointerEvents="none" testID={tid('skirt')} />
          <Animated.View
            style={[styles.sheet, { backgroundColor: C.bg, maxHeight: Math.max(0, container - insets.top - 24 - kb), paddingBottom: kb > 0 ? 16 : insets.bottom + 16 }, sheetSt]}
            onLayout={onSheet}
            accessibilityViewIsModal={!overlay}
            // 겹친 것(카드 보기)이 있으면 시트는 스크린리더에서 숨는다 — 두 modal 사이에서 갇힐 곳이 흔들리지 않게
            accessibilityElementsHidden={!!overlay}
            importantForAccessibility={overlay ? 'no-hide-descendants' : 'auto'}
            onAccessibilityEscape={overlay || closable ? back : undefined}
            testID={testID}
          >
            <View style={[styles.grain, { backgroundColor: C.bgShade }]} pointerEvents="none" />
            <GestureDetector gesture={handlePan}>
              <View style={styles.webNoSelect}>
                {/* 읽는 순서: 제목 → 닫기 → 손잡이. 손잡이 그림은 맨 위(absolute)지만 트리에서는 머리 줄 뒤(리뷰 M3) */}
                <View style={[styles.head, { borderColor: C.wash }]}>
                  <View
                    ref={titleRef}
                    style={styles.titleBox}
                    accessible
                    accessibilityRole="header"
                    accessibilityLabel={title}
                    {...(Platform.OS === 'web' ? ({ tabIndex: -1 } as object) : null)}
                    testID={tid('title')}
                  >
                    <KText style={[styles.title, { color: C.text }]} serif="title">
                      {title}
                    </KText>
                  </View>
                  {closable && (
                    <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel={t('sheet.close')} testID={tid('close')}>
                      <KText style={[styles.closeText, { color: C.textSub }]}>{t('sheet.close')}</KText>
                    </Pressable>
                  )}
                </View>
                <View style={styles.handleRow} {...handleA11y} testID={tid('handle')}>
                  <View style={[styles.grabber, { backgroundColor: C.wash }]} />
                </View>
              </View>
            </GestureDetector>
            {Platform.OS === 'web' && multi && <View style={styles.handleRow} pointerEvents="none" {...webSize} testID={tid('size')} />}
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
                    testID={tid('scroll')}
                  >
                    {children}
                  </Animated.ScrollView>
                </GestureDetector>
              </View>
            </GestureDetector>
          </Animated.View>
          {overlay}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

/** 시스템 '동작 줄이기'를 앱 사용 중 바꿔도 따른다(리뷰 L4 — Reanimated useReducedMotion은 시작할 때 한 번만 읽음) */
function useSystemReduceMotion(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setOn(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setOn);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return on;
}

const DEFAULT_SNAPS: readonly SnapPoint[] = ['content'];
const A11Y_ACTIONS_CLOSE = [{ name: 'activate' as const }];
const A11Y_ACTIONS_ADJUST = [{ name: 'increment' as const }, { name: 'decrement' as const }];
function noop() {}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  shrink: { flexShrink: 1 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingHorizontal: 20, overflow: 'hidden' },
  skirt: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  // 노트의 유일한 장식: 상단 한지 결(아트 7-2)
  grain: { position: 'absolute', left: 0, right: 0, top: 0, height: 6, opacity: 0.7 },
  handleRow: { position: 'absolute', left: 0, right: 0, top: 0, height: HANDLE_H, alignItems: 'center', justifyContent: 'flex-end' },
  grabber: { width: 36, height: 4, borderRadius: 2, opacity: 0.8 },
  webNoSelect: Platform.select({ web: { userSelect: 'none', cursor: 'grab' } as unknown as ViewStyle, default: {} }),
  head: { marginTop: HANDLE_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  titleBox: { flexShrink: 1 },
  title: { fontFamily: SERIF, fontSize: 19, letterSpacing: track.serif(19) },
  close: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  closeText: { fontFamily: SANS, fontSize: 15 },
});
