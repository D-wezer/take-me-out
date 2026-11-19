# Take Me Out <sub>of your fridge</sub>

Point your phone at your fridge. Take Me Out scans it continuously and boxes every ingredient it finds. You fix anything it got wrong, then you swipe through meals you can make, dating-app style, until you have matched as many meals as you want.

```
app/     Expo (React Native + TypeScript) mobile app
server/  Hono API that calls Claude vision; keeps the API key off the phone
```

## How it works

1. **Scan** ([app/src/screens/ScanScreen.tsx](app/src/screens/ScanScreen.tsx)): while you pan slowly, the app grabs a frame about every 1.5 s. It only does this when the phone is steady (accelerometer) and no request is in flight, up to 15 frames. Each frame is resized to 768 px and sent to `POST /scan-frame` along with the inventory found so far.
2. **Detect** ([server/src/app.ts](server/src/app.ts)): Claude returns every food item in the frame with a bounding box (0–1000 normalized). If the item was already found in an earlier frame, it also returns that item's `existing_id`, so the same milk carton seen from three angles counts as one item.
3. **Merge** ([app/src/inventory.ts](app/src/inventory.ts)): each item stores one *sighting* (frame + box) per frame it appears in. Items are linked by id or by normalized name. A clearer view can refine an item's name, except when the user has already edited it.
4. **Review** ([app/src/screens/ReviewScreen.tsx](app/src/screens/ReviewScreen.tsx)): step through the captured frames with every box drawn on top. Each item keeps the same color in every frame, and dashed boxes mean low confidence. Tap a box to:
   - rename the item everywhere, or just this box ("Only this box")
   - say "this box is actually X" (move the box to an existing item)
   - remove the box ("Not food / wrong box") or delete the item
   - Draw missed item: drag a new box and name it, or attach it to an existing item
   - Merge duplicates: one Claude pass over the whole list (`POST /dedupe`)
5. **Keep or skip each scan**: after every frame, scanning pauses on a card showing that photo's boxes. Swipe right to keep it, left to skip it, and scanning resumes.
6. **Match** ([app/src/screens/MatchScreen.tsx](app/src/screens/MatchScreen.tsx)): choose how many meals you want to make (plus an optional diet). `POST /meal-cards` returns batches of 5 meal cards. Each card shows what you have, what you would need to buy, a difficulty rating (easy, medium or hard, counting technique and shopping) and a time rating. Swipe right on meals you want and left to pass. More cards load automatically, excluding meals already shown, until you have matched enough. The summary lists the recipes and one combined shopping list.

## Run locally

Requirements: Node 20+ and the **Expo Go** app on your phone, on the same Wi-Fi network as your computer.

```bash
# 1. Backend
cd server
cp .env.example .env        # add your ANTHROPIC_API_KEY
npm install
npm run dev                 # http://0.0.0.0:8787

# 2. App (in a second terminal)
cd app
npm install
npx expo start              # scan the QR code with Expo Go (Android) or the Camera app (iOS)
```

In dev, the app reaches the backend through your computer's LAN IP (the same host Metro serves from), so nothing needs configuring. If your network blocks device-to-device traffic, run `npx expo start --tunnel` and point `EXPO_PUBLIC_API_URL` at a deployed backend.

## Deploy

### Backend
**Option A: Vercel.** It detects the Hono app in `server/src/index.ts`.
```bash
cd server
npx vercel                  # first time: link the project, root = server/
npx vercel env add ANTHROPIC_API_KEY
npx vercel --prod
```
**Option B: Render, Railway or Fly** (a plain Node server). Use build command `npm install`, start command `npm start`, and set the `ANTHROPIC_API_KEY` environment variable. The server honors `PORT`.

Check the deploy with `curl https://<your-backend>/health`.

### App
Set the backend URL before building (in `app/.env` or as an EAS environment variable):
```
EXPO_PUBLIC_API_URL=https://<your-backend>
```

| Goal | Command |
|---|---|
| Live demo | `npx expo start`, then open in Expo Go |
| Installable Android APK link | `npm i -g eas-cli && eas login && eas build:configure`, then `eas build -p android --profile preview` |
| iOS TestFlight (needs Apple Developer account) | `eas build -p ios`, then `eas submit -p ios` |
| Push JS fixes without rebuilding | `eas update` |

For an APK, set `"preview": { "android": { "buildType": "apk" } }` in the `eas.json` that `eas build:configure` creates.

## Configuration

| Where | Knob | Default |
|---|---|---|
| `server/.env` | `CLAUDE_MODEL` | `claude-opus-5-5` (`claude-sonnet-5-5` is cheaper and faster) |
| [ScanScreen.tsx](app/src/screens/ScanScreen.tsx) | `CAPTURE_INTERVAL_MS`, `MAX_FRAMES`, `FRAME_WIDTH`, `STEADY_THRESHOLD` | 1500 ms, 15, 768 px, 0.04 g |
| [server/src/app.ts](server/src/app.ts) | effort per endpoint | scan `low`, dedupe `low`, meal cards `low` |
| [MatchScreen.tsx](app/src/screens/MatchScreen.tsx) | `BATCH`, `REFILL_AT` | 5 cards per request, refill at 2 left |

Server-side refusal fallback (`fallbacks: "default"`) is on, so a rare safety decline is retried on a fallback model instead of failing the scan.

## Next ideas
- Save confirmed items to a pantry (Supabase). On a rescan, compare against it and flag items no longer seen as "used up?".
- Drag handles to resize boxes (right now you delete a box and redraw it).
- Skip near-duplicate frames with a perceptual hash before upload.
- Rate-limit `/scan-frame` per device before sharing the backend URL publicly.
