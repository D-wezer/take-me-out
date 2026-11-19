import { useCallback, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import FrameView from "../components/FrameView";
import EditSheet, { type EditTarget } from "../components/EditSheet";
import { dedupe } from "../api";
import { confirmRestart } from "../confirmRestart";
import {
  addSightingToItem,
  addUserItem,
  applyDedupe,
  itemColor,
  itemTint,
  mergeItems,
  reassignSighting,
  removeItem,
  removeSighting,
  splitSighting,
  updateItem,
} from "../inventory";
import { Button, C, Card, F, Pill, Txt, categoryEmoji } from "../ui";
import type { Box, Frame, Item, Sighting } from "../types";

type Props = {
  items: Item[];
  frames: Frame[];
  onItems: (fn: (prev: Item[]) => Item[]) => void;
  onBack: () => void;
  onNext: () => void;
  onRestart: () => void;
};

const PAD = 16;

export default function ReviewScreen({ items, frames, onItems, onBack, onNext, onRestart }: Props) {
  const { width } = useWindowDimensions();
  const [frameIdx, setFrameIdx] = useState(Math.max(0, frames.length - 1));
  const [drawMode, setDrawMode] = useState(false);
  const [target, setTarget] = useState<EditTarget | null>(null);
  const [pendingBox, setPendingBox] = useState<Box | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const frame = frames[frameIdx];
  const countIn = (f: Frame) => items.reduce((n, i) => n + i.sightings.filter((s) => s.frameId === f.id).length, 0);
  const toCheck = items.filter((i) => !i.userEdited && i.confidence < 0.6).length;

  const close = () => {
    setTarget(null);
    setPendingBox(null);
  };
  const apply = (fn: (prev: Item[]) => Item[]) => {
    onItems(fn);
    close();
  };

  const onSelect = useCallback((item: Item, s: Sighting) => setTarget({ kind: "sighting", item, sightingId: s.id }), []);
  const onDrawn = useCallback((box: Box) => {
    setPendingBox(box);
    setDrawMode(false);
    setTarget({ kind: "newBox" });
  }, []);

  const jumpTo = (item: Item) => {
    const s = item.sightings[item.sightings.length - 1];
    const idx = s ? frames.findIndex((f) => f.id === s.frameId) : -1;
    if (idx >= 0) setFrameIdx(idx);
  };

  async function cleanUp() {
    setCleaning(true);
    setNote(null);
    try {
      const { groups } = await dedupe(items);
      onItems((prev) => applyDedupe(prev, groups));
      const n = groups.reduce((sum, g) => sum + g.merge_ids.length, 0);
      setNote(n ? `✨ Merged ${n} duplicate${n === 1 ? "" : "s"}` : "👍 No duplicates found");
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setCleaning(false);
    }
  }

  const selectedSightingId = target?.kind === "sighting" ? target.sightingId : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.iconBtn}>
          <Txt style={styles.iconText}>‹</Txt>
        </Pressable>
        <Txt variant="h2">Check your haul</Txt>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} scrollEnabled={!drawMode}>
        {/* celebration banner */}
        {items.length > 0 && (
          <Card tint={{ bg: C.greenLight, border: C.green }} style={styles.banner}>
            <Txt style={{ fontSize: 34 }}>🎉</Txt>
            <View style={{ flex: 1 }}>
              <Txt variant="h2" style={{ color: C.greenShadow }}>Nice! {items.length} ingredient{items.length === 1 ? "" : "s"} found</Txt>
              <Txt variant="body" style={{ color: C.greenShadow }}>
                {toCheck ? `${toCheck} could use a quick check 👀` : "Tap any box to fix a mistake."}
              </Txt>
            </View>
          </Card>
        )}

        {/* frame strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {frames.map((f, i) => (
            <Pressable key={f.id} onPress={() => setFrameIdx(i)} style={[styles.thumb, i === frameIdx && styles.thumbActive]}>
              <Image source={{ uri: f.uri }} style={styles.thumbImg} />
              <View style={styles.thumbBadge}>
                <Txt style={styles.thumbBadgeText}>{countIn(f)}</Txt>
              </View>
            </Pressable>
          ))}
        </ScrollView>

        {frame ? (
          <View style={styles.frameWrap}>
            <FrameView
              frame={frame}
              items={items}
              width={width - PAD * 2 - 4}
              drawMode={drawMode}
              selectedSightingId={selectedSightingId}
              onSelect={onSelect}
              onDrawn={onDrawn}
            />
          </View>
        ) : (
          <Txt variant="caption" style={{ padding: PAD }}>No photos captured.</Txt>
        )}

        <View style={styles.section}>
          <Button
            title={drawMode ? "Drag on the photo · tap to cancel" : "✏️ Draw a missed item"}
            variant={drawMode ? "secondary" : "outline"}
            onPress={() => setDrawMode((d) => !d)}
            disabled={!frame}
          />
          <Txt variant="caption" style={{ textAlign: "center" }}>Tap a box to fix it · dashed = not sure</Txt>
        </View>

        {/* item list */}
        <View style={styles.listHeader}>
          <Txt variant="h2">Your ingredients</Txt>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button title="Merge dupes" variant="outline" small onPress={cleanUp} loading={cleaning} disabled={items.length < 2} />
            <Button title="＋ Add" variant="outline" small onPress={() => setTarget({ kind: "newItem" })} />
          </View>
        </View>
        {note && <Txt variant="bold" style={{ paddingHorizontal: PAD, marginBottom: 8, color: C.muted }}>{note}</Txt>}

        <View style={{ paddingHorizontal: PAD, gap: 10 }}>
          {items.map((i) => {
            const unsure = !i.userEdited && i.confidence < 0.6;
            return (
              <Pressable
                key={i.id}
                onPress={() => {
                  jumpTo(i);
                  setTarget({ kind: "item", item: i });
                }}
              >
                {({ pressed }) => (
                  <Card style={[styles.itemRow, pressed && { transform: [{ translateY: 2 }], borderBottomWidth: 2 }]}>
                    <View style={[styles.emojiTile, { backgroundColor: itemTint(i.id), borderColor: itemColor(i.id) }]}>
                      <Txt style={{ fontSize: 24 }}>{categoryEmoji(i.category)}</Txt>
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt variant="bold" style={{ fontSize: 17 }} numberOfLines={1}>{i.name}</Txt>
                      <Txt variant="caption">
                        {i.quantity || "—"} · {i.sightings.length} box{i.sightings.length === 1 ? "" : "es"}
                      </Txt>
                    </View>
                    {unsure && <Pill text="Check" bg={C.goldLight} color="#B78A00" />}
                    {i.userEdited && <Pill text="Edited" bg={C.blueLight} color={C.blueShadow} />}
                    <Txt style={styles.chevron}>›</Txt>
                  </Card>
                )}
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.section, { marginTop: 8 }]}>
          <Button
            title="↺ Start a new scan"
            variant="outlineDanger"
            small
            onPress={() => confirmRestart(frames.length > 0 || items.length > 0, onRestart)}
          />
        </View>
      </ScrollView>

      {/* sticky footer */}
      <View style={styles.footer}>
        <Button title="Find meals 💘" disabled={!items.length} onPress={onNext} />
      </View>

      {target && (
        <EditSheet
          key={target.kind === "sighting" ? target.sightingId : target.kind === "item" ? target.item.id : target.kind}
          target={target}
          items={items}
          onClose={close}
          onSave={(name, quantity) => {
            if (target.kind === "sighting" || target.kind === "item") apply((p) => updateItem(p, target.item.id, { name: name.trim(), quantity: quantity.trim() }));
            else if (target.kind === "newBox" && pendingBox && frame) apply((p) => addUserItem(p, name, quantity, frame.id, pendingBox));
            else if (target.kind === "newItem") apply((p) => addUserItem(p, name, quantity));
          }}
          onSplit={target.kind === "sighting" ? (name, quantity) => apply((p) => splitSighting(p, target.sightingId, name, quantity)) : undefined}
          onPickExisting={(id) => {
            if (target.kind === "sighting") apply((p) => reassignSighting(p, target.sightingId, id));
            else if (target.kind === "newBox" && pendingBox && frame) apply((p) => addSightingToItem(p, id, frame.id, pendingBox));
            else if (target.kind === "item") apply((p) => mergeItems(p, target.item.id, id));
          }}
          onRemoveBox={target.kind === "sighting" ? () => apply((p) => removeSighting(p, target.sightingId)) : undefined}
          onRemoveItem={target.kind === "sighting" || target.kind === "item" ? () => apply((p) => removeItem(p, target.item.id)) : undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingTop: 52 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: PAD, paddingBottom: 8 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  iconText: { fontFamily: F.black, fontSize: 34, color: C.muted, lineHeight: 38 },
  banner: { marginHorizontal: PAD, marginTop: 4, flexDirection: "row", alignItems: "center", gap: 12 },
  strip: { gap: 10, paddingHorizontal: PAD, paddingVertical: 12 },
  thumb: { borderRadius: 14, borderWidth: 3, borderColor: C.border, overflow: "hidden" },
  thumbActive: { borderColor: C.blue },
  thumbImg: { width: 58, height: 76 },
  thumbBadge: { position: "absolute", right: 3, bottom: 3, backgroundColor: C.blue, borderRadius: 8, paddingHorizontal: 6 },
  thumbBadgeText: { color: C.white, fontFamily: F.bold, fontSize: 12 },
  frameWrap: { marginHorizontal: PAD, borderRadius: 18, borderWidth: 2, borderColor: C.border, overflow: "hidden" },
  section: { paddingHorizontal: PAD, paddingTop: 14, gap: 8 },
  listHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: PAD, paddingTop: 22, paddingBottom: 10 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  emojiTile: { width: 48, height: 48, borderRadius: 14, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  chevron: { fontFamily: F.black, fontSize: 24, color: C.border },
  footer: { padding: PAD, paddingBottom: 30, borderTopWidth: 2, borderTopColor: C.border, backgroundColor: C.white },
});
