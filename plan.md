# SignalScope — implementation plan

## Product scope

SignalScope is a polished, responsive analyst workspace for explainable financial-risk intelligence. It has one provider-backed Live workspace for NewsAPI-compatible news articles, SEC EDGAR filing metadata, and Yahoo Finance market quotes through the managed API hub. There is no Demo mode or sample-data fallback. The UI must never imply quote freshness beyond the provider timestamp, guaranteed predictions, or financial advice.

The app uses a Vite + React + TypeScript frontend plus a Node server runtime. `src/data.ts` remains a legacy fixture module and is not surfaced in the Live-only UI; `server/providers.ts` and `server/marketData.ts` provide NewsAPI-compatible, SEC EDGAR, and Yahoo Finance adapters with explicit unavailable/error states. Live market quotes are provider facts, not model analysis, and never fall back to a local price list.

## Implementation approach

- Build a Vite + React + TypeScript single-page application with client-side view state rather than a heavy router. Views are Overview, Events, Companies, Portfolio Stress Test, and Methodology.
- Use reusable components for the app shell, sidebar/mobile nav, top bar, KPI cards, event rows/cards, source badges, score bars, charts, detail drawer, provider-status panel, live company directory, and scenario controls.
- Normalize provider records in the server layer before they enter typed event/detail views. Keep generic scenario assumptions separate from retrieved sources; do not seed the active workspace with companies, events, or holdings.
- Retrieve stock prices and daily OHLCV through the built-in `YahooFinance/get_stock_chart` API-hub operation using the server-only `MANUS_API_URL` and `MANUS_API_KEY` runtime variables. Keep source quote time, retrieval time, original Yahoo Finance quote links, per-symbol errors, and stale snapshots separate from model-analysis fields. Default symbols are AAPL, MSFT, and GOOGL; optional `MARKET_DATA_SYMBOLS` replaces that watchlist.
- Use CSS for the visual system and responsive behavior. Prefer inline SVG/CSS charts over extra chart dependencies so the demo stays lightweight and deterministic.
- Use a small state model in `App.tsx` (or extracted hooks) for active view, provider event/quote snapshots, selected event/company, filters, search, stress scenario, shock assumptions, and reset behavior.
- Add accessible labels, keyboard-friendly buttons/inputs, clear text labels for sentiment, source provenance, provider state, and explicit hypothetical-scenario disclaimers.
- Add `public/manus-routes.json` with all user-facing routes represented by the SPA entry (`/`, `/events`, `/companies`, `/portfolio`, `/methodology`) so the preview route manifest is explicit.

## Design direction

### Design movement

**Editorial financial intelligence**: a calm, premium research-terminal interpretation with the hierarchy and restraint of an analyst memo, not a noisy trading screen.

### Core principles

1. **Traceable before dramatic** — evidence, source type, confidence, and last updated time stay close to each signal.
2. **Quiet authority** — deep navy type, pale blue-gray surfaces, teal confidence cues, and amber caution accents replace alarmist red-on-black dashboards.
3. **Progressive disclosure** — overview cards stay scannable; event detail, methodology, and assumptions open into focused panels.
4. **Human review is visible** — source labels, limited-evidence notes, and plain-language explanations appear at the moment of decision.

### Color philosophy

Use an off-white canvas (#F6F8FB) and white cards for a bright workspace. Deep ink navy (#12233F) provides stable reading contrast. A signature blue-teal (#0F7B83) marks traceable signal state and positive motion without implying certainty. Muted amber (#C98A2E) denotes watch conditions and assumptions. Slate neutrals carry secondary metadata. Use sentiment labels and icons in addition to color.

### Layout paradigm

A **left rail + evidence canvas**: a slim desktop rail anchors navigation and product identity while the main canvas uses a wide overview band followed by asymmetric evidence and impact panels. On mobile, the rail collapses to a compact sticky bottom/nav row and cards stack into a single reading stream.

### Signature elements

- **Signal spine**: a thin teal vertical rule and micro-timeline treatment on event details and list rows.
- **Evidence chips**: compact badges that combine source class with reliability language (Official, Reported, Unverified).
- **Scenario delta ribbon**: a horizontal before/after strip in the stress tester that makes assumptions legible at a glance.

### Interaction philosophy

Interactions should feel like analyst exploration: filters refine without losing context, selecting an event opens a side drawer rather than a hard context switch, company names behave like deliberate links, and every scenario exposes its assumptions. There is no demo walkthrough or sample-data mode; no action silently changes provider data.

### Animation

Use restrained 150–220ms ease-out transitions: cards lift 2px on hover, selected nav items glide a background tint, side drawers slide from the right, charts animate once on scenario change, and intake stages progress with a subtle pulse. Avoid looping motion except for the short intake processing indicator.

### Typography system

Use a high-legibility sans stack: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Use 11–12px uppercase tracked labels for metadata, 14–16px body copy, 18–22px card headings, and 30–38px dashboard figures. Reserve semibold weight for hierarchy and use tabular numerals for scores and prices.

### Brand essence

**Positioning:** Explainable risk signals for people who need to see the evidence before they make a call.

**Personality:** observant, measured, transparent.

**Brand voice:** concise, grounded, and explicit about uncertainty.

Example lines:
- “See the signal. Follow the evidence.”
- “Illustrative scenario estimates — not forecasts.”

### Wordmark and logo

Use a custom CSS/SVG mark made from three offset vertical signal bars inside a rounded square, with the middle bar extending into a small node. Pair it with a bold “SignalScope” wordmark and a small “risk intelligence” eyebrow rather than relying on an icon font.

### Signature brand color

Signal teal (#0F7B83), used sparingly for active navigation, traceability lines, confidence cues, and interactive focus states.

## Screen behavior

### Overview

Header with wordmark, a Live data pill, global search, and provider status. KPI cards summarize retrieved active events, high-impact events, affected companies, and a “No portfolio connected” state. Main content: provider-backed risk signals, current-refresh activity, source mix, market quote cards, and a short “how scores are estimated” card. Startup automatically requests the configured feeds.

### Event explorer

Search and filter bar for company, category, sentiment, impact, source type, and date range. Event cards show headline, summary, affected company links, category, signed sentiment, impact, confidence, first/last seen, independent-source count, and source badges. Official/filing evidence is visually distinct from reported and unverified items.

### Event detail

Right-side drawer on desktop and full-screen sheet on mobile. Include plain-language explanation, model-analysis impact reasoning, evidence quality note, source timeline/timestamps, affected-company links, clickable original provider sources, and a what-could-change section.

### Provider connections

The Overview shows live provider status, setup requirements, coverage, retrieval time, refresh progress, and honest empty/error/stale states. The app does not offer pasted-source or URL-to-demo intake.

### Company profile

Live company directory derived from provider-matched issuers and source-backed events. Show a sourced quote when available; do not infer supply-chain relationships, issuer facts, or prices from local fixtures.

### Portfolio stress test

Scenario selector covers interest-rate, geopolitical, credit, supply-chain, and policy/operational assumptions. Sliders adjust severity and duration, and Reset restores the scenario controls. Until actual user holdings are connected, show no portfolio values, contributions, or sample positions; explain that scenario settings do not calculate exposure without a portfolio.

### Methodology

Expandable/sectioned cards explain source facts, model-generated sentiment/category/impact/confidence, evidence limits, quote freshness, empty/error/stale states, and human review. Include a compact formula explainer and an explicit “signals can be wrong” note.

## Project structure

```text
signalscope/
├── plan.md
├── TODO.md
├── SETUP.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── server/
│   ├── index.ts                 # HTTP routes, health, and static/Vite serving
│   ├── providers.ts             # News and SEC record normalization + risk analysis
│   └── marketData.ts            # Yahoo Finance API-hub quote adapter and status
├── index.html
├── public/
│   ├── manus-routes.json
│   └── favicon.svg
└── src/
    ├── main.tsx                 # React entry and stylesheet imports
    ├── App.tsx                  # Views, navigation, filters, and app state
    ├── MarketDataPanel.tsx      # Sourced quote cards and explicit empty/error states
    ├── styles.css               # Existing visual system and responsive styles
    ├── types.ts                 # Shared event, provider, quote, and portfolio types
    └── data.ts                  # Legacy local fixtures; never surfaced in Live-only views
```

## Build workflow

1. Create the minimal Vite/React/TypeScript package and route manifest.
2. Register TypeScript diagnostics through the managed Webdev runtime before the first application code batch.
3. Implement provider-backed views and reusable components with the visual system above; do not expose fixture data.
4. Start the Vite dev server on the configured port 3000, verify local readiness and route manifest HTTP 200.
5. Run the project build/type checks and inspect the managed diagnostics output; fix any actionable issues.
6. Use a read-only implementation review against this plan and the original specification, then make focused corrections.
7. Commit the complete implementation to the project repository and verify the resulting checkpoint. Do not publish externally unless explicitly requested.

## Real-provider extension — approved scope

The provider-backed release adds **NewsAPI-compatible live news** and **SEC EDGAR official filing metadata** alongside Yahoo Finance quotes; the current product runs as a single Live workspace. The browser calls only relative `/api/*` routes; provider credentials remain in protected server-side environment variables. The server normalizes records, applies deterministic model-analysis fields, preserves source facts and original links, groups duplicate records, and returns explicit connection, loading, rate-limit, error, stale, empty, and not-configured states rather than substituting fictional results.

The provider contract is implemented in `server/providers.ts`, with `server/index.ts` serving the Vite app in development and the built frontend plus API in production. `NEWS_API_KEY` is optional at runtime but configured through secure project secrets for live news. `SEC_USER_AGENT` is required for live SEC access and `SEC_CIKS` is optional with documented defaults and validation. `SETUP.md` records required values, startup, provider coverage, and limitations.

The UI has a Data connections panel with startup and manual refresh, per-provider status, coverage, last successful retrieval, and setup requirements; it has no Demo mode switch. Live records are individually labeled with `origin`, provider, published/retrieved timestamps, text availability, official status, filing metadata, evidence excerpts, and a separate source-facts view. Only provider-backed records are shown. No fixture prices or synthetic portfolio values appear; without connected user holdings, the portfolio view remains empty except for clearly labeled scenario assumptions.

## Market-data extension — requested scope

The managed server calls the built-in Yahoo Finance chart API through the platform API hub; the client never receives platform credentials. The quote adapter reads the last regular-market price and prior close, returns only provider-supplied observations with timestamps and a direct source link, and reports `not_configured`, empty, partial, error, or stale states without fabricating fallback values. Manual provider refresh updates news, filings, and quotes together. The Live Overview and Live company view display quote cards separately from risk/model analysis. `SETUP.md` documents the automatically supplied platform runtime variables, optional symbol override, local startup behavior, and quote-coverage/freshness limitations.


## Preview usability refinement — superseded by Live-only startup

The earlier Demo-to-Live transition was superseded: app startup now initiates the provider refresh, with manual refresh available for later updates. News filtering requires a tracked issuer and material business-event context in article headline/description; body-only keyword hits cannot create Live events. Provider empty/error states remain explicit and no sample records are used.


## Live-only operation — current request

This revision replaces the Demo/Live mode switch with a single provider-backed workspace. Remove visible demo controls and fixture-driven event/source intake; on app startup, retrieve configured news, official SEC filing metadata, and market quote feeds once, while keeping manual refresh and provider error/empty/stale states explicit. Never show local fixtures. Keep navigation, search, filters, event detail, company view, scenario controls, and reset. Because no portfolio connector exists, do not display sample holdings or dollar valuations; keep scenario assumptions editable and explain that actual holdings must be connected before calculating portfolio outcomes.

## Live News quality refinement

Filter explicit investor-solicitation press releases (for example, notices asking investors to join a proposed securities class action) from material company-risk signals. Keep substantive corporate/legal reporting eligible; this is a narrow promotion filter, not a ban on litigation coverage. Reflect the boundary in provider coverage text and SETUP.md.


## Provider expansion — approved GDELT + Alpha Vantage scope

This is a focused extension of the existing Live-only workspace and editorial financial-intelligence design; it does not add a second workspace, fixture data, a new design system, or a new dependency.

### GDELT global-news adapter

- Extend `server/providers.ts` with a server-side GDELT DOC 2.0 ArticleList JSON reader. Use recent, date-descending company/business-event searches over a bounded rolling window and record limit; the DOC endpoint does not require a provider key.
- Build search scope from the existing tracked issuer configuration and issuer names already resolved from SEC filings. Keep article eligibility tied to a tracked-company match and material business-event context; retain the current non-fictional empty/error/stale behavior.
- Validate each provider result’s original HTTP(S) article URL, title, GDELT `seendate`, provider-supplied English language, and publisher-domain metadata; omit listings with missing or malformed required fields rather than synthesizing metadata. Convert `seendate` to an ISO timestamp and label it **GDELT indexed/seen time**, never as a publisher-reported publication time. Retain the article’s original URL and provider domain; GDELT supplies metadata/title, not full article text in this adapter, so records remain metadata-only and limited-evidence analysis.
- Add a distinct GDELT connection card with ready, connected, empty, partial, rate-limited, error, and stale states. Include retrieved GDELT records in the existing event-analysis and duplicate-grouping path without replacing or misattributing NewsAPI/SEC evidence.

### Alpha Vantage daily-history adapter

- Add `server/alphaVantage.ts` as a server-only adapter for Alpha Vantage `TIME_SERIES_DAILY` JSON with `outputsize=compact`, which returns the latest 100 daily OHLCV observations. Keep `ALPHA_VANTAGE_API_KEY` in the protected project secret store; it must not reach browser code, source files, logs, or source links.
- Select symbols from optional `ALPHA_VANTAGE_SYMBOLS`, otherwise the existing `MARKET_DATA_SYMBOLS` watchlist and its `AAPL,MSFT,GOOGL` defaults. Bound one refresh to five symbols. A module-level request-start scheduler enforces at least 12.5 seconds between every outbound call within a server process, including the first call of a later or partial refresh; cache successful symbols for 24 hours, reuse them after partial responses, retry only missing symbols on a later refresh, and coalesce concurrent refreshes so page reloads do not repeatedly spend the provider’s free daily request allowance. The in-memory cache and scheduler reset on process restart and do not coordinate separate replicas.
- Preserve provider OHLCV values and trading dates. Calculate 20- and 50-session simple moving averages from the retrieved closes only when enough valid observations exist, and label them as SignalScope-calculated indicators rather than provider facts or forecasts. Render an accessible historical-price chart and source-fact values in a separate Alpha Vantage panel, visually distinct from Yahoo’s latest quote cards and model-generated risk analysis.
- Keep retrieval timestamps, trading dates, per-symbol failures, partial results, stale markers, and explicit not-configured/empty/error/rate-limited states. Never label daily history as realtime or substitute sample prices. Provide a same-origin, read-only `/api/market-history/:symbol` snapshot link for the exact retrieved data without exposing the API key, alongside the official Alpha Vantage documentation link.

### Application wiring and structure

- Extend `server/providers.ts` and `server/index.ts` so `GET /api/connections` and the existing `POST /api/refresh` return GDELT status/records and Alpha Vantage history alongside News, SEC filings, and Yahoo quotes.
- Extend `src/types.ts` for source-specific timestamp labels, historical OHLCV bars, derived indicators, and the Alpha Vantage snapshot. Update `src/App.tsx` state and provider refresh handling; add `src/AlphaHistoryPanel.tsx` and its styles in `src/market.css`.
- Update `SETUP.md` with GDELT’s no-key scope and title-only limitation, `ALPHA_VANTAGE_API_KEY`, optional `ALPHA_VANTAGE_SYMBOLS`, the daily-history/quota/cache behavior, and the read-only snapshot route. Preserve all current navigation and controls.

The existing project structure is extended with `server/alphaVantage.ts` for the credentialed daily-series adapter and `src/AlphaHistoryPanel.tsx` for the sourced daily chart. No other directories or frameworks are introduced. Navigation remains within one root URL using React state; `public/manus-routes.json` correctly lists only `/` because the Overview, Events, Companies, Portfolio Stress Test, and Methodology views are not URL-addressable routes. Add manifest paths only if actual path-based routing is implemented.


### Verified provider operating limits

The GDELT ArticleList returned HTTP 429 on repeat requests; the app surfaces that upstream rate limit and inserts no substitute articles. Its adapter coalesces concurrent calls, reuses successful/empty responses for 15 minutes, and briefly caches rate-limit/error responses for 60 seconds. English-language titles are analyzed; records must include valid provider-supplied English language and publisher-domain metadata. GDELT is a news-index source here, not a social-media feed. Alpha Vantage history is process-cached per symbol for 24 hours, with no more than five symbols per refresh; a per-process request-start gate enforces 12.5-second spacing across later refreshes and retries. A process restart clears the cache and gate, and separate replicas do not share either. The official Alpha Vantage free allowance reviewed for this implementation is 25 API requests per day; account plans may differ.
