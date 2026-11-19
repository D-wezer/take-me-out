import { useRef } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import FrameView from "./FrameView";
import Swipeable, { type SwipeableHandle } from "./Swipeable";
import { normalizeName } from "../inventory";
import { C, F, Txt } from "../ui";
import type { Detection, Frame, Item } from "../types";

type Props = {
  frame: Frame;
  detections: Detection[];
  items: Item[]; // current inventory, to tell new items from ones seen again
  onKeep: () => void;
  onSkip: () => void;
};

/** Review one freshly scanned frame: swipe right to keep it, left to skip it. */
export default function SwipeCard({ frame, detections, items, onKeep, onSkip }: Props) {
  const { width: winW, height: winH } = useWindowDimensions();
  const swipeRef = useRef<SwipeableHandle>(null);

  // Fit the photo: full card width, but never taller than ~half the screen.
  const imgW = Math.min(winW - 64, (winH * 0.5 * frame.width) / frame.height);

  // Preview items built from this frame's detections (existing ids keep their colors).
  const known = new Set(items.map((i) => i.id));
  const knownNames = new Set(items.map((i) => normalizeName(i.name)));
  const preview: Item[] = detections.map((d, i) => ({
    id: d.existing_id ?? `new-${i}-${d.name}`,
    name: d.name,
    quantity: d.quantity,
    category: d.category,
    confidence: d.confidence,
    userEdited: false,
    sightings: [{ id: `s${i}`, frameId: frame.id, box: d.box, source: "ai" }],
  }));
  const isNew = (d: Detection) => !(d.existing_id && known.has(d.existing_id)) && !knownNames.has(normalizeName(d.name));
  const fresh = detections.filter(isNew);
  const again = detections.length - fresh.length;

  return (
    <View style={styles.backdrop}>
      <Txt variant="bold" style={styles.instructions}>Swipe right to keep · left to skip</Txt>

      <Swipeable ref={swipeRef} yesLabel="KEEP" noLabel="SKIP" onSwipe={(dir) => (dir === 1 ? onKeep() : onSkip())} style={styles.card}>
        <View pointerEvents="none" style={[styles.photo, { width: imgW }]}>
          <FrameView frame={frame} items={preview} width={imgW} drawMode={false} selectedSightingId={null} onSelect={() => {}} onDrawn={() => {}} />
        </View>
        <View style={styles.summary}>
          <Txt variant="h2">
            {detections.length ? `${detections.length} item${detections.length === 1 ? "" : "s"} in this shot` : "Nothing found here"}
          </Txt>
          <Txt variant="caption" numberOfLines={2}>
            {fresh.length ? `New: ${fresh.map((d) => d.name).join(", ")}` : "No new items"}
            {again ? ` · ${again} seen before` : ""}
          </Txt>
        </View>
      </Swipeable>

      <View style={styles.buttons}>
        <Pressable onPress={() => swipeRef.current?.swipe(-1)} style={[styles.round, { borderColor: C.red }]} accessibilityLabel="Skip this scan" hitSlop={8}>
          <Txt style={[styles.roundText, { color: C.red }]}>✕</Txt>
        </Pressable>
        <Pressable onPress={() => swipeRef.current?.swipe(1)} style={[styles.round, { borderColor: C.green }]} accessibilityLabel="Keep this scan" hitSlop={8}>
          <Txt style={[styles.roundText, { color: C.green }]}>✓</Txt>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", gap: 16, padding: 16 },
  instructions: { color: C.white },
  card: { backgroundColor: C.white, borderRadius: 24, borderWidth: 2, borderBottomWidth: 5, borderColor: C.border, padding: 14, gap: 10, alignItems: "center" },
  photo: { borderRadius: 16, overflow: "hidden" },
  summary: { alignSelf: "stretch", gap: 2 },
  buttons: { flexDirection: "row", gap: 40 },
  round: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, borderBottomWidth: 5, backgroundColor: C.white, alignItems: "center", justifyContent: "center" },
  roundText: { fontFamily: F.black, fontSize: 28, lineHeight: 34 },
});
