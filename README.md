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
- [The API](#the-api)
- [Free tools](#free-tools)
- [Demo mode vs live data](#demo-mode-vs-live-data)
- [Deployment](#deployment)
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
| Backend | **Hono on Node** | Tiny, fast, excellent TypeScript. Runs on Node today and ports to Cloudflare Workers or any container host without a rewrite. |
| Hosting | **Render free tier** | The only major platform still offering a real free tier with no credit card. Fly.io's free tier no longer exists for new accounts; Railway's is a trial credit that runs out. |
| Backend testing | **Vitest** | Fast, zero-config with TS, and does not fight `jest-expo` in the same repo. |
| Testing | **Jest + jest-expo + Testing Library** | Unit tests on pure logic, component tests where they earn their place. |

### Decisions worth flagging

- **Expo over bare RN.** The MVP needs zero native modules that Expo does not already ship. Reversible: `expo prebuild` gets you native projects when you need one.
- **Score computed on-device, not fetched.** `computeMovaScore` is pure and cheap, memoised off the token query. This guarantees the score on screen always matches the data on screen — they cannot arrive from different refreshes. The server computes it with the same function for its list endpoints.
- **DexScreener as the keyless baseline.** Choosing an upstream that needs no credential is why live mode works out of the box. A product that requires three signups before it shows anything real is a product most people never see working.
- **The backend shares `src/core` rather than reimplementing it.** One scoring model, one normaliser, two runtimes. They cannot drift.
- **Every upstream is free and most need no key.** See [Free tools](#free-tools) — the whole data layer costs nothing, and only the on-chain RPC benefits from a (free) account.
- **Recorded history as the chart's fallback, not its basis.** DexPaprika serves real OHLCV keylessly. If it is unreachable the server falls back to prices it observed itself, so the chart degrades to a shorter honest one rather than disappearing.
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

server/                   the backend — separate package, own runner
  src/
    app.ts                Hono routes, CORS, rate limiting, error shaping
    config.ts             env parsing; the only place a key is read
    cache.ts              TTL cache with single-flight
    http.ts               outbound fetch: timeouts, retries, size caps
    rate-limit.ts         per-IP sliding window
    upstream/
      dexscreener.ts      market data — no credential required
      solana-rpc.ts       mint authority, holder concentration
    services/
      universe.ts         tracked token set, ranking, price recorder
      tokens.ts           detail assembly, scoring, summaries
      market.ts           overview aggregates
      discover.ts         filter, sort, paginate
      history.ts          recorded candles and sparklines
```

The rule is one-directional: `app` → `features` → `ui`, and anything may import `core`. **`core` imports nothing but `core`** — which is exactly why it is testable without a renderer or a network.

### The server shares the app's core

`src/core` is pure TypeScript with no React and no React Native, so the backend imports it directly rather than reimplementing it. The scoring model, the payload normalisation and the analysis writer all run in both places from one source.

That is not a convenience. It means **the score the server publishes is by construction the score the client would have computed** — the two cannot drift into disagreeing about the same token, because there is only one implementation.

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

## The API

Read-only, JSON, no authentication. Every response is `{ data, meta }`.

| Endpoint | Returns |
| --- | --- |
| `GET /health` | Uptime, active upstreams, tracked-token count, cache hit rate |
| `GET /v1/market/overview` | SOL price, sentiment, breadth, aggregate volume |
| `GET /v1/market/trending` | Ranked by turnover against pool depth |
| `GET /v1/market/movers` | Ranked by absolute 24h move |
| `GET /v1/market/unusual` | Volume far out of line with liquidity |
| `GET /v1/tokens?…` | Filtered, sorted, paginated discovery |
| `GET /v1/tokens/:address` | Full detail — market, security, wallets, social |
| `GET /v1/tokens/batch?addresses=` | Summaries for many mints in one call |
| `GET /v1/tokens/:address/candles?tf=` | OHLCV from recorded history |
| `GET /v1/tokens/:address/holders` | Largest holders, pools and burns labelled |
| `GET /v1/tokens/:address/social` | Project links; metrics when a key is set |
| `GET /v1/tokens/:address/analysis` | The written analysis |
| `GET /v1/search?q=` | Search across DexScreener, not just tracked tokens |

The `meta` object is the honest half of the contract:

```json
{
  "origin": "live",
  "fetchedAt": 1757548800000,
  "sources": ["DexScreener", "Solana RPC"],
  "missing": ["top10HolderPct", "holders", "smartMoney"]
}
```

`sources` is what answered. `missing` is what could not be obtained — the app reads it to render "Data unavailable" instead of a zero, and to tell the user which signals the analysis did not account for.

**Rankings are computed, not bought.** DexScreener's boost feeds are paid placement, so they are used only to assemble a candidate set. What MOVA actually promotes is decided here, on measured turnover and price action.

---

## Free tools

MOVA runs end to end on free infrastructure. Nothing below requires a paid plan, and only one requires an account.

### In use

| What | Source | Cost | Key needed |
| --- | --- | --- | --- |
| Prices, liquidity, volume, txns, pair age, logos, project links | [DexScreener](https://docs.dexscreener.com/api/reference) | Free, 300 req/min | **No** |
| Historical OHLCV candles | [DexPaprika](https://docs.dexpaprika.com) | Free, ~200K req/month | **No** |
| Mint authority, freeze authority, holder concentration | Solana JSON-RPC | Free | **No** (public node, throttled) |
| Same, without throttling | [Helius](https://helius.dev) | Free tier, 1M credits/month | Yes — free, no card |
| Hosting | [Render](https://render.com) | Free tier | Account only, **no card** |

### Evaluated and rejected

| Option | Why not |
| --- | --- |
| **Fly.io** | Free tier no longer exists for new accounts. Card required, trial is ~2 VM-hours |
| **Railway** | Starts without a card but the $5 credit expires — not sustainably free |
| **Bitquery** | 7-day trial, then $49/month. Would have covered wallet flows and holder counts |
| **Birdeye** | Free tier exists but is key-gated and rate-limited below what MOVA needs; DexPaprika covers OHLCV without a key |
| **LunarCrush** | Free tier is now market-data only — social sentiment moved behind payment |

### Still unfilled, and the free options that exist

- **Holder count** — Helius `getTokenAccounts` can count them within the free 1M credits, at roughly one paged call per token. Not yet wired up.
- **Wallet-level flows** (whale buys, smart money, deployer selling) — no free source found. Bitquery is the natural fit at $49/month. This is the one genuinely paid gap.
- **Social metrics** — [Alternative.me Fear & Greed](https://alternative.me/crypto/fear-and-greed-index/) is free and unauthenticated but market-wide, not per-token. CoinGecko's free tier carries basic per-token community counts. Neither gives the mention velocity or bot-likeness the social panel is designed around.

Where a signal has no free source, MOVA reports it as unavailable rather than approximating it.

---

## Demo mode vs live data

Both modes run with **no API keys at all**, which is the point worth understanding before reading further.

**Demo mode** generates a realistic universe locally — tokens, holders, wallet events, social signals, candles. No network, no backend, no signup.

**Live mode** serves real Solana market data. DexScreener needs no credential and the public Solana RPC needs no credential, so `npm start` in `server/` with an empty `.env` returns real prices, real liquidity, real transaction counts and real mint-authority checks. Keys buy depth and reliability, not basic function.

Neither is ever presented as the other:

- an amber `DEMO DATA` badge renders on every screen showing generated figures; a green `LIVE DATA` badge replaces it when the data is real
- the badge is driven by `meta.origin`, which travels *attached to the payload* rather than read from a global flag — a screen cannot show the wrong label while holding the other kind of data
- alert rows generated from mock data say *"From demo data"*
- Profile names the active provider and its origin

`getConfiguredMode()` falls back to mock if `EXPO_PUBLIC_DATA_MODE=live` but `EXPO_PUBLIC_API_URL` is unset — a misconfiguration produces labelled demo data, never a blank app.

### What live mode cannot tell you

This matters more than the feature list. Without vendor keys the backend cannot read holder counts, deployer behaviour, insider or sniper concentration, sell simulation, or social metrics. Every one of those returns `null` and is named in the response's `meta.missing`.

The app then renders "Data unavailable" rather than a zero, the score model drops those signals from its weighting instead of scoring them badly, and the token page reports its own coverage — *"Based on 72% signal coverage"*. A partially-informed score says so.

The risk verdict goes further: MOVA will not call a token **low risk** on authority checks alone, however clean they look. Passing the two checks that could run is not evidence about the four that could not, so a thinly-covered token is held at *moderate*.

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

**3. Do not append to `.env` with `>>` in PowerShell 5.1.** It writes UTF-16, so the appended line arrives null-padded — `H·E·L·I·U·S·_·A·P·I·…` — and `dotenv` silently fails to parse it. The key looks set and behaves as though it is missing, with no error anywhere. Use an editor, or force the encoding:

```bash
Add-Content server/.env "HELIUS_API_KEY=your-key" -Encoding utf8
```

To check a key actually loaded:

```bash
cd server && node -e "require('dotenv').config(); console.log(!!process.env.HELIUS_API_KEY)"
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

**Every one of these is optional.** The server runs and serves real data with this file empty.

| Variable | Default | What it buys |
| --- | --- | --- |
| `PORT` | `8787` | — |
| `HELIUS_API_KEY` | unset | Replaces the RPC endpoint. The public node is heavily throttled, so without this the safety checks intermittently report unavailable |
| `SOLANA_RPC_URL` | public mainnet | Any RPC provider, if not Helius |
| `BIRDEYE_API_KEY` | unset | Historical OHLCV. Without it, charts are built from prices this server has recorded since it started |
| `X_BEARER_TOKEN` | unset | Social metrics. Without it they report unavailable rather than being estimated |
| `ANTHROPIC_API_KEY` | unset | Not required — the deterministic writer is the safer default, since it can only describe data it was given |
| `UPSTREAM_CACHE_TTL_MS` | `15000` | Shared cache window |
| `RATE_LIMIT_PER_MINUTE` | `120` | Per-IP ceiling |

Upstream credentials live **only** on the server. The app talks to MOVA's backend; the backend talks to vendors. Nothing in `server/.env` is ever serialised into a response — that is the entire reason the backend exists.

---

## Running locally

### Demo mode — no backend needed

```bash
npm start
```

Scan the QR code with Expo Go, or press `i` / `a` for a simulator.

### Live mode — real Solana data

Start the backend first, in its own terminal:

```bash
cd server && npm install && npm run dev
```

It prints what it can and cannot do on startup. Then point the app at it in `.env`:

```bash
EXPO_PUBLIC_DATA_MODE=live
```

and start the app as above. The badge turns from amber `DEMO DATA` to green `LIVE DATA`.

**A physical phone cannot reach your `localhost`.** Set `EXPO_PUBLIC_API_URL` to this machine's LAN address instead — `http://192.168.1.x:8787`. An Android emulator can use `adb reverse tcp:8787 tcp:8787`.

### Checking the backend

```bash
curl http://localhost:8787/health
```

Reports uptime, which upstreams are active, how many tokens are tracked, cache hit rate, and how many price samples have been recorded.

---

## Testing

```bash
npm test
```

```bash
npm run verify
```

`verify` runs typecheck, lint and tests together — the gate to run before committing.

The backend is a separate package with its own runner. Vitest rather than Jest, because it is a Node service and does not belong under `jest-expo`:

```bash
cd server && npm run verify
```

**244 tests total** — 182 app, 62 server. Coverage concentrates on the logic that would be dangerous to get wrong:

**App**

- **Scoring** — weighting, null handling, confidence withholding, honeypot override, risk banding, and that a thinly-covered token is never cleared as low risk
- **Alert rules** — threshold crossing vs staying above, change rules needing prior state, cooldowns, divide-by-zero, breakout requiring price *and* turnover together
- **Risk calculator** — position capping, inverted targets, sub-1:1 warnings, invalid input
- **Journal stats** — win rate, profit factor with no losses, expectancy, max drawdown
- **Normalization** — malformed payloads, missing fields, extreme values, hostile strings
- **Input parsing** — half-typed decimals, exponential notation, NaN and Infinity
- **Watchlist assembly** — missing summaries, non-finite metrics, nulls-last sorting

**Server**

- **Holder classification** — that a liquidity vault is excluded from concentration, that a burn is accounted separately, and that a throttled RPC reports *unknown* rather than *clean*. Pinned against recorded response shapes, because the public RPC is too rate-limited to exercise this reliably against the live network
- **Cache** — TTL expiry, and that twenty concurrent misses collapse to one upstream request. A failed production is never cached, so a broken screen recovers as soon as the upstream does
- **Discover filters** — that a token whose value for a filtered field is *unknown* is kept, while a known value that fails is dropped. Excluding unknowns would silently empty the list on a keyless deployment, which reads as a broken app rather than an uninformed one
- **Recorded history** — that gaps in observation produce gaps in the chart rather than a carried-forward flat line, and that a 24h liquidity trend is withheld until 24 hours have actually been watched
- **DexScreener mapping** — hostile token metadata: bidi overrides, control characters, 5000-character names, `javascript:` logo URLs

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
- **No secrets in the app.** Upstream keys are read in exactly one file, `server/src/config.ts`, and are never serialised into a response.
- **No wallet, no keys, no signing.** There is no code path that could request or store one.
- **Rehydration is guarded.** Persisted state written by an older build can be any shape; every store validates it and falls back to a clean state rather than crashing.
- **The backend treats its own upstreams as hostile.** Bounded timeouts, capped response sizes, and a non-JSON body rejected rather than parsed — a 200 carrying HTML means a proxy answered, not the API.
- **Errors do not leak.** Internal messages and stacks stay in the log; clients get a sentence.

---

## Deployment

The backend deploys to [Render](https://render.com)'s free tier. `render.yaml` at the repo root is a blueprint — Render reads it and configures everything.

1. **New → Blueprint** on Render, point it at this repo. It finds `render.yaml`, sets `rootDir: server`, and builds.
2. Add `HELIUS_API_KEY` in the dashboard when prompted. It is marked `sync: false` so no key is ever stored in the repo.
3. Point the app at the deployed URL:

```bash
EXPO_PUBLIC_API_URL=https://mova-api.onrender.com
```

**The free instance sleeps after ~15 minutes idle and takes roughly 30 seconds to wake.** The first request after an idle period is slow; the rest are not. For MOVA that is an acceptable trade, and sleeping also stops it polling DexScreener while nobody is using it.

`server/Dockerfile` exists so the platform choice stays reversible — Koyeb, Railway, Cloud Run or any container host takes it unchanged. Build context is the **repo root**, not `server/`, because the backend imports the app's `src/core`:

```bash
docker build -f server/Dockerfile -t mova-api .
```

A note on why the container runs TypeScript directly rather than compiled JavaScript: `tsc` does not rewrite path aliases on output, so a compiled build would emit unresolvable `@/core/…` imports. `tsx` resolves them at runtime, which is why it is a runtime dependency rather than a dev one.

---

## Production considerations

Before this carries real users:

1. **Persist recorded history.** It currently lives in memory, so charts reset when the server restarts. This is one file (`services/history.ts`) and a table.
2. **Move alerts server-side.** The foreground sweep is honest for an MVP but stops when the app closes. A worker plus Expo push notifications makes alerts reliable — `core/alert-rules.ts` is pure and runs unchanged.
3. **Get a Helius key.** The public RPC's throttling is the single biggest quality gap in live mode: it is why holder concentration frequently reports unavailable, and why most tokens sit at *elevated* risk.
4. **Shared cache and rate limiter.** Both are in-process, which is correct for one instance and wrong for two. `cache.ts` and `rate-limit.ts` are the only files that change.
5. **Add error reporting.** Sentry or similar, with breadcrumbs from the query layer.
6. **Accessibility audit with a real screen reader.** Labels are in place throughout; they have not been walked end to end with VoiceOver or TalkBack.
7. **Auth, if watchlists need to sync.** Not before.

---

## Future integrations

- **Birdeye** — historical OHLCV, replacing recorded history; holder counts
- **Helius** — an unthrottled RPC, plus deployer identification and launch analysis for the insider, sniper and bundle signals
- **An LLM analysis provider** replacing the deterministic writer in `providers/analysis.ts` — behind the same `AnalysisProvider` interface, so it is a factory change
- X and FOMO social signals with bot-likeness scoring
- Push notification delivery for alerts
- Wallet-address *watching* (read-only, never custody)

---

## Licence

See [LICENSE](LICENSE).
