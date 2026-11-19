import { useCallback, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts, Nunito_600SemiBold, Nunito_800ExtraBold, Nunito_900Black } from "@expo-google-fonts/nunito";
import ScanScreen from "./src/screens/ScanScreen";
import ReviewScreen from "./src/screens/ReviewScreen";
import MatchScreen from "./src/screens/MatchScreen";
import { C } from "./src/ui";
import type { Frame, Item } from "./src/types";

type Screen = "scan" | "review" | "match";

/** Take Me Out: scan → review/correct boxes → swipe on meals. Session state lives here. */
export default function App() {
  const [fontsLoaded] = useFonts({ Nunito_600SemiBold, Nunito_800ExtraBold, Nunito_900Black });
  const [screen, setScreen] = useState<Screen>("scan");
  const [items, setItems] = useState<Item[]>([]);
  const [frames, setFrames] = useState<Frame[]>([]);
  // Bumped on restart so the scan screen remounts fresh (and drops any in-flight frame).
  const [session, setSession] = useState(0);

  const onItems = useCallback((fn: (prev: Item[]) => Item[]) => setItems(fn), []);
  const onFrame = useCallback((f: Frame) => setFrames((prev) => [...prev, f]), []);
  const onRestart = useCallback(() => {
    setItems([]);
    setFrames([]);
    setSession((s) => s + 1);
    setScreen("scan");
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg }}>
        <ActivityIndicator color={C.green} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={screen === "scan" ? "light" : "dark"} />
      {screen === "scan" && (
        <ScanScreen
          key={session}
          items={items}
          frames={frames}
          onItems={onItems}
          onFrame={onFrame}
          onDone={() => setScreen("review")}
          onRestart={onRestart}
        />
      )}
      {screen === "review" && (
        <ReviewScreen
          items={items}
          frames={frames}
          onItems={onItems}
          onBack={() => setScreen("scan")}
          onNext={() => setScreen("match")}
          onRestart={onRestart}
        />
      )}
      {screen === "match" && <MatchScreen items={items} onBack={() => setScreen("review")} onRestart={onRestart} />}
    </>
  );
}
