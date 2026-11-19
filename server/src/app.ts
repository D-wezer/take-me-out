import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import Anthropic from "@anthropic-ai/sdk";
import { structuredCall } from "./claude.js";
import {
  DedupeRequest,
  DedupeResult,
  FrameDetections,
  MealCards,
  MealCardsRequest,
  ScanFrameRequest,
} from "./schemas.js";

export const app = new Hono();

app.use("*", cors());
app.use("*", bodyLimit({ maxSize: 6 * 1024 * 1024 }));

app.get("/health", (c) => c.json({ ok: true }));

// ---------------------------------------------------------------------------
// POST /scan-frame
// One camera frame + what has been found so far -> every food item visible in
// this frame with a bounding box, linked to an existing item id when it's the
// same thing seen again.
// ---------------------------------------------------------------------------
const SCAN_SYSTEM = `You identify food and cooking ingredients in photos of fridges, freezers and pantries.

For EVERY distinct food item visible in the image, return one detection with a tight bounding box.
- Box coordinates are normalized to 0-1000 relative to the image: x_min,y_min is the top-left corner, x_max,y_max the bottom-right. 0,0 is the top-left of the image.
- Use specific, singular, lowercase names ("cheddar cheese", "red onion", "oat milk"). Read labels when legible.
- If several identical items sit together (e.g. a carton of eggs, 4 yogurts), use ONE box around the group and put the count in quantity.
- Ignore non-food (shelves, containers with unknowable contents should be named "unknown container").
- You are given the inventory already found in earlier frames. If an item in this image is the same item as one in the inventory, set existing_id to that item's id (use a refined name if this frame shows the label better). Otherwise existing_id is null.
- confidence: your certainty in the name, 0-1.`;

app.post("/scan-frame", async (c) => {
  const parsed = ScanFrameRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.message }, 400);
  const { image, inventory } = parsed.data;

  const inventoryText = inventory.length
    ? inventory.map((i) => `- id=${i.id}: ${i.name}${i.quantity ? ` (${i.quantity})` : ""}`).join("\n")
    : "(none yet)";

  try {
    const result = await structuredCall({
      schema: FrameDetections,
      system: SCAN_SYSTEM,
      images: [{ base64: image, mediaType: "image/jpeg" }],
      text: `Inventory found so far:\n${inventoryText}\n\nDetect every food item in this image.`,
      effort: "low",
      maxTokens: 8000,
    });
    // Clamp boxes so a sloppy coordinate never breaks the overlay.
    const clamp = (n: number) => Math.max(0, Math.min(1000, n));
    const knownIds = new Set(inventory.map((i) => i.id));
    result.detections = result.detections.map((d) => ({
      ...d,
      existing_id: d.existing_id && knownIds.has(d.existing_id) ? d.existing_id : null,
      box: {
        x_min: clamp(Math.min(d.box.x_min, d.box.x_max)),
        y_min: clamp(Math.min(d.box.y_min, d.box.y_max)),
        x_max: clamp(Math.max(d.box.x_min, d.box.x_max)),
        y_max: clamp(Math.max(d.box.y_min, d.box.y_max)),
      },
    }));
    return c.json(result);
  } catch (err) {
    return handleError(c, err);
  }
});

// ---------------------------------------------------------------------------
// POST /dedupe — final cleanup when the user taps "Done scanning".
// ---------------------------------------------------------------------------
app.post("/dedupe", async (c) => {
  const parsed = DedupeRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.message }, 400);
  if (parsed.data.items.length < 2) return c.json({ groups: [] });

  try {
    const result = await structuredCall({
      schema: DedupeResult,
      system:
        "You clean up a fridge inventory built from several overlapping photos. Group entries that refer to the same physical item(s) (e.g. 'milk' and '2% milk carton'). Only return groups with at least one merge_id. Do not merge different foods.",
      text: JSON.stringify(parsed.data.items),
      effort: "low",
    });
    return c.json(result);
  } catch (err) {
    return handleError(c, err);
  }
});

// ---------------------------------------------------------------------------
// POST /meal-cards — a batch of meal ideas to swipe on. The app asks for more
// (excluding names already shown) until the user has matched enough meals.
// ---------------------------------------------------------------------------
const CARDS_SYSTEM = `You suggest meals someone can cook from what is in their fridge. Each suggestion becomes a card they swipe right (want to make) or left (pass) on.
- Mostly use the fridge ingredients. Assume salt, pepper, oil and water are available.
- Make the batch varied: different cuisines, meal types (breakfast, lunch, dinner, snack) and cooking methods.
- difficulty reflects BOTH technique and shopping: 1 = simple and nothing (or almost nothing) to buy, 2 = some technique or a few items to buy, 3 = involved technique or several items to buy.
- time_minutes is realistic total time.
- Never repeat a meal from the "already shown" list, or a near-duplicate of one.`;

app.post("/meal-cards", async (c) => {
  const parsed = MealCardsRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.message }, 400);
  const { ingredients, prefs, exclude, count } = parsed.data;

  try {
    const result = await structuredCall({
      schema: MealCards,
      system: CARDS_SYSTEM,
      text: `Fridge ingredients:\n${ingredients
        .map((i) => `- ${i.name}${i.quantity ? ` (${i.quantity})` : ""}`)
        .join("\n")}\n\nServings: ${prefs.servings}${prefs.diet ? `\nDiet: ${prefs.diet}` : ""}${
        prefs.allergies ? `\nAllergies (never include): ${prefs.allergies}` : ""
      }\n\nAlready shown (do not repeat): ${exclude.length ? exclude.join("; ") : "(none)"}\n\nSuggest ${count} meals.`,
      effort: "low",
    });
    const seen = new Set(exclude.map((n) => n.toLowerCase().trim()));
    result.cards = result.cards
      .filter((card) => !seen.has(card.name.toLowerCase().trim()))
      .map((card) => ({
        ...card,
        difficulty: Math.min(3, Math.max(1, Math.round(card.difficulty))),
        time_minutes: Math.max(1, Math.round(card.time_minutes)),
      }));
    return c.json(result);
  } catch (err) {
    return handleError(c, err);
  }
});

function handleError(c: Context, err: unknown) {
  if (err instanceof Anthropic.RateLimitError) return c.json({ error: "Rate limited, slow down" }, 429);
  if (err instanceof Anthropic.AuthenticationError) return c.json({ error: "Server API key invalid" }, 500);
  if (err instanceof Anthropic.BadRequestError) return c.json({ error: err.message }, 400);
  if (err instanceof Anthropic.APIError) return c.json({ error: err.message }, 502);
  console.error(err);
  return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
}
