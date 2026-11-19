import type { Box, Detection, Item } from "./types";

export const uid = () => Math.random().toString(36).slice(2, 10);

const SYNONYMS: Record<string, string> = {
  scallion: "green onion",
  "spring onion": "green onion",
  coriander: "cilantro",
  aubergine: "eggplant",
  courgette: "zucchini",
  capsicum: "bell pepper",
};

/** Cheap name normalization so "Eggs" / "egg" / "eggs " collapse together. */
export function normalizeName(name: string): string {
  let n = name.toLowerCase().trim().replace(/\s+/g, " ");
  n = n.replace(/ies$/, "y").replace(/oes$/, "o");
  if (n.length > 3 && n.endsWith("s") && !n.endsWith("ss")) n = n.slice(0, -1);
  return SYNONYMS[n] ?? n;
}

/** Merge one frame's detections into the running inventory (pure). */
export function mergeDetections(items: Item[], frameId: string, detections: Detection[]): Item[] {
  const next = items.map((i) => ({ ...i, sightings: [...i.sightings] }));
  const byId = new Map(next.map((i) => [i.id, i]));

  for (const d of detections) {
    let target = d.existing_id ? byId.get(d.existing_id) : undefined;
    if (!target) {
      const key = normalizeName(d.name);
      target = next.find((i) => normalizeName(i.name) === key);
    }

    const sighting = { id: uid(), frameId, box: d.box, source: "ai" as const };

    if (target) {
      target.sightings.push(sighting);
      // A clearer view can refine the name/quantity — unless the user fixed it.
      if (!target.userEdited && d.confidence > target.confidence) {
        target.name = d.name;
        target.quantity = d.quantity;
        target.category = d.category;
        target.confidence = d.confidence;
      }
    } else {
      const item: Item = {
        id: uid(),
        name: d.name,
        quantity: d.quantity,
        category: d.category,
        confidence: d.confidence,
        sightings: [sighting],
        userEdited: false,
      };
      next.push(item);
      byId.set(item.id, item);
    }
  }
  return next;
}

// ---------- user corrections ----------

export function updateItem(items: Item[], id: string, patch: Partial<Pick<Item, "name" | "quantity" | "category">>): Item[] {
  return items.map((i) => (i.id === id ? { ...i, ...patch, userEdited: true, confidence: 1 } : i));
}

export function removeItem(items: Item[], id: string): Item[] {
  return items.filter((i) => i.id !== id);
}

/** Remove one box. Items left with no boxes are kept only if the user created/edited them. */
export function removeSighting(items: Item[], sightingId: string): Item[] {
  return items
    .map((i) => ({ ...i, sightings: i.sightings.filter((s) => s.id !== sightingId) }))
    .filter((i) => i.sightings.length > 0 || i.userEdited);
}

/** "This box is actually X" — move one sighting to another item. */
export function reassignSighting(items: Item[], sightingId: string, toItemId: string): Item[] {
  const sighting = items.flatMap((i) => i.sightings).find((s) => s.id === sightingId);
  if (!sighting) return items;
  const moved = items.map((i) => {
    if (i.id === toItemId) return { ...i, sightings: [...i.sightings.filter((s) => s.id !== sightingId), sighting] };
    return { ...i, sightings: i.sightings.filter((s) => s.id !== sightingId) };
  });
  return moved.filter((i) => i.sightings.length > 0 || i.userEdited);
}

/** "This box is a different item" — split one sighting into a new item. */
export function splitSighting(items: Item[], sightingId: string, name: string, quantity: string): Item[] {
  const sighting = items.flatMap((i) => i.sightings).find((s) => s.id === sightingId);
  if (!sighting) return items;
  const rest = items
    .map((i) => ({ ...i, sightings: i.sightings.filter((s) => s.id !== sightingId) }))
    .filter((i) => i.sightings.length > 0 || i.userEdited);
  return [...rest, newUserItem(name, quantity, sighting)];
}

/** Merge item `fromId` into `intoId` (all boxes move over). */
export function mergeItems(items: Item[], fromId: string, intoId: string): Item[] {
  const from = items.find((i) => i.id === fromId);
  if (!from || fromId === intoId) return items;
  return items
    .filter((i) => i.id !== fromId)
    .map((i) => (i.id === intoId ? { ...i, sightings: [...i.sightings, ...from.sightings] } : i));
}

/** User drew a box (or typed an item with no box). */
export function addUserItem(items: Item[], name: string, quantity: string, frameId?: string, box?: Box): Item[] {
  const sighting = frameId && box ? { id: uid(), frameId, box, source: "user" as const } : undefined;
  return [...items, newUserItem(name, quantity, sighting)];
}

/** User drew a box around something that's already in the list. */
export function addSightingToItem(items: Item[], itemId: string, frameId: string, box: Box): Item[] {
  return items.map((i) =>
    i.id === itemId ? { ...i, sightings: [...i.sightings, { id: uid(), frameId, box, source: "user" as const }] } : i,
  );
}

function newUserItem(name: string, quantity: string, sighting?: Item["sightings"][number]): Item {
  return {
    id: uid(),
    name: name.trim(),
    quantity: quantity.trim(),
    category: "other",
    confidence: 1,
    sightings: sighting ? [sighting] : [],
    userEdited: true,
  };
}

export function applyDedupe(
  items: Item[],
  groups: { keep_id: string; merge_ids: string[]; name: string; quantity: string }[],
): Item[] {
  let next = items;
  for (const g of groups) {
    const keep = next.find((i) => i.id === g.keep_id);
    if (!keep) continue;
    for (const id of g.merge_ids) next = mergeItems(next, id, g.keep_id);
    if (!keep.userEdited) {
      next = next.map((i) => (i.id === g.keep_id ? { ...i, name: g.name, quantity: g.quantity } : i));
    }
  }
  return next;
}

/** Stable color per item so the same item has the same box color in every frame. */
export function itemColor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h}, 80%, 50%)`;
}

/** Same hue as itemColor, faded — for icon backgrounds. */
export function itemTint(id: string): string {
  return itemColor(id).replace("hsl(", "hsla(").replace(")", ", 0.18)");
}
