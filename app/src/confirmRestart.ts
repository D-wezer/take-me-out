import { Alert } from "react-native";

/** Ask before throwing away the current scan. Skips the prompt when there's nothing to lose. */
export function confirmRestart(hasData: boolean, onConfirm: () => void) {
  if (!hasData) return onConfirm();
  Alert.alert("Start a new scan?", "This clears all captured frames and found items.", [
    { text: "Cancel", style: "cancel" },
    { text: "Start over", style: "destructive", onPress: onConfirm },
  ]);
}
