import { z } from "zod";

// ---------- shared shapes ----------

/** Box in normalized 0–1000 coordinates relative to the image: [xMin, yMin, xMax, yMax]. */
export const Box = z.object({
  x_min: z.number(),
  y_min: z.number(),
  x_max: z.number(),
  y_max: z.number(),
});
export type Box = z.infer<typeof Box>;

export const Category = z.enum([
  "produce",
  "dairy",
  "meat",
  "seafood",
  "eggs",
  "grains",
  "condiments",
  "beverages",
  "leftovers",
  "frozen",
  "other",
]);

// ---------- /scan-frame ----------

export const InventoryRef = z.object({
  id: z.string(),
  name: z.string(),
  quantity: z.string().optional(),
});

export const ScanFrameRequest = z.object({
  image: z.string().min(100), // base64 JPEG, no data: prefix
  inventory: z.array(InventoryRef).max(300).default([]),
});

/** What the model returns per frame. */
export const FrameDetections = z.object({
  detections: z.array(
    z.object({
      name: z.string().describe("Specific, singular, lowercase food name, e.g. 'greek yogurt', 'red bell pepper'"),
      quantity: z.string().describe("Rough estimate, e.g. '3', 'half carton', '~500g'"),
      category: Category,
      confidence: z.number().describe("0 to 1"),
      box: Box,
      existing_id: z
        .string()
        .nullable()
        .describe("id of the matching already-found inventory item, or null if this is a new item"),
    }),
  ),
});
export type FrameDetections = z.infer<typeof FrameDetections>;

// ---------- /dedupe ----------

export const DedupeRequest = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string(), quantity: z.string().optional() })).max(300),
});

export const DedupeResult = z.object({
  groups: z.array(
    z.object({
      keep_id: z.string(),
      merge_ids: z.array(z.string()).describe("other ids that are the same physical item(s) as keep_id"),
      name: z.string(),
      quantity: z.string(),
    }),
  ),
});

// ---------- /meal-cards ----------

export const MealCardsRequest = z.object({
  ingredients: z
    .array(z.object({ name: z.string(), quantity: z.string().optional(), category: z.string().optional() }))
    .min(1)
    .max(300),
  prefs: z
    .object({
      servings: z.number().int().min(1).max(8).default(1),
      diet: z.string().max(200).optional(), // "vegetarian", "high protein", ...
      allergies: z.string().max(200).optional(),
    })
    .default({ servings: 1 }),
  exclude: z.array(z.string().max(120)).max(150).default([]), // meal names already shown
  count: z.number().int().min(1).max(8).default(5),
});

export const MealCards = z.object({
  cards: z.array(
    z.object({
      name: z.string(),
      emoji: z.string().describe("one food emoji that fits the dish"),
      description: z.string().describe("one tempting sentence, max 20 words"),
      uses: z.array(z.string()).describe("ingredients from the user's fridge"),
      missing: z.array(z.string()).describe("ingredients the user would need to buy; empty if none"),
      difficulty: z.number().describe("1 = easy, 2 = medium, 3 = hard"),
      difficulty_reason: z.string().describe("max 10 words, e.g. 'one pan, nothing to buy'"),
      time_minutes: z.number().describe("total time including prep"),
      steps: z.array(z.string()),
      calories: z.number().describe("per serving"),
      protein_g: z.number().describe("per serving"),
    }),
  ),
});
export type MealCards = z.infer<typeof MealCards>;
