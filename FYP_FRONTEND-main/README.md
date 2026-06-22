# PrepifyAI — Frontend (React Native / Expo)

Cross-platform mobile + web client for PrepifyAI. Built with **Expo (SDK 54)**,
**expo-router**, and **TypeScript**; runs on **Android, iOS, and Web**.

See the [root README](../README.md) for the full project overview and the
[AI architecture doc](../docs/AI_ARCHITECTURE.md) for the ML internals.

## Stack
- Expo + expo-router (file-based routing under `app/`)
- TypeScript, NativeWind / Tailwind for styling
- `react-native-reanimated` for animations, Recharts for charts
- AsyncStorage for the JWT session, NetInfo for offline sync

## Project layout
```
app/        expo-router screens & layouts (routes)
src/
  screens/    screen components grouped by feature
  services/   typed API clients (mirror the backend endpoints)
  components/  reusable UI
  context/    React contexts (auth)
  hooks/      shared hooks (offline sync, params)
  theme/      colors & accessibility helpers
  utils/      helpers (mcq parsing, revision planner, auth)
```

## Getting started
```bash
npm install
cp .env.example .env       # set EXPO_PUBLIC_API_* to point at the backend
npm run dev                # Expo dev server; press a / i / w
```

Make sure the backend is running (see `../FYP-Backend-main/README.md`) and that
`EXPO_PUBLIC_API_BASE_URL` / `EXPO_PUBLIC_API_PORT` point at it. For Android
emulators set `EXPO_PUBLIC_ANDROID_EMULATOR_HOST` (default `10.0.2.2`); for a
physical device set `EXPO_PUBLIC_DEV_LAN_HOST` to your PC's LAN IPv4.

## Scripts
| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Expo dev server |
| `npm run android` / `ios` / `web` | Open on a target platform |
| `npm run build:web` | Export the web build |
| `npm run lint` | ESLint (expo) |
| `npm run typecheck` | `tsc --noEmit` |
