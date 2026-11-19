import { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { itemColor } from "../inventory";
import { Button, C, F, Txt } from "../ui";
import type { Item } from "../types";

export type EditTarget =
  | { kind: "sighting"; item: Item; sightingId: string } // tapped a box
  | { kind: "item"; item: Item } // tapped a row in the list
  | { kind: "newBox" } // drew a new box
  | { kind: "newItem" }; // added an item with no photo

type Props = {
  target: EditTarget | null;
  items: Item[];
  onClose: () => void;
  onSave: (name: string, quantity: string) => void; // rename / create
  onPickExisting?: (itemId: string) => void; // "this is actually X"
  onSplit?: (name: string, quantity: string) => void; // "this box is something else"
  onRemoveBox?: () => void;
  onRemoveItem?: () => void;
};

export default function EditSheet({ target, items, onClose, onSave, onPickExisting, onSplit, onRemoveBox, onRemoveItem }: Props) {
  // Parent mounts a fresh sheet per target, so initial state comes straight from props.
  const current = target && "item" in target ? target.item : null;
  const [name, setName] = useState(current?.name ?? "");
  const [quantity, setQuantity] = useState(current?.quantity ?? "");
  const [picking, setPicking] = useState(false);

  if (!target) return null;

  const title = {
    sighting: "Fix this one",
    item: "Edit item",
    newBox: "What's in this box?",
    newItem: "Add an item",
  }[target.kind];

  const others = items.filter((i) => i.id !== current?.id);
  const nameChanged = !!current && !!name.trim() && name.trim() !== current.name;
  const canPick = (target.kind === "sighting" || target.kind === "newBox" || target.kind === "item") && !!onPickExisting && others.length > 0;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Txt variant="title">{title}</Txt>
          {current && !current.userEdited && (
            <Txt variant="caption">
              AI was {Math.round(current.confidence * 100)}% sure · seen in {current.sightings.length} photo box{current.sightings.length === 1 ? "" : "es"}
            </Txt>
          )}

          <Txt variant="label" style={styles.fieldLabel}>Name</Txt>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. greek yogurt"
            placeholderTextColor={C.muted}
            autoFocus={!current}
          />
          <Txt variant="label" style={styles.fieldLabel}>Quantity</Txt>
          <TextInput style={styles.input} value={quantity} onChangeText={setQuantity} placeholder="e.g. 2, half carton" placeholderTextColor={C.muted} />

          {target.kind === "sighting" && nameChanged && onSplit && (
            <Txt variant="caption">Rename it everywhere, or only change this one box?</Txt>
          )}

          <View style={styles.row}>
            <Button
              title={current ? (nameChanged ? "Rename" : "Save") : "Add"}
              disabled={!name.trim()}
              onPress={() => onSave(name, quantity)}
              style={{ flex: 1 }}
            />
            {target.kind === "sighting" && nameChanged && onSplit && (
              <Button title="Only this box" variant="outline" onPress={() => onSplit(name, quantity)} style={{ flex: 1 }} />
            )}
          </View>

          {canPick && (
            <>
              <Pressable onPress={() => setPicking((p) => !p)} hitSlop={6}>
                <Txt style={styles.link}>
                  {target.kind === "newBox" ? "It's already in my list…" : target.kind === "item" ? "Merge into another item…" : "This is actually…"}
                </Txt>
              </Pressable>
              {picking && (
                <ScrollView style={{ maxHeight: 170 }} contentContainerStyle={styles.pickList}>
                  {others.map((i) => (
                    <Pressable key={i.id} style={styles.pick} onPress={() => onPickExisting!(i.id)}>
                      <View style={[styles.pickDot, { backgroundColor: itemColor(i.id) }]} />
                      <Txt variant="bold" style={{ fontSize: 14 }}>{i.name}</Txt>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </>
          )}

          {(onRemoveBox || onRemoveItem) && (
            <View style={styles.row}>
              {onRemoveBox && <Button title="Not food" variant="outlineDanger" small onPress={onRemoveBox} style={{ flex: 1 }} />}
              {onRemoveItem && <Button title="Delete item" variant="outlineDanger" small onPress={onRemoveItem} style={{ flex: 1 }} />}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { backgroundColor: C.white, padding: 20, paddingBottom: 36, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: 8 },
  handle: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: C.border, marginBottom: 6 },
  fieldLabel: { marginTop: 6 },
  input: {
    backgroundColor: C.field, borderWidth: 2, borderColor: C.border, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, fontFamily: F.bold, color: C.text,
  },
  row: { flexDirection: "row", gap: 10, marginTop: 8 },
  link: { fontFamily: F.bold, color: C.blue, fontSize: 14, letterSpacing: 0.6, textTransform: "uppercase", marginTop: 10 },
  pickList: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingVertical: 6 },
  pick: {
    flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 2, borderBottomWidth: 3, borderColor: C.border,
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6,
  },
  pickDot: { width: 10, height: 10, borderRadius: 5 },
});
