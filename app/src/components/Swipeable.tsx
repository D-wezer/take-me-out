import { useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { Animated, StyleSheet, useWindowDimensions, type GestureResponderEvent, type StyleProp, type ViewStyle } from "react-native";
import { C, F, Txt } from "../ui";

export type SwipeDir = 1 | -1; // 1 = right (yes), -1 = left (no)
export type SwipeableHandle = { swipe: (dir: SwipeDir) => void };

const THRESHOLD = 110; // px of horizontal drag that counts as a decision

/**
 * A card you can fling right (yes) or left (no). Shows a stamp while dragging.
 * Buttons outside the card can trigger the same animation via `ref.swipe(dir)`.
 */
export default function Swipeable({
  ref,
  onSwipe,
  yesLabel,
  noLabel,
  style,
  children,
}: {
  ref?: Ref<SwipeableHandle>;
  onSwipe: (dir: SwipeDir) => void;
  yesLabel: string;
  noLabel: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const { width: winW } = useWindowDimensions();
  const [pan] = useState(() => new Animated.Value(0));
  const startX = useRef(0);
  const [leaving, setLeaving] = useState(false);

  const decide = (dir: SwipeDir) => {
    if (leaving) return;
    setLeaving(true);
    Animated.timing(pan, { toValue: dir * (winW + 200), duration: 220, useNativeDriver: true }).start(() => onSwipe(dir));
  };
  useImperativeHandle(ref, () => ({ swipe: decide }));

  const handlers = {
    onStartShouldSetResponder: () => !leaving,
    onMoveShouldSetResponder: () => !leaving,
    onResponderGrant: (e: GestureResponderEvent) => {
      startX.current = e.nativeEvent.pageX;
    },
    onResponderMove: (e: GestureResponderEvent) => {
      pan.setValue(e.nativeEvent.pageX - startX.current);
    },
    onResponderRelease: (e: GestureResponderEvent) => {
      const dx = e.nativeEvent.pageX - startX.current;
      if (dx > THRESHOLD) decide(1);
      else if (dx < -THRESHOLD) decide(-1);
      else Animated.spring(pan, { toValue: 0, useNativeDriver: true, friction: 6 }).start();
    },
    onResponderTerminate: () => {
      Animated.spring(pan, { toValue: 0, useNativeDriver: true }).start();
    },
  };

  const rotate = pan.interpolate({ inputRange: [-300, 0, 300], outputRange: ["-12deg", "0deg", "12deg"] });
  const yesOpacity = pan.interpolate({ inputRange: [0, THRESHOLD], outputRange: [0, 1], extrapolate: "clamp" });
  const noOpacity = pan.interpolate({ inputRange: [-THRESHOLD, 0], outputRange: [1, 0], extrapolate: "clamp" });

  return (
    <Animated.View {...handlers} style={[style, { transform: [{ translateX: pan }, { rotate }] }]}>
      {children}
      <Animated.View pointerEvents="none" style={[styles.stamp, styles.yes, { opacity: yesOpacity }]}>
        <Txt style={[styles.stampText, { color: C.green }]}>{yesLabel}</Txt>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.stamp, styles.no, { opacity: noOpacity }]}>
        <Txt style={[styles.stampText, { color: C.red }]}>{noLabel}</Txt>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stamp: { position: "absolute", top: 28, borderWidth: 4, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 2, backgroundColor: "rgba(255,255,255,0.9)" },
  yes: { left: 24, borderColor: C.green, transform: [{ rotate: "-12deg" }] },
  no: { right: 24, borderColor: C.red, transform: [{ rotate: "12deg" }] },
  stampText: { fontFamily: F.black, fontSize: 30, letterSpacing: 2 },
});
