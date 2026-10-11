# SignalScope - S&P Global & Crisil Campus Hackathon

**Candidate Name:** [Add your full name]  
**College Email ID:** [Add your college email]  
**College / Campus:** [Add your college name]  
**Demo Video Link:** [Add your unlisted YouTube link]  
**Slide Deck Link (if hosted externally):** [Add an anyone-with-link view URL, if applicable]

> Before submission, replace the bracketed fields, add a 5–7 slide deck at `docs/presentation.pdf`, and set the public GitHub repository name to `<college>-<candidate-name>-hackathon` (lowercase, hyphen-separated).

## 1. Project Overview / Problem Statement & Approach

SignalScope is a financial-risk intelligence workspace that helps an analyst review company news, official filings, and market observations together. Financial and operational events can be scattered across sources, arrive at different times, and vary in evidential quality, making it hard to understand what is known and what is only an analytical estimate.

The prototype retrieves records from configured NewsAPI-compatible sources, SEC EDGAR, GDELT, Yahoo Finance through the managed API runtime, and Alpha Vantage. A Node server normalizes and groups records, tracks source and retrieval timestamps, and presents analysis with confidence and evidence limitations. The interface also includes company views, scenario assumptions, and methodology. It does not infer a user's portfolio or provide investment advice.

## 2. Architecture & Tech Stack

The React and TypeScript single-page app communicates with a Node/TypeScript server over same-origin HTTP endpoints. Server-side adapters fetch provider data; the server returns normalized records and market snapshots to the interface. Source-reported facts remain separate from SignalScope analysis and calculated indicators. See the [architecture diagram](docs/architecture.svg) (also available as a [PNG preview](docs/architecture.png), if added).

**Stack:** React 18, TypeScript, Vite, Node.js, `tsx`, and pnpm. No database is required; provider snapshots and caches are held in server memory. Alpha Vantage history and moving averages are documented in `SETUP.md`.

## 3. Dataset Used

The active workspace is designed for live provider retrieval and does not require a checked-in live dataset. `src/data.ts` contains illustrative fictional fixtures used by demo/evaluation interface areas; they are not current market observations or provider evidence. The `data/` folder contains a note only. Provider credentials and downloaded/licensed data should not be committed.

## 4. Quickstart & Installation

**Runtime:** Node.js 20 or newer and pnpm 10.12.1. Local development instructions below target Windows PowerShell, macOS, and Linux; use the matching environment-variable syntax for your shell. Provider coverage depends on your credentials and runtime.

```bash
git clone https://github.com/<your-github-username>/<college>-<candidate-name>-hackathon.git
cd <college>-<candidate-name>-hackathon
pnpm install
pnpm dev
```

Open `http://localhost:3000`. The exact run command is `pnpm dev`. For provider-backed data, configure the server environment variables described in [`SETUP.md`](SETUP.md): `NEWS_API_KEY`, `SEC_USER_AGENT` (with your real contact email), and `ALPHA_VANTAGE_API_KEY`. The Yahoo Finance quote adapter needs the managed runtime's `MANUS_API_URL` and `MANUS_API_KEY`; a standalone clone does not provide those automatically. The app can run locally without these providers, showing their unconfigured state. Never place keys in frontend code or commit them.

To create a production frontend bundle, run `pnpm build`. See `SETUP.md` for provider coverage, limits, and API routes.

## 5. Key Results & Domain Impact

- Brings company news, official filing metadata, quotes, and daily price history into one review workspace with source links and timestamps.
- Displays provider availability, empty/error/partial/stale states, and evidence limits so missing data is not silently replaced with fictional observations.
- Keeps scenario inputs distinct from portfolio valuations; portfolio impact is not calculated when no user holdings are connected.

Analysis scores are estimates derived from available provider text or metadata. They are not source facts, price forecasts, or investment advice. Review cited sources before making decisions.

## Submission checklist

- Rename the repository using the required college and candidate naming convention and make it **Public** in GitHub repository settings.
- Replace the candidate, college, email, video, and deck placeholders above.
- Put the 5–7 slide PDF at `docs/presentation.pdf`; create `docs/architecture.png` if the organizer requires PNG specifically (the editable SVG is included).
- Upload the demo video to YouTube as **Unlisted** and check the link in a private browser window.
- For externally hosted slides, set access to **Anyone with the link can view** and verify in a private browser window. Do not use Google Drive or OneDrive if the event checklist prohibits them.
- Confirm the clone URL and exact `pnpm dev` run command match the final repository.
