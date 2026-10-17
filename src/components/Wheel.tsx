import { useEffect, useRef, useState } from "react";
import {
  Animated,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { colors, fonts } from "../theme/tokens";

const ITEM = 44;
const VISIBLE = 5;

/**
 * A scroll wheel: drag and it snaps to one value in the middle row, which is lightly
 * shaded; values fade and shrink away from it.
 */
export function Wheel({
  values,
  value,
  onChange,
  label,
  width = 64,
}: {
  values: string[];
  value: string;
  onChange: (v: string) => void;
  label: string;
  width?: number;
}) {
  const scroll = useRef<ScrollView>(null);
  const start = Math.max(0, values.indexOf(value));
  // Start the fade at the chosen row; a programmatic scroll may not report back.
  const [y] = useState(() => new Animated.Value(start * ITEM));
  const [placed, setPlaced] = useState(false);

  // Follow outside changes (e.g. the sheet reopening) once laid out.
  useEffect(() => {
    if (!placed) return;
    const at = Math.max(0, values.indexOf(value)) * ITEM;
    scroll.current?.scrollTo({ y: at, animated: false });
    y.setValue(at);
  }, [value, values, placed, y]);

  function settle(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.max(0, Math.min(values.length - 1, Math.round(e.nativeEvent.contentOffset.y / ITEM)));
    if (values[i] !== value) onChange(values[i]);
  }

  return (
    <View
      style={{ width, height: ITEM * VISIBLE }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: value }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => {
        const i = values.indexOf(value) + (e.nativeEvent.actionName === "increment" ? 1 : -1);
        if (i >= 0 && i < values.length) onChange(values[i]);
      }}
    >
      <View pointerEvents="none" style={s.selection} />
      <Animated.ScrollView
        ref={scroll}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM}
        decelerationRate="fast"
        nestedScrollEnabled
        contentContainerStyle={{ paddingVertical: ITEM * Math.floor(VISIBLE / 2) }}
        contentOffset={{ x: 0, y: start * ITEM }}
        onLayout={() => {
          scroll.current?.scrollTo({ y: start * ITEM, animated: false });
          setPlaced(true);
        }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={(e) => {
          // A slow release has no momentum phase.
          if (Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.05) settle(e);
        }}
      >
        {values.map((v, i) => {
          const near = [(i - 2) * ITEM, (i - 1) * ITEM, i * ITEM, (i + 1) * ITEM, (i + 2) * ITEM];
          return (
            <Animated.Text
              key={v}
              style={[
                s.item,
                {
                  opacity: y.interpolate({ inputRange: near, outputRange: [0.15, 0.4, 1, 0.4, 0.15], extrapolate: "clamp" }),
                  transform: [
                    { scale: y.interpolate({ inputRange: near, outputRange: [0.8, 0.9, 1, 0.9, 0.8], extrapolate: "clamp" }) },
                  ],
                },
              ]}
            >
              {v}
            </Animated.Text>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  selection: {
    position: "absolute",
    left: 0,
    right: 0,
    top: ITEM * Math.floor(VISIBLE / 2),
    height: ITEM,
    borderRadius: 10,
    backgroundColor: colors.bandFaint,
  },
  item: {
    height: ITEM,
    lineHeight: ITEM,
    textAlign: "center",
    fontFamily: fonts.serif,
    fontSize: 24,
    color: colors.ink,
    includeFontPadding: false,
  },
});
