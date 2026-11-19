import { useMemo, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import { itemColor } from "../inventory";
import { C, F } from "../ui";
import type { Box, Frame, Item, Sighting } from "../types";

type Props = {
  frame: Frame;
  items: Item[];
  width: number; // display width
  drawMode: boolean;
  selectedSightingId: string | null;
  onSelect: (item: Item, sighting: Sighting) => void;
  onDrawn: (box: Box) => void;
};

const MIN_BOX_PX = 16;

/** Shows one captured frame with every item's bounding box drawn on top. */
export default function FrameView({ frame, items, width, drawMode, selectedSightingId, onSelect, onDrawn }: Props) {
  const height = (width * frame.height) / frame.width;
  const toPx = (b: Box) => ({
    left: (b.x_min / 1000) * width,
    top: (b.y_min / 1000) * height,
    width: ((b.x_max - b.x_min) / 1000) * width,
    height: ((b.y_max - b.y_min) / 1000) * height,
  });

  const boxes = useMemo(
    () =>
      items.flatMap((item) =>
        item.sightings.filter((s) => s.frameId === frame.id).map((s) => ({ item, sighting: s })),
      ),
    [items, frame.id],
  );

  // ----- draw-a-box gesture -----
  // Start point in view coords + the page coords at touch-down, so moves can be
  // computed from pageX/pageY deltas (locationX is unreliable once the finger moves).
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const start = useRef({ x: 0, y: 0, pageX: 0, pageY: 0 });

  const drawHandlers = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderGrant: (e: GestureResponderEvent) => {
      const { locationX, locationY, pageX, pageY } = e.nativeEvent;
      start.current = { x: locationX, y: locationY, pageX, pageY };
      setDraft({ x: locationX, y: locationY, w: 0, h: 0 });
    },
    onResponderMove: (e: GestureResponderEvent) => {
      const s = start.current;
      const x2 = Math.max(0, Math.min(width, s.x + e.nativeEvent.pageX - s.pageX));
      const y2 = Math.max(0, Math.min(height, s.y + e.nativeEvent.pageY - s.pageY));
      setDraft({ x: Math.min(s.x, x2), y: Math.min(s.y, y2), w: Math.abs(x2 - s.x), h: Math.abs(y2 - s.y) });
    },
    onResponderRelease: () => {
      if (draft && draft.w >= MIN_BOX_PX && draft.h >= MIN_BOX_PX) {
        onDrawn({
          x_min: (draft.x / width) * 1000,
          y_min: (draft.y / height) * 1000,
          x_max: ((draft.x + draft.w) / width) * 1000,
          y_max: ((draft.y + draft.h) / height) * 1000,
        });
      }
      setDraft(null);
    },
    onResponderTerminate: () => setDraft(null),
  };

  return (
    <View style={{ width, height }}>
      <Image source={{ uri: frame.uri }} style={{ width, height }} />

      {boxes.map(({ item, sighting }) => {
        const color = itemColor(item.id);
        const selected = sighting.id === selectedSightingId;
        const low = !item.userEdited && item.confidence < 0.6;
        const px = toPx(sighting.box);
        return (
          <Pressable
            key={sighting.id}
            disabled={drawMode}
            onPress={() => onSelect(item, sighting)}
            style={[
              styles.box,
              px,
              { borderColor: color, borderStyle: low ? "dashed" : "solid", borderWidth: selected ? 5 : 3 },
              selected && { backgroundColor: "rgba(255,255,255,0.15)" },
            ]}
          >
            <View style={[styles.label, { backgroundColor: color }]}>
              <Text style={styles.labelText} numberOfLines={1}>
                {low ? "? " : ""}
                {item.name}
              </Text>
            </View>
          </Pressable>
        );
      })}

      {drawMode && (
        <View style={StyleSheet.absoluteFill} {...drawHandlers}>
          {draft && (
            <View
              pointerEvents="none"
              style={[styles.draft, { left: draft.x, top: draft.y, width: draft.w, height: draft.h }]}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: "absolute", borderRadius: 10 },
  label: { position: "absolute", top: -3, left: -3, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, maxWidth: 170 },
  labelText: { color: "#fff", fontSize: 12, fontFamily: F.bold },
  draft: { position: "absolute", borderWidth: 3, borderColor: C.blue, borderStyle: "dashed", borderRadius: 10, backgroundColor: "rgba(28,176,246,0.2)" },
});
