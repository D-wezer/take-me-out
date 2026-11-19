import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Accelerometer } from "expo-sensors";
import { scanFrame } from "../api";
import { confirmRestart } from "../confirmRestart";
import { itemColor, mergeDetections, uid } from "../inventory";
import { Brand, Button, C, ProgressBar, Txt, categoryEmoji } from "../ui";
import SwipeCard from "../components/SwipeCard";
import type { Detection, Frame, Item } from "../types";

// Tuning knobs
const CAPTURE_INTERVAL_MS = 1500; // min gap between frames sent
const MAX_FRAMES = 15; // per session
const FRAME_WIDTH = 768; // px; enough for labels, keeps calls fast
const STEADY_THRESHOLD = 0.04; // accelerometer delta (g) under which the phone counts as steady

type Props = {
  items: Item[];
  frames: Frame[];
  onItems: (fn: (prev: Item[]) => Item[]) => void;
  onFrame: (f: Frame) => void;
  onDone: () => void;
  onRestart: () => void;
};

export default function ScanScreen({ items, frames, onItems, onFrame, onDone, onRestart }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [scanning, setScanning] = useState(false);
  const [inFlight, setInFlight] = useState(false);
  const [steady, setSteady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A scanned frame waiting for the user to keep (swipe right) or skip (swipe left).
  const [pending, setPending] = useState<{ frame: Frame; detections: Detection[] } | null>(null);
  const pendingRef = useRef(false);
  useEffect(() => {
    pendingRef.current = pending !== null;
  }, [pending]);

  // Refs so the capture loop reads fresh values without re-subscribing.
  const itemsRef = useRef(items);
  const framesRef = useRef(frames.length);
  useEffect(() => {
    itemsRef.current = items;
    framesRef.current = frames.length;
  }, [items, frames.length]);
  const inFlightRef = useRef(false);
  const steadyRef = useRef(false);
  const lastCaptureRef = useRef(0);

  // False once this screen unmounts (e.g. restart), so a frame still in flight
  // doesn't land in the new, empty scan.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // --- steadiness from accelerometer (smoothed change between samples) ---
  useEffect(() => {
    Accelerometer.setUpdateInterval(100);
    let prev: { x: number; y: number; z: number } | null = null;
    let ema = 1;
    const sub = Accelerometer.addListener((a) => {
      if (prev) {
        const delta = Math.hypot(a.x - prev.x, a.y - prev.y, a.z - prev.z);
        ema = ema * 0.7 + delta * 0.3;
        const isSteady = ema < STEADY_THRESHOLD;
        if (isSteady !== steadyRef.current) {
          steadyRef.current = isSteady;
          setSteady(isSteady);
        }
      }
      prev = a;
    });
    return () => sub.remove();
  }, []);

  // --- capture loop ---
  useEffect(() => {
    if (!scanning) return;
    const tick = setInterval(async () => {
      const now = Date.now();
      if (
        pendingRef.current ||
        inFlightRef.current ||
        !steadyRef.current ||
        now - lastCaptureRef.current < CAPTURE_INTERVAL_MS ||
        framesRef.current >= MAX_FRAMES ||
        !cameraRef.current
      ) {
        if (framesRef.current >= MAX_FRAMES) setScanning(false);
        return;
      }
      lastCaptureRef.current = now;
      inFlightRef.current = true;
      setInFlight(true);
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, shutterSound: false });
        const ctx = ImageManipulator.manipulate(photo.uri).resize({ width: FRAME_WIDTH });
        const ref = await ctx.renderAsync();
        const img = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.6, base64: true });
        if (!img.base64) throw new Error("No image data");

        const frame: Frame = { id: uid(), uri: img.uri, width: img.width, height: img.height, createdAt: now };
        const { detections } = await scanFrame(img.base64, itemsRef.current);
        if (!aliveRef.current) return;
        // Pause on this frame; nothing is merged until the user keeps it.
        pendingRef.current = true;
        setPending({ frame, detections });
        setError(null);
      } catch (e) {
        if (aliveRef.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        inFlightRef.current = false;
        setInFlight(false);
      }
    }, 250);
    return () => clearInterval(tick);
  }, [scanning, onFrame, onItems]);

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.green} />
      </View>
    );
  }
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Brand size={34} />
        <Txt style={styles.bigEmoji}>📸</Txt>
        <Txt variant="title" style={{ textAlign: "center" }}>Let&apos;s peek in your fridge!</Txt>
        <Txt variant="body" style={styles.centerText}>We use the camera to spot your ingredients, then you swipe through meals you can make with them.</Txt>
        <Button title="Allow camera" onPress={requestPermission} style={{ alignSelf: "stretch" }} />
      </View>
    );
  }

  const full = frames.length >= MAX_FRAMES;
  const status = !scanning
    ? full
      ? "That's plenty of photos! Let's review 🎉"
      : frames.length
        ? "Paused. Tap resume to keep going"
        : "Tap START, then pan slowly across your fridge"
    : inFlight
      ? "Looking closely… 🔍"
      : steady
        ? "Hold it… 📸"
        : "Move slowly, then hold still";

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      {/* top: lesson-style progress + restart (top right) */}
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <ProgressBar value={frames.length / MAX_FRAMES} track="rgba(255,255,255,0.35)" />
        </View>
        {(frames.length > 0 || items.length > 0) && (
          <Button
            title="↺ Restart"
            variant="outlineDanger"
            small
            onPress={() => {
              setScanning(false);
              confirmRestart(true, onRestart);
            }}
          />
        )}
      </View>

      {/* speech-bubble status */}
      <View style={styles.bubbleWrap}>
        <View style={styles.bubble}>
          <View style={[styles.dot, { backgroundColor: scanning ? (steady ? C.green : C.gold) : C.muted }]} />
          <Txt variant="bold" style={{ flexShrink: 1 }}>{status}</Txt>
          {inFlight && <ActivityIndicator color={C.blue} size="small" />}
        </View>
        <View style={styles.bubbleTail} />
      </View>

      {/* bottom sheet */}
      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Txt variant="h2">{items.length ? `${items.length} ingredient${items.length === 1 ? "" : "s"} found` : "Ingredients"}</Txt>
          <Txt variant="label">{frames.length}/{MAX_FRAMES} photos</Txt>
        </View>
        {error && <Txt variant="bold" style={{ color: C.red }} numberOfLines={2}>{error}</Txt>}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {items.length === 0 && <Txt variant="caption">Found items will pop up here</Txt>}
          {items.map((i) => (
            <View key={i.id} style={styles.chip}>
              <View style={[styles.chipDot, { backgroundColor: itemColor(i.id) }]} />
              <Txt variant="bold" style={{ fontSize: 14 }}>{categoryEmoji(i.category)} {i.name}</Txt>
            </View>
          ))}
        </ScrollView>
        <View style={styles.row}>
          <Button
            title={scanning ? "Pause" : frames.length ? "Resume" : "Start scan"}
            variant={scanning ? "secondary" : "primary"}
            onPress={() => setScanning((s) => !s)}
            disabled={full}
            style={{ flex: 1 }}
          />
          <Button
            title={`Review${items.length ? ` (${items.length})` : ""}`}
            variant={full ? "primary" : "outline"}
            disabled={!frames.length || inFlight || !!pending}
            onPress={() => {
              setScanning(false);
              onDone();
            }}
            style={{ flex: 1 }}
          />
        </View>
      </View>

      {pending && (
        <SwipeCard
          key={pending.frame.id}
          frame={pending.frame}
          detections={pending.detections}
          items={items}
          onKeep={() => {
            const { frame, detections } = pending;
            onFrame(frame);
            onItems((prev) => mergeDetections(prev, frame.id, detections));
            setPending(null);
          }}
          onSkip={() => setPending(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16, backgroundColor: C.bg },
  centerText: { textAlign: "center", color: C.muted, marginBottom: 8 },
  bigEmoji: { fontSize: 72, lineHeight: 86 },
  topRow: { position: "absolute", top: 56, left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  bubbleWrap: { position: "absolute", top: 100, left: 16, right: 16, alignItems: "center" },
  bubble: {
    flexDirection: "row", alignItems: "center", gap: 10, maxWidth: "100%",
    backgroundColor: C.white, borderWidth: 2, borderColor: C.border, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10,
  },
  bubbleTail: {
    width: 14, height: 14, backgroundColor: C.white, borderRightWidth: 2, borderBottomWidth: 2, borderColor: C.border,
    transform: [{ rotate: "45deg" }], marginTop: -8,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  sheet: {
    position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: C.white,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 34, gap: 12,
  },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chips: { gap: 8, alignItems: "center", minHeight: 40 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 2, borderBottomWidth: 3, borderColor: C.border,
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: C.white,
  },
  chipDot: { width: 10, height: 10, borderRadius: 5 },
  row: { flexDirection: "row", gap: 12 },
});
