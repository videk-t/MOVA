# MOVA

**Meme Opportunity & Value Analytics** — a memecoin intelligence and research platform for Solana.

> Know the meme before you trade it.

MOVA helps you discover, research, compare, monitor and manage risk around Solana memecoins. It answers three questions:

1. **What is happening?** — market and token intelligence
2. **Why is it happening?** — transparent, component-level analysis
3. **What should I check before I trade?** — safety, market structure, and position risk

## What MOVA is not

MOVA **does not execute trades, hold funds, custody wallets, or sign transactions.** It never asks for a seed phrase, a private key, or an exchange password. Execution happens on whichever platform you already use — GMGN, FOMO, Jupiter, DexScreener — reached through an outbound link carrying only the token address.

Nothing in MOVA is financial advice, and no score is a prediction.

---

## Table of contents

- [Stack](#stack)
- [Architecture](#architecture)
- [The MOVA score](#the-mova-score)
- [Data providers](#data-providers)
- [Demo mode vs live data](#demo-mode-vs-live-data)
- [Setup](#setup)
- [Environment variables](#environment-variables)
- [Running locally](#running-locally)
- [Testing](#testing)
- [Screens](#screens)
- [Security](#security)
- [Production considerations](#production-considerations)
- [Future integrations](#future-integrations)

---

## Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Runtime | **Expo (SDK 57) + React Native 0.86** | Managed workflow, OTA updates, no Xcode/Android Studio needed to iterate. Ejecting stays available. |
| Language | **TypeScript (strict)** | The scoring and risk engines are the product; their types are the contract. |
| Navigation | **expo-router** | File-based routing, typed params, deep links for free — needed for `mova://token/<address>`. |
| Server state | **TanStack Query v5** | Caching, deduplication, background refetch and pagination. Per-data-class stale times keep MOVA off the upstream rate limits. |
| Client state | **Zustand + AsyncStorage** | Watchlist, alerts, journal and settings are small, local and persistent. Every store validates rehydrated data. |
| Animation | **Reanimated 4 + Gesture Handler** | UI-thread animation for charts, sheets and swipe rows. |
| Charts | **react-native-svg** | Hand-drawn sparklines, score rings and equity curves; no chart library to fight for control. |
| Sheets | **@gorhom/bottom-sheet v5** | Progressive disclosure — explanations and filters live one layer down. |
| Testing | **Jest + jest-expo + Testing Library** | Unit tests on pure logic, component tests where they earn their place. |

### Decisions worth flagging

- **Expo over bare RN.** The MVP needs zero native modules that Expo does not already ship. Reversible: `expo prebuild` gets you native projects when you need one.
- **Score computed on-device, not fetched.** `computeMovaScore` is pure and cheap, memoised off the token query. This guarantees the score on screen always matches the data on screen — they cannot arrive from different refreshes.
- **Alerts evaluated on-device.** A sweep runs every 45s while the app is foregrounded. No server scheduler, no push infrastructure, and the app is genuinely useful today. The rule logic in `core/alert-rules.ts` is pure, so it moves to a backend worker unchanged when push delivery is added.
- **No authentication in the MVP.** MOVA stores no funds and no credentials — everything is user-authored local content. Auth becomes necessary only when watchlists need to sync across devices.

---

## Architecture

```
app/                      expo-router routes (screens only, thin)
  (tabs)/                 Home · Discover · Watchlist · Alerts · Profile
  token/[address].tsx     the token detail page
  alerts/new.tsx          rule builder
  tools/                  risk · journal · paper · trade form
  compare.tsx

src/
  core/                   PURE LOGIC — no React, no I/O, fully tested
    scoring.ts            the MOVA score model
    alert-rules.ts        rule evaluation
    risk.ts               position sizing
    journal-stats.ts      win rate, expectancy, drawdown
    watchlist.ts          row assembly and sorting
    normalize.ts          untrusted-payload coercion
    format.ts             every number the user sees
    input.ts              numeric text-field handling
    math.ts               ramps, bands, weighted means

  data/
    providers/            THE SWAPPABLE BOUNDARY
      types.ts            provider interfaces
      mock/               offline generator
      http/               MOVA backend client
      index.ts            registry — the only file that picks a source
    queries.ts            TanStack Query hooks + cache policy
    alert-engine.ts       foreground sweep loop
    venues.ts             outbound trade links

  store/                  Zustand: watchlist, alerts, journal, compare, settings
  features/               composed, domain-aware components
  ui/                     the design system
  theme/                  colours, type scale, spacing, motion
```

The rule is one-directional: `app` → `features` → `ui`, and anything may import `core`. **`core` imports nothing but `core`** — which is exactly why it is testable without a renderer or a network.

---

## The MOVA score

A 0–100 score built from five weighted components. Nothing about it is mysterious: every component is tappable and explains itself in plain language.

| Component | Weight | Reads |
| --- | --- | --- |
| 🛡 Safety | 30% | mint/freeze authority, LP burn or lock, holder concentration, deployer behaviour, insider/bundle/sniper cohorts, whether sells succeed |
| 💧 Liquidity | 22% | pool depth against market cap, absolute depth, 24h trend |
| 🚀 Momentum | 20% | price direction, turnover against the pool, buy/sell balance |
| 🐋 Smart Money | 16% | net flow from large and historically profitable wallets |
| 📱 Social | 12% | mention growth, breadth of authors, bot-likeness, KOL activity |

Three properties matter more than the weights:

- **Missing data is not zero.** A component with no signal returns `null` and drops out of the weighted mean. A token we know nothing about is not the same as a token we know to be bad.
- **Confidence is reported.** `confidence` is the share of the model that actually had data behind it. Below `MIN_CONFIDENCE` (0.35) the total is **withheld entirely** rather than published as a misleading number.
- **Risk is not the inverse of the score.** Risk is driven by safety, depth and age only, so a token can be simultaneously high-momentum and high-risk — which is the normal case in this market.

A failing sell check is a hard override: safety goes to 0 and risk to `high`, whatever else is true.

---

## Data providers

Every upstream sits behind an interface in `src/data/providers/types.ts`:

```ts
MarketDataProvider   // overview, trending, movers, unusual volume
TokenDataProvider    // discover, detail, summaries, candles, search
HolderDataProvider   // top holders
WalletDataProvider   // wallet events
SocialDataProvider   // social signal
AnalysisProvider     // the written analysis layer
```

Every method resolves to `WithMeta<T>`:

```ts
interface DataMeta {
  origin: 'live' | 'mock';
  fetchedAt: number;
  sources: string[];      // e.g. ['DexScreener', 'Helius']
  missing?: string[];     // fields the provider could not supply
}
```

The origin **travels with the data**, which is what lets the UI label demo figures honestly rather than relying on a global flag that can drift out of sync.

Swapping DexScreener for Birdeye, or the mock generator for a live backend, is a change to the factory in `src/data/providers/index.ts` and nothing else. No screen imports a concrete provider.

---

## Demo mode vs live data

MOVA is **fully usable with no API keys at all.** The mock bundle generates a realistic universe of tokens, holders, wallet events, social signals and candles.

Demo data is never presented as real:

- an amber `DEMO DATA` badge renders on every screen that shows generated figures
- alert rows generated from mock data say *"From demo data"*
- the token detail disclaimer names it explicitly
- Profile shows the active provider and its origin

`getConfiguredMode()` falls back to mock if `EXPO_PUBLIC_DATA_MODE=live` but `EXPO_PUBLIC_API_URL` is unset — a misconfiguration produces labelled demo data, never a blank app.

---

## Setup

**Requirements:** Node 22+ (developed on 24), npm 10+, and the Expo Go app on a phone (or an iOS/Android simulator).

```bash
npm install
```

```bash
cp .env.example .env
```

The defaults in `.env.example` run MOVA in demo mode, which needs nothing else.

### Windows: two things that will bite you

**1. Install the Visual C++ Redistributable.** Jest's resolver (`jest-resolve` → `unrs-resolver`) is a native module. Without the VC++ runtime the `.node` binary fails to load, and — because the failure is swallowed — every module resolution silently returns `null`. The symptom is not a missing-DLL error but:

```
Preset jest-expo not found relative to rootDir
```

On a fresh machine:

```bash
winget install --id Microsoft.VCRedist.2015+.x64 -e
```

**2. npm 11+ blocks install scripts by default.** `unrs-resolver` needs its postinstall to link that binding. If tests still fail to resolve after installing the runtime:

```bash
npm approve-scripts unrs-resolver
```

**Do not upgrade ESLint past 9.x.** `eslint-config-expo@57` pulls `eslint-plugin-react@7.37`, which calls `context.getFilename()` — removed in ESLint 10. Linting dies with `contextOrFilename.getFilename is not a function`. The peer range (`>=8.10`) is too loose to prevent it, so the version in `package.json` is deliberate.

---

## Environment variables

Anything prefixed `EXPO_PUBLIC_` **ships inside the app bundle and is readable by anyone who downloads it.** Never put a secret there.

### App (`.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_DATA_MODE` | `mock` | `mock` for the offline demo, `live` to call the backend |
| `EXPO_PUBLIC_API_URL` | `http://localhost:8787` | Backend base URL; only read when mode is `live` |
| `EXPO_PUBLIC_MOCK_SEED` | `mova-2025` | Deterministic demo data across devices |

### Backend (`server/.env`) — never in the app

| Variable | Purpose |
| --- | --- |
| `PORT` | Listen port |
| `BIRDEYE_API_KEY` | Market and holder data |
| `HELIUS_API_KEY` | On-chain authority and holder queries |
| `ANTHROPIC_API_KEY` | The written analysis layer |
| `X_BEARER_TOKEN` | Social signal |
| `UPSTREAM_CACHE_TTL_MS` | Shared upstream cache window |

Upstream credentials live **only** on the server. The app talks to MOVA's backend; the backend talks to vendors.

---

## Running locally

```bash
npm start
```

Then scan the QR code with Expo Go, or press `i` / `a` for a simulator.

```bash
npm run android
```

```bash
npm run ios
```

---

## Testing

```bash
npm test
```

```bash
npm run verify
```

`verify` runs typecheck, lint and tests together — the gate to run before committing.

Coverage concentrates on the logic that would be dangerous to get wrong:

- **Scoring** — weighting, null handling, confidence withholding, honeypot override, risk banding
- **Alert rules** — threshold crossing vs staying above, change rules needing prior state, cooldowns, divide-by-zero, breakout requiring price *and* turnover together
- **Risk calculator** — position capping, inverted targets, sub-1:1 warnings, invalid input
- **Journal stats** — win rate, profit factor with no losses, expectancy, max drawdown
- **Normalization** — malformed payloads, missing fields, extreme values, hostile strings
- **Input parsing** — half-typed decimals, exponential notation, NaN and Infinity
- **Watchlist assembly** — missing summaries, non-finite metrics, nulls-last sorting

The consistent theme: **missing data must never become a plausible-looking number.**

---

## Screens

| Screen | What it is for |
| --- | --- |
| **Home** | Market pulse, trending rail, movers/unusual volume, recent alerts |
| **Discover** | Preset-led filtering with an advanced sheet, debounced search, infinite scroll |
| **Token detail** | Chart, MOVA score with tappable components, written analysis, safety panel, smart money, social, trade-out |
| **Watchlist** | Saved tokens with score drift since you added them, momentum, liquidity, alert coverage |
| **Alerts** | The fired feed and the armed rules, with a rule builder |
| **Compare** | Up to four tokens side by side across every score component |
| **Risk calculator** | Fixed-fractional position sizing, leading with the loss |
| **Journal** | Real and paper records kept strictly separate, with win rate, expectancy and drawdown |
| **Paper trading** | A simulated $10,000 account, marked to market from the live provider |
| **Profile** | Data source, preferences, risk defaults, local data, what MOVA is and is not |

---

## Security

- **Token metadata is untrusted.** Names, symbols and links come from third parties and are coerced through `core/normalize.ts` before they reach a screen. Strings are length-capped; numbers are checked for finiteness.
- **Addresses are validated before use.** `isSolanaAddress` gates every URL built from an address, so a hostile "address" cannot be used to construct a link.
- **Outbound links are `https` only,** opened in an in-app browser that does not share MOVA's context.
- **No secrets in the app.** Upstream keys live on the server.
- **No wallet, no keys, no signing.** There is no code path that could request or store one.
- **Rehydration is guarded.** Persisted state written by an older build can be any shape; every store validates it and falls back to a clean state rather than crashing.

---

## Production considerations

Before this carries real users:

1. **Move alerts server-side.** The foreground sweep is honest for an MVP but stops when the app closes. A worker plus Expo push notifications makes alerts reliable — `core/alert-rules.ts` runs unchanged.
2. **Build the backend.** `server/` is a placeholder. It needs the provider endpoints, an upstream cache, and per-IP rate limiting.
3. **Add error reporting.** Sentry or similar, with breadcrumbs from the query layer.
4. **Rate-limit budgeting.** Stale times are tuned for a demo. Real vendor quotas should drive them, with a shared server-side cache in front.
5. **Accessibility audit with a real screen reader.** Labels are in place throughout; they have not been walked end to end with VoiceOver or TalkBack.
6. **Auth, if watchlists need to sync.** Not before.

---

## Future integrations

- Birdeye / DexScreener / Helius behind the live provider bundle
- An LLM analysis provider replacing the deterministic writer in `providers/analysis.ts`
- X and FOMO social signals with bot-likeness scoring
- Push notification delivery for alerts
- Wallet-address *watching* (read-only, never custody)

---

## Licence

See [LICENSE](LICENSE).
