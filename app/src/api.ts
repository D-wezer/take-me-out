import Constants from "expo-constants";
import type { Detection, Item, MatchPrefs, MealCard } from "./types";

/**
 * Backend URL. Set EXPO_PUBLIC_API_URL for a deployed backend.
 * In local dev it falls back to the dev machine's LAN IP (the same host
 * Metro is served from) on port 8787.
 */
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return `http://${host ?? "localhost"}:8787`;
}

export const API_URL = resolveApiUrl();

async function post<T>(path: string, body: unknown, timeoutMs = 60_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

export function scanFrame(imageBase64: string, items: Item[]) {
  return post<{ detections: Detection[] }>("/scan-frame", {
    image: imageBase64,
    inventory: items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity })),
  });
}

export function dedupe(items: Item[]) {
  return post<{ groups: { keep_id: string; merge_ids: string[]; name: string; quantity: string }[] }>(
    "/dedupe",
    { items: items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity })) },
  );
}

/** A batch of meal ideas to swipe on. `exclude` = names already shown. */
export function fetchMealCards(items: Item[], prefs: MatchPrefs, exclude: string[], count = 5) {
  return post<{ cards: Omit<MealCard, "id">[] }>(
    "/meal-cards",
    {
      ingredients: items.map((i) => ({ name: i.name, quantity: i.quantity, category: i.category })),
      prefs,
      exclude,
      count,
    },
    90_000,
  );
}
