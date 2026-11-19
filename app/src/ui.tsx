import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type TextProps, type ViewStyle } from "react-native";

// ---------------------------------------------------------------------------
// Playful, chunky design system: bright flat colors, rounded type, 3D buttons.
// ---------------------------------------------------------------------------

export const C = {
  green: "#58CC02",
  greenShadow: "#58A700",
  greenLight: "#D7FFB8",
  blue: "#1CB0F6",
  blueShadow: "#1899D6",
  blueLight: "#DDF4FF",
  red: "#FF4B4B",
  redShadow: "#EA2B2B",
  redLight: "#FFDFE0",
  gold: "#FFC800",
  goldShadow: "#E5B400",
  goldLight: "#FFF4CC",
  orange: "#FF9600",
  purple: "#CE82FF",
  text: "#4B4B4B",
  muted: "#AFAFAF",
  border: "#E5E5E5",
  field: "#F7F7F7",
  bg: "#FFFFFF",
  white: "#FFFFFF",
};

export const F = {
  regular: "Nunito_600SemiBold",
  bold: "Nunito_800ExtraBold",
  black: "Nunito_900Black",
};

// ---------- text ----------

type TxtVariant = "title" | "h2" | "body" | "bold" | "caption" | "label";

export function Txt({ variant = "body", style, ...rest }: TextProps & { variant?: TxtVariant }) {
  return <Text {...rest} style={[txt[variant], style]} />;
}

const txt = StyleSheet.create({
  title: { fontFamily: F.black, fontSize: 24, color: C.text },
  h2: { fontFamily: F.black, fontSize: 19, color: C.text },
  body: { fontFamily: F.regular, fontSize: 15, color: C.text },
  bold: { fontFamily: F.bold, fontSize: 15, color: C.text },
  caption: { fontFamily: F.regular, fontSize: 13, color: C.muted },
  label: { fontFamily: F.bold, fontSize: 13, color: C.muted, letterSpacing: 0.8, textTransform: "uppercase" },
});

// ---------- 3D button ----------

type ButtonVariant = "primary" | "secondary" | "danger" | "outline" | "outlineDanger";

const VARIANTS: Record<ButtonVariant, { face: string; shadow: string; text: string; border?: string }> = {
  primary: { face: C.green, shadow: C.greenShadow, text: C.white },
  secondary: { face: C.blue, shadow: C.blueShadow, text: C.white },
  danger: { face: C.red, shadow: C.redShadow, text: C.white },
  outline: { face: C.white, shadow: C.border, text: C.blue, border: C.border },
  outlineDanger: { face: C.white, shadow: C.border, text: C.red, border: C.border },
};

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
  small,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const v = disabled ? { face: C.border, shadow: "#CFCFCF", text: C.muted, border: undefined } : VARIANTS[variant];
  const depth = small ? 3 : 4;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      hitSlop={4}
      style={({ pressed }) => [
        btn.base,
        small && btn.small,
        {
          backgroundColor: v.face,
          borderColor: v.border ?? v.face,
          borderWidth: v.border ? 2 : 0,
          borderBottomColor: v.shadow,
          borderBottomWidth: pressed ? (v.border ? 2 : 0) : depth,
          marginTop: pressed ? depth - (v.border ? 2 : 0) : 0,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.text} />
      ) : (
        <Text style={[btn.text, small && btn.textSmall, { color: v.text }]} numberOfLines={1}>
          {title.toUpperCase()}
        </Text>
      )}
    </Pressable>
  );
}

const btn = StyleSheet.create({
  base: { borderRadius: 16, paddingVertical: 13, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", minHeight: 52 },
  small: { borderRadius: 12, paddingVertical: 7, paddingHorizontal: 12, minHeight: 36 },
  text: { fontFamily: F.bold, fontSize: 16, letterSpacing: 0.8 },
  textSmall: { fontSize: 13 },
});

// ---------- card ----------

export function Card({ children, style, tint }: { children: ReactNode; style?: StyleProp<ViewStyle>; tint?: { bg: string; border: string } }) {
  return (
    <View style={[card.base, tint && { backgroundColor: tint.bg, borderColor: tint.border }, style]}>{children}</View>
  );
}

const card = StyleSheet.create({
  base: { backgroundColor: C.white, borderWidth: 2, borderBottomWidth: 4, borderColor: C.border, borderRadius: 16, padding: 14 },
});

// ---------- progress bar ----------

export function ProgressBar({ value, color = C.green, track = C.border }: { value: number; color?: string; track?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View style={[pb.track, { backgroundColor: track }]}>
      {pct > 0 && (
        <View style={[pb.fill, { width: `${Math.max(pct, 8)}%`, backgroundColor: color }]}>
          <View style={pb.shine} />
        </View>
      )}
    </View>
  );
}

const pb = StyleSheet.create({
  track: { height: 16, borderRadius: 8, overflow: "hidden" },
  fill: { height: 16, borderRadius: 8 },
  shine: { position: "absolute", top: 4, left: 8, right: 8, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.35)" },
});

// ---------- pill ----------

export function Pill({ text, bg, color }: { text: string; bg: string; color: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start" }}>
      <Text style={{ fontFamily: F.bold, fontSize: 12, color, letterSpacing: 0.5 }}>{text.toUpperCase()}</Text>
    </View>
  );
}

// ---------- misc ----------

const CATEGORY_EMOJI: Record<string, string> = {
  produce: "🥦",
  dairy: "🥛",
  meat: "🥩",
  seafood: "🐟",
  eggs: "🥚",
  grains: "🍞",
  condiments: "🧂",
  beverages: "🥤",
  leftovers: "🍱",
  frozen: "🧊",
  other: "🍽️",
};

export const categoryEmoji = (category: string) => CATEGORY_EMOJI[category] ?? "🍽️";

// ---------- brand ----------

/** "Take Me Out" with the small "of your fridge" tagline set like a subscript. */
export function Brand({ size = 28, color = C.green }: { size?: number; color?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", flexWrap: "wrap" }} accessibilityRole="header" accessibilityLabel="Take Me Out of your fridge">
      <Text style={{ fontFamily: F.black, fontSize: size, color, lineHeight: size * 1.15 }}>Take Me Out</Text>
      <Text style={{ fontFamily: F.bold, fontSize: Math.round(size * 0.42), color: C.muted, marginLeft: 5, marginBottom: -size * 0.06, lineHeight: size * 0.6 }}>
        of your fridge
      </Text>
    </View>
  );
}
