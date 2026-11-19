import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import Swipeable, { type SwipeDir, type SwipeableHandle } from "../components/Swipeable";
import { fetchMealCards } from "../api";
import { confirmRestart } from "../confirmRestart";
import { uid } from "../inventory";
import { Brand, Button, C, Card, F, Pill, ProgressBar, Txt } from "../ui";
import type { Item, MealCard } from "../types";

type Props = { items: Item[]; onBack: () => void; onRestart: () => void };
type Phase = "setup" | "swiping" | "done";

const BATCH = 5; // cards per request
const REFILL_AT = 2; // fetch more when this few cards are left

const DIFFICULTY = {
  1: { label: "Easy", color: C.green, bg: C.greenLight },
  2: { label: "Medium", color: "#B78A00", bg: C.goldLight },
  3: { label: "Hard", color: C.redShadow, bg: C.redLight },
} as const;

function timeLabel(min: number) {
  if (min <= 20) return { label: "Quick", color: C.green, bg: C.greenLight };
  if (min <= 45) return { label: "Medium", color: C.blueShadow, bg: C.blueLight };
  return { label: "Long", color: "#9A4FD1", bg: "#F3E3FF" };
}

/** Pick meals like a dating app: right = make it, left = pass, until enough are matched. */
export default function MatchScreen({ items, onBack, onRestart }: Props) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [target, setTarget] = useState(3);
  const [diet, setDiet] = useState("");
  const [deck, setDeck] = useState<MealCard[]>([]);
  const [liked, setLiked] = useState<MealCard[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const swipeRef = useRef<SwipeableHandle>(null);

  async function loadMore(exclude: string[]) {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const { cards } = await fetchMealCards(items, { servings: 1, diet: diet.trim() || undefined }, exclude, BATCH);
      const known = new Set(exclude.map((n) => n.toLowerCase()));
      const fresh = cards
        .filter((c) => !known.has(c.name.toLowerCase()))
        .map((c) => ({ ...c, id: uid(), difficulty: (Math.min(3, Math.max(1, Math.round(c.difficulty))) as 1 | 2 | 3) }));
      setDeck((d) => [...d, ...fresh]);
      setSeen((s) => [...s, ...fresh.map((c) => c.name)]);
      if (!fresh.length) setError("Ran out of new ideas. Try loosening your diet filter or scanning more items.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  function start() {
    setPhase("swiping");
    setDeck([]);
    setLiked([]);
    setSeen([]);
    loadMore([]);
  }

  function onSwipe(card: MealCard, dir: SwipeDir) {
    // Functional update: a new batch may have arrived during the fling animation.
    setDeck((d) => d.filter((c) => c.id !== card.id));
    const likedCount = liked.length + (dir === 1 ? 1 : 0);
    if (dir === 1) setLiked((l) => [...l, card]);
    if (likedCount >= target) {
      setPhase("done");
      return;
    }
    if (deck.length - 1 <= REFILL_AT) loadMore(seen);
  }

  const header = (
    <View style={styles.header}>
      <Pressable onPress={phase === "swiping" ? () => setPhase("setup") : onBack} hitSlop={10} style={styles.iconBtn}>
        <Txt style={styles.iconText}>‹</Txt>
      </Pressable>
      <Brand size={22} />
      <Button title="New scan" variant="outlineDanger" small onPress={() => confirmRestart(items.length > 0, onRestart)} />
    </View>
  );

  // ---------------- setup ----------------
  if (phase === "setup") {
    return (
      <View style={styles.container}>
        {header}
        <ScrollView contentContainerStyle={styles.body}>
          <Card tint={{ bg: C.blueLight, border: C.blue }} style={styles.hero}>
            <Txt style={{ fontSize: 36 }}>💘</Txt>
            <View style={{ flex: 1 }}>
              <Txt variant="h2" style={{ color: C.blueShadow }}>Find your meal match</Txt>
              <Txt variant="body" style={{ color: C.blueShadow }}>
                We&apos;ll show you meals you can make from {items.length} ingredient{items.length === 1 ? "" : "s"}. Swipe right on the ones you want.
              </Txt>
            </View>
          </Card>

          <Card style={styles.countCard}>
            <Txt variant="label">How many meals do you want to make?</Txt>
            <View style={styles.counter}>
              <RoundBtn text="−" disabled={target <= 1} onPress={() => setTarget((t) => Math.max(1, t - 1))} />
              <Txt style={styles.count}>{target}</Txt>
              <RoundBtn text="+" disabled={target >= 10} onPress={() => setTarget((t) => Math.min(10, t + 1))} />
            </View>
            <Txt variant="caption">meal{target === 1 ? "" : "s"}</Txt>
          </Card>

          <TextInput
            style={styles.input}
            placeholder="Diet or allergies (optional)"
            placeholderTextColor={C.muted}
            value={diet}
            onChangeText={setDiet}
          />
          <Button title="Start swiping" onPress={start} />
        </ScrollView>
      </View>
    );
  }

  // ---------------- done ----------------
  if (phase === "done") {
    const shopping = [...new Map(liked.flatMap((m) => m.missing).map((x) => [x.toLowerCase().trim(), x])).values()];
    const totalMin = liked.reduce((n, m) => n + m.time_minutes, 0);
    return (
      <View style={styles.container}>
        {header}
        <ScrollView contentContainerStyle={styles.body}>
          <Card tint={{ bg: C.greenLight, border: C.green }} style={styles.hero}>
            <Txt style={{ fontSize: 36 }}>🎉</Txt>
            <View style={{ flex: 1 }}>
              <Txt variant="h2" style={{ color: C.greenShadow }}>It&apos;s a match!</Txt>
              <Txt variant="body" style={{ color: C.greenShadow }}>
                {liked.length} meal{liked.length === 1 ? "" : "s"} · about {totalMin} min of cooking in total
              </Txt>
            </View>
          </Card>

          {liked.map((m) => <MatchedMeal key={m.id} meal={m} />)}

          <Card style={{ gap: 8 }}>
            <Txt variant="h2">🛒 Shopping list</Txt>
            {shopping.length ? (
              shopping.map((s) => <Txt key={s} variant="bold">• {s}</Txt>)
            ) : (
              <Txt variant="bold" style={{ color: C.greenShadow }}>Nothing to buy. You have everything!</Txt>
            )}
          </Card>

          <View style={styles.row}>
            <Button title="Swipe more" variant="outline" onPress={() => { setTarget((t) => t + 1); setPhase("swiping"); if (deck.length <= REFILL_AT) loadMore(seen); }} style={{ flex: 1 }} />
            <Button title="Start over" variant="outline" onPress={() => setPhase("setup")} style={{ flex: 1 }} />
          </View>
        </ScrollView>
      </View>
    );
  }

  // ---------------- swiping ----------------
  const top = deck[0];
  const next = deck[1];
  return (
    <View style={styles.container}>
      {header}
      <View style={styles.progressRow}>
        <View style={{ flex: 1 }}>
          <ProgressBar value={liked.length / target} />
        </View>
        <Txt variant="bold">{liked.length}/{target} ❤️</Txt>
      </View>

      <View style={styles.deck}>
        {next && (
          <View style={[styles.cardBase, styles.behind]} pointerEvents="none">
            <MealFace meal={next} />
          </View>
        )}
        {top ? (
          <Swipeable key={top.id} ref={swipeRef} yesLabel="YUM" noLabel="NOPE" onSwipe={(dir) => onSwipe(top, dir)} style={styles.cardBase}>
            <MealFace meal={top} />
          </Swipeable>
        ) : (
          <View style={[styles.cardBase, styles.loadingCard]}>
            {error ? (
              <>
                <Txt style={{ fontSize: 40 }}>😕</Txt>
                <Txt variant="bold" style={{ textAlign: "center" }}>{error}</Txt>
                <Button title="Try again" onPress={() => loadMore(seen)} />
              </>
            ) : (
              <>
                <ActivityIndicator color={C.green} size="large" />
                <Txt variant="h2">Finding meals you can make…</Txt>
                <Txt variant="caption">This takes about 15 seconds</Txt>
              </>
            )}
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <Pressable onPress={() => swipeRef.current?.swipe(-1)} disabled={!top} style={[styles.bigRound, { borderColor: C.red }, !top && { opacity: 0.4 }]} accessibilityLabel="Pass on this meal" hitSlop={8}>
          <Txt style={[styles.bigRoundText, { color: C.red }]}>✕</Txt>
        </Pressable>
        {loading && top && <ActivityIndicator color={C.muted} />}
        <Pressable onPress={() => swipeRef.current?.swipe(1)} disabled={!top} style={[styles.bigRound, { borderColor: C.green }, !top && { opacity: 0.4 }]} accessibilityLabel="Make this meal" hitSlop={8}>
          <Txt style={[styles.bigRoundText, { color: C.green }]}>♥</Txt>
        </Pressable>
      </View>
    </View>
  );
}

/** The face of a meal card: what it is, what you have, what to buy, difficulty and time. */
function MealFace({ meal }: { meal: MealCard }) {
  const d = DIFFICULTY[meal.difficulty];
  const t = timeLabel(meal.time_minutes);
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.emojiHero}>
        <Txt style={{ fontSize: 72, lineHeight: 88 }}>{meal.emoji || "🍽️"}</Txt>
      </View>
      <Txt variant="title" style={{ fontSize: 24 }}>{meal.name}</Txt>
      <Txt variant="body" style={{ color: C.muted }} numberOfLines={3}>{meal.description}</Txt>

      <View style={styles.ratings}>
        <View style={[styles.rating, { backgroundColor: d.bg }]}>
          <Txt variant="label" style={{ color: d.color }}>Difficulty</Txt>
          <View style={styles.dots}>
            {[1, 2, 3].map((n) => (
              <View key={n} style={[styles.dot, { backgroundColor: n <= meal.difficulty ? d.color : "rgba(0,0,0,0.12)" }]} />
            ))}
          </View>
          <Txt variant="bold" style={{ color: d.color }}>{d.label}</Txt>
        </View>
        <View style={[styles.rating, { backgroundColor: t.bg }]}>
          <Txt variant="label" style={{ color: t.color }}>Time</Txt>
          <Txt style={[styles.timeNum, { color: t.color }]}>{meal.time_minutes}<Txt style={[styles.timeUnit, { color: t.color }]}> min</Txt></Txt>
          <Txt variant="bold" style={{ color: t.color }}>{t.label}</Txt>
        </View>
      </View>
      <Txt variant="caption" numberOfLines={1}>{meal.difficulty_reason}</Txt>

      <Txt variant="body" numberOfLines={2}><Txt variant="bold">You have: </Txt>{meal.uses.join(", ")}</Txt>
      {meal.missing.length ? (
        <Txt variant="body" style={{ color: C.redShadow }} numberOfLines={2}>
          <Txt variant="bold" style={{ color: C.redShadow }}>To buy: </Txt>{meal.missing.join(", ")}
        </Txt>
      ) : (
        <Txt variant="bold" style={{ color: C.greenShadow }}>✓ Nothing to buy</Txt>
      )}
    </View>
  );
}

function MatchedMeal({ meal }: { meal: MealCard }) {
  const [open, setOpen] = useState(false);
  const d = DIFFICULTY[meal.difficulty];
  return (
    <Card style={{ gap: 8 }}>
      <View style={styles.matchTop}>
        <Txt style={{ fontSize: 34 }}>{meal.emoji || "🍽️"}</Txt>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt variant="bold" style={{ fontSize: 17 }}>{meal.name}</Txt>
          <View style={styles.row}>
            <Pill text={d.label} bg={d.bg} color={d.color} />
            <Pill text={`${meal.time_minutes} min`} bg={C.blueLight} color={C.blueShadow} />
            <Pill text={`${meal.calories} kcal`} bg={C.field} color={C.text} />
          </View>
        </View>
      </View>
      {open && meal.steps.map((s, i) => (
        <View key={i} style={styles.stepLine}>
          <View style={styles.stepNum}><Txt style={styles.stepNumText}>{i + 1}</Txt></View>
          <Txt variant="body" style={{ flex: 1 }}>{s}</Txt>
        </View>
      ))}
      <Pressable onPress={() => setOpen((o) => !o)} hitSlop={6}>
        <Txt style={styles.link}>{open ? "Hide recipe" : "Show recipe"}</Txt>
      </Pressable>
    </Card>
  );
}

function RoundBtn({ text, onPress, disabled }: { text: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [styles.round, disabled && { opacity: 0.4 }, pressed && { borderBottomWidth: 2, marginTop: 2 }]}
    >
      <Txt style={styles.roundText}>{text}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingTop: 52 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  iconBtn: { width: 32, height: 40, alignItems: "center", justifyContent: "center" },
  iconText: { fontFamily: F.black, fontSize: 34, color: C.muted, lineHeight: 38 },
  body: { padding: 16, paddingBottom: 48, gap: 14 },
  hero: { flexDirection: "row", alignItems: "center", gap: 12 },
  countCard: { alignItems: "center", gap: 10, paddingVertical: 20 },
  counter: { flexDirection: "row", alignItems: "center", gap: 24 },
  count: { fontFamily: F.black, fontSize: 56, color: C.text, minWidth: 70, textAlign: "center", lineHeight: 64 },
  round: {
    width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center",
    backgroundColor: C.white, borderWidth: 2, borderBottomWidth: 4, borderColor: C.border,
  },
  roundText: { fontFamily: F.black, fontSize: 26, color: C.blue, lineHeight: 30 },
  input: {
    backgroundColor: C.field, borderWidth: 2, borderColor: C.border, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, fontFamily: F.bold, color: C.text,
  },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  deck: { flex: 1, padding: 16, justifyContent: "center" },
  cardBase: {
    position: "absolute", left: 16, right: 16, top: 8,
    backgroundColor: C.white, borderRadius: 24, borderWidth: 2, borderBottomWidth: 5, borderColor: C.border, padding: 18,
  },
  behind: { transform: [{ scale: 0.95 }, { translateY: 14 }], opacity: 0.7 },
  loadingCard: { alignItems: "center", justifyContent: "center", gap: 12, minHeight: 360 },
  emojiHero: { height: 120, borderRadius: 18, backgroundColor: C.field, alignItems: "center", justifyContent: "center" },
  ratings: { flexDirection: "row", gap: 10 },
  rating: { flex: 1, borderRadius: 16, padding: 12, gap: 4, alignItems: "center" },
  dots: { flexDirection: "row", gap: 6, paddingVertical: 4 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  timeNum: { fontFamily: F.black, fontSize: 24, lineHeight: 28 },
  timeUnit: { fontFamily: F.bold, fontSize: 14 },
  actions: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 48, paddingBottom: 40, paddingTop: 8 },
  bigRound: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderBottomWidth: 6, backgroundColor: C.white, alignItems: "center", justifyContent: "center" },
  bigRoundText: { fontFamily: F.black, fontSize: 32, lineHeight: 38 },
  matchTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepLine: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.green, alignItems: "center", justifyContent: "center", marginTop: 1 },
  stepNumText: { fontFamily: F.black, fontSize: 13, color: C.white },
  link: { fontFamily: F.bold, color: C.blue, fontSize: 14, letterSpacing: 0.6, textTransform: "uppercase" },
});
