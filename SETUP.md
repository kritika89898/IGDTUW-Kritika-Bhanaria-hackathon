# SignalScope setup guide

SignalScope runs one **Live** workspace backed by NewsAPI-compatible articles, SEC EDGAR filing metadata, Yahoo Finance quotes, GDELT global-news metadata, and Alpha Vantage daily history. No fictional/sample fallback is used in the active workspace. Source facts and retrieved market observations remain separate from SignalScope risk analysis and calculated indicators.

## Accounts and environment variables

| Variable | Required for | Configuration |
| --- | --- | --- |
| `NEWS_API_KEY` | Live news | Key from a NewsAPI-compatible provider account; server-side only. |
| `NEWS_COMPANIES` | Optional news scope | Comma-separated issuer names; defaults to Apple, Microsoft, and Alphabet; up to 10 issuers are queried. |
| `SEC_USER_AGENT` | Live SEC filings | Descriptive SEC fair-access User-Agent containing a real contact email address you control. SEC EDGAR does not require an API key. |
| `SEC_CIKS` | Optional filing scope | Comma-separated numeric SEC CIK identifiers; defaults to Apple, Microsoft, and Alphabet. |
| `MARKET_DATA_SYMBOLS` | Optional Yahoo scope | Comma-separated Yahoo Finance symbols; defaults to `AAPL,MSFT,GOOGL`; maximum 20 valid symbols. |
| `ALPHA_VANTAGE_API_KEY` | Alpha Vantage history | Obtain a key from [Alpha Vantage](https://www.alphavantage.co/support/#api-key). Supply it through the secure project-secret input; it is used server-side only. |
| `ALPHA_VANTAGE_SYMBOLS` | Optional Alpha scope | Comma-separated Alpha Vantage symbols; overrides `MARKET_DATA_SYMBOLS`; at most five symbols are requested per refresh. Without this variable, the adapter uses the shared watchlist (or `AAPL,MSFT,GOOGL` by default), capped at five. |
| `MANUS_API_URL` | Managed quote runtime | Supplied automatically by the managed Manus server runtime. Do not hardcode or expose it in frontend code. |
| `MANUS_API_KEY` | Managed quote runtime | Server-only platform credential supplied automatically by the managed Manus server runtime. Never place it in source, browser code, or `.env.example`. |

GDELT DOC 2.0 requires no API key. Keep `NEWS_API_KEY`, `SEC_USER_AGENT`, and `ALPHA_VANTAGE_API_KEY` server-side. Do not commit secrets or share them in chat. The dev script does not automatically load a `.env` file. Do not invent an email address for `SEC_USER_AGENT`.

The quote adapter uses the built-in `YahooFinance/get_stock_chart` API-hub operation; **no separate Yahoo/market-data account or key is required** in the managed deployment. A standalone clone outside the managed Manus runtime shows Yahoo data as **Not configured** unless it has an authorized platform API runtime; do not expose server credentials to make it work.

## Local startup

Requirements: Node.js 20+ and pnpm.

```bash
pnpm install
# Export values from your own provider accounts and your real SEC contact address:
export NEWS_API_KEY='your-news-provider-key'
export SEC_USER_AGENT='SignalScope/1.0 contact:you@your-domain.com'
export ALPHA_VANTAGE_API_KEY='your-alpha-vantage-key'
# Optional issuer, filing, and quote scope:
# export NEWS_COMPANIES='Apple Inc.,Microsoft Corporation'
# export SEC_CIKS='320193,789019'
# export MARKET_DATA_SYMBOLS='AAPL,MSFT,GOOGL'
# export ALPHA_VANTAGE_SYMBOLS='AAPL,MSFT,GOOGL'
pnpm dev
```

The server listens on port `3000`. Browser calls use same-origin endpoints:

- `GET /api/health` — service readiness.
- `GET /api/connections` — provider status, setup requirements, coverage, and last successful retrieval.
- `POST /api/refresh` — refresh News, SEC EDGAR metadata, GDELT article metadata, Yahoo quotes, and Alpha Vantage history together. GDELT responses are coalesced/cached for 15 minutes (failed/rate-limited responses for 60 seconds); Alpha Vantage request starts are separated by at least 12.5 seconds across symbols, refreshes, and partial retries within one server process. Successful symbols are cached in-process for 24 hours, and concurrent refreshes share one request. After a partial response, cached successful symbols are reused and missing symbols may be retried on a later refresh. The in-memory request gate/cache reset on restart and are not shared across replicas.
- `GET /api/market-history/:symbol` — read-only JSON snapshot of the exact retrieved Alpha Vantage series. It includes provider OHLCV fields and separately identified SignalScope-calculated SMA fields; no API key is returned.

Opening the app automatically loads connection status and performs one provider refresh; the Overview’s **Refresh providers** control requests subsequent updates, subject to the provider caches and quotas above. Search, event filters, event details, company views, scenario controls, and reset remain available. Without a connected user portfolio, holdings and dollar valuations stay empty; the scenario page keeps only clearly labeled assumptions and does not calculate portfolio exposure.

## Coverage and limitations

- **NewsAPI-compatible news:** English, company-specific article metadata and permitted excerpts. Search is scoped to tracked issuers and business-event context; unmatched headlines, obvious consumer promotions, and explicit investor-solicitation notices are excluded while substantive corporate/legal reporting remains eligible. Availability, excerpt length, licensing, indexing, and request limits depend on the account.
- **GDELT DOC 2.0:** Global online-news indexing, queried for English-language headlines matching tracked companies and material business-event terms from the last seven days (up to 40 article listings). Each accepted record requires a valid original article link, title, GDELT `seendate`, and provider-supplied valid English language and publisher-domain fields; incomplete or malformed listings are omitted rather than having metadata synthesized. `seendate` is labeled as the time GDELT indexed/saw an item, **not** as the publisher’s asserted publication time. Only title/metadata is consumed: the record stays metadata-only and limited-evidence. This adapter is not a social-media feed and does not fetch article full text. GDELT may return empty results or rate-limit requests; those states are surfaced, and no substitute article is inserted.
- **SEC EDGAR:** Public issuer submissions for the configured CIK list, scanning recent 8-K, 10-K, 10-Q, 6-K, and 20-F filings. The adapter exposes filing metadata and accession links; it does not retrieve full filing text. SEC fair-access identification is required through `SEC_USER_AGENT`.
- **Yahoo Finance quotes:** The managed Yahoo Finance chart API supplies the configured watchlist’s latest regular-market price and prior-close change. This is not a streaming feed, does not promise real-time latency, and does not include order entry, a brokerage connection, full exchange coverage, or portfolio valuation. The provider quote timestamp may be earlier than retrieval time, particularly outside regular trading hours. Check the linked Yahoo Finance quote page for context. An outage shows an error or a clearly marked last-good stale quote; no sample price is used as fallback.
- **Alpha Vantage history:** `TIME_SERIES_DAILY` with compact output supplies up to the latest 100 daily OHLCV observations for each requested symbol. Requests are server-side and capped at five symbols per refresh. A per-process scheduler spaces every outbound request start by at least 12.5 seconds, including the first call of a later/partial retry; successful symbols are cached per process for 24 hours, and failed/missing symbols may be retried while successful cached symbols are reused. Separate server replicas do not share the in-memory scheduler or cache. The current documented free allowance is 25 requests/day; actual account plans/limits apply, and caches reset after server restart. The displayed SMA 20 and SMA 50 are simple moving averages calculated by SignalScope from retrieved closes (and appear only when enough daily observations exist); they are not provider-returned values, forecasts, or model-generated risk scores. Daily history is not realtime. The official documentation link and same-origin exact data snapshot are provided; the API key is never put in a browser URL. Provider frequency/daily-limit responses remain visible and add no substitute price data.
- **Risk analysis:** Sentiment, category, impact, confidence, and explanatory rationale are model-analysis fields generated from retrieved headlines/excerpts or filing metadata. They are estimates, not facts reported by a source, not price forecasts, and not investment advice. Metadata-only records receive low confidence and an insufficient-evidence label.
- **Provider states:** Ready-to-refresh, not-configured, empty, error, rate-limited, partial, and stale states are surfaced separately. A successful empty response is shown as “No records,” not as a provider outage. A last-good live snapshot may be retained after a provider outage and is labeled stale; fictional records never fill the gap.
