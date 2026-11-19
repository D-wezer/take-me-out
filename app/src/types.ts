/** Normalized 0–1000 box relative to the frame image. */
export type Box = { x_min: number; y_min: number; x_max: number; y_max: number };

export type Frame = {
  id: string;
  uri: string; // local file of the exact (resized) image sent to the model
  width: number;
  height: number;
  createdAt: number;
};

/** One appearance of an item in one frame. */
export type Sighting = {
  id: string;
  frameId: string;
  box: Box;
  source: "ai" | "user";
};

export type Item = {
  id: string;
  name: string;
  quantity: string;
  category: string;
  confidence: number; // 1 for user-added / user-edited
  sightings: Sighting[];
  userEdited: boolean; // AI won't rename items the user has corrected
};

export type Detection = {
  name: string;
  quantity: string;
  category: string;
  confidence: number;
  box: Box;
  existing_id: string | null;
};

export type MealCard = {
  id: string; // client-side
  name: string;
  emoji: string;
  description: string;
  uses: string[];
  missing: string[];
  difficulty: 1 | 2 | 3;
  difficulty_reason: string;
  time_minutes: number;
  steps: string[];
  calories: number;
  protein_g: number;
};

export type MatchPrefs = {
  servings: number;
  diet?: string;
};
