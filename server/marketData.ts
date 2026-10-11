import type { DataConnection, MarketDataSnapshot, MarketQuote } from '../src/types.ts'

const API_ID = 'YahooFinance/get_stock_chart'
const DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL']
const DEFAULT_ISSUERS: Record<string, string> = { AAPL: 'Apple Inc.', MSFT: 'Microsoft Corporation', GOOGL: 'Alphabet Inc.' }
const nowIso = () => new Date().toISOString()
const finiteNumber = (value: unknown): number | undefined => {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  return Number.isFinite(number) ? number : undefined
}
const initialConnection = (): DataConnection => {
  const ready = Boolean(process.env.MANUS_API_URL?.trim() && process.env.MANUS_API_KEY?.trim())
  return {
    id: 'market-data',
    name: 'Market quotes',
    provider: 'Yahoo Finance via Manus API hub',
    coverage: 'Last regular-market price, previous-close change, and quote timestamps for the configured US watchlist; loaded on startup or manual refresh',
    status: ready ? 'ready' : 'not_configured',
    detail: ready
      ? 'The managed quote service is configured; quote observations load automatically on startup and can be refreshed manually.'
      : 'The platform market-data service is unavailable in this runtime. No quote values are shown.',
    setupRequired: ready ? undefined : 'Run in a managed Manus server runtime with MANUS_API_URL and MANUS_API_KEY supplied by the platform.'
  }
}

let lastMarketSnapshot: MarketDataSnapshot | undefined

export function getMarketDataSnapshot(): MarketDataSnapshot {
  return lastMarketSnapshot ?? { connection: initialConnection(), quotes: [], retrievedAt: '' }
}

function requestedSymbols(): { symbols: string[]; invalid: string[] } {
  const configured = process.env.MARKET_DATA_SYMBOLS
  if (!configured?.trim()) return { symbols: DEFAULT_SYMBOLS, invalid: [] }
  const values = configured.split(',').map((value) => value.trim().toUpperCase()).filter(Boolean)
  const valid: string[] = []
  const invalid: string[] = []
  for (const value of values) {
    if (/^[A-Z0-9][A-Z0-9.^=_-]{0,19}$/.test(value)) valid.push(value)
    else invalid.push(value)
  }
  return { symbols: Array.from(new Set(valid)).slice(0, 20), invalid }
}

async function fetchQuote(symbol: string): Promise<MarketQuote> {
  const base = process.env.MANUS_API_URL?.trim()
  const key = process.env.MANUS_API_KEY?.trim()
  if (!base || !key) throw Object.assign(new Error('Platform market-data credentials are unavailable.'), { kind: 'not_configured' })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch(`${base.replace(/\/$/, '')}/webdevtoken.v1.WebDevService/CallApi`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'connect-protocol-version': '1' },
      body: JSON.stringify({ apiId: API_ID, query: { symbol, region: 'US', interval: '1m', range: '1d' } }),
      signal: controller.signal
    })
    const raw = await response.text()
    let envelope: Record<string, any>
    try { envelope = JSON.parse(raw) as Record<string, any> } catch { throw Object.assign(new Error('Market-data service returned malformed JSON.'), { status: 502 }) }
    if (!response.ok) throw Object.assign(new Error(`Market-data service returned HTTP ${response.status}.`), { status: response.status })

    let data: Record<string, any> = envelope
    if (typeof envelope.jsonData === 'string') {
      try { data = JSON.parse(envelope.jsonData) as Record<string, any> } catch { throw Object.assign(new Error('Market-data service returned malformed quote data.'), { status: 502 }) }
    }
    const result = data?.chart?.result?.[0] ?? data?.result?.chart?.result?.[0]
    const chartError = envelope.error ?? data?.error ?? data?.chart?.error
    if (chartError) {
      const code = typeof chartError === 'string' ? chartError : chartError.code ?? chartError.name ?? 'provider_error'
      const safeCode = String(code).replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'provider_error'
      throw Object.assign(new Error(`Yahoo Finance quote request failed (${safeCode}).`), { status: chartError.status })
    }
    const meta = result?.meta
    if (!meta || (meta.symbol && String(meta.symbol).toUpperCase() !== symbol)) throw Object.assign(new Error(`No quote record was returned for ${symbol}.`), { status: 404 })

    const timestamps: unknown[] = Array.isArray(result.timestamp) ? result.timestamp : []
    const closes: unknown[] = Array.isArray(result.indicators?.quote?.[0]?.close) ? result.indicators.quote[0].close : []
    let lastIndex = -1
    for (let index = Math.min(timestamps.length, closes.length) - 1; index >= 0; index -= 1) {
      if (finiteNumber(closes[index]) !== undefined && finiteNumber(timestamps[index]) !== undefined) { lastIndex = index; break }
    }
    const price = finiteNumber(meta.regularMarketPrice) ?? (lastIndex >= 0 ? finiteNumber(closes[lastIndex]) : undefined)
    const quoteEpoch = finiteNumber(meta.regularMarketTime) ?? (lastIndex >= 0 ? finiteNumber(timestamps[lastIndex]) : undefined)
    if (price === undefined || price <= 0 || quoteEpoch === undefined || quoteEpoch <= 0) throw Object.assign(new Error(`Yahoo Finance did not return a usable price and source timestamp for ${symbol}.`), { status: 502 })

    const previousClose = finiteNumber(meta.chartPreviousClose) ?? finiteNumber(meta.previousClose)
    const changeAmount = previousClose !== undefined ? price - previousClose : undefined
    const changePercent = previousClose !== undefined && previousClose > 0 ? (changeAmount! / previousClose) * 100 : finiteNumber(meta.regularMarketChangePercent)
    const sourceUrl = `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/`
    return {
      symbol,
      issuerName: String(meta.longName ?? meta.shortName ?? DEFAULT_ISSUERS[symbol] ?? symbol),
      currency: String(meta.currency ?? 'USD'),
      exchange: typeof meta.fullExchangeName === 'string' ? meta.fullExchangeName : typeof meta.exchangeName === 'string' ? meta.exchangeName : undefined,
      price,
      previousClose,
      changeAmount,
      changePercent,
      asOf: new Date(quoteEpoch * 1000).toISOString(),
      retrievedAt: nowIso(),
      sourceName: 'Yahoo Finance',
      sourceUrl
    }
  } finally { clearTimeout(timeout) }
}

export async function refreshMarketData(): Promise<MarketDataSnapshot> {
  const { symbols, invalid } = requestedSymbols()
  const previous = getMarketDataSnapshot()
  const previousBySymbol = new Map(previous.quotes.map((quote) => [quote.symbol, quote]))
  const requestStartedAt = nowIso()
  if (!process.env.MANUS_API_URL?.trim() || !process.env.MANUS_API_KEY?.trim()) {
    const retained = previous.quotes.map((quote) => ({ ...quote, stale: true }))
    const base = initialConnection()
    const connection: DataConnection = retained.length ? {
      ...base, status: 'stale', detail: 'Platform market-data credentials are unavailable. Showing only previously retrieved quotes, marked stale with their original timestamps.',
      recordCount: retained.length, lastSuccessfulRetrieval: previous.connection.lastSuccessfulRetrieval
    } : base
    const snapshot = { connection, quotes: retained, retrievedAt: requestStartedAt }
    lastMarketSnapshot = snapshot
    return snapshot
  }
  if (!symbols.length) {
    const snapshot: MarketDataSnapshot = { connection: { ...initialConnection(), status: 'error', detail: 'MARKET_DATA_SYMBOLS contains no valid ticker symbols. Use comma-separated US ticker symbols; no quote values were added.' }, quotes: [], retrievedAt: requestStartedAt }
    lastMarketSnapshot = snapshot
    return snapshot
  }

  const results = await Promise.all(symbols.map(async (symbol) => {
    try { return { symbol, quote: await fetchQuote(symbol) } }
    catch (error) {
      const status = (error as { status?: number }).status
      const kind = (error as { kind?: string }).kind
      return { symbol, error: kind === 'not_configured' ? 'Platform market-data credentials are unavailable.' : status === 429 ? 'Provider rate limit reached.' : error instanceof Error ? error.message : 'Quote request failed.', rateLimited: status === 429 }
    }
  }))

  const freshQuotes = results.flatMap((result) => result.quote ? [result.quote] : [])
  const retrievedAt = nowIso()
  const failures = [...results.filter((result) => !result.quote).map((result) => `${result.symbol}: ${result.error}`), ...invalid.map((symbol) => `${symbol}: invalid ticker symbol`)]
  const retained = results.flatMap((result) => {
    if (result.quote) return []
    const previousQuote = previousBySymbol.get(result.symbol)
    return previousQuote ? [{ ...previousQuote, stale: true }] : []
  })
  const quotes = [...freshQuotes, ...retained]
  const rateLimited = results.some((result) => result.rateLimited)
  let status: DataConnection['status']
  let detail: string
  if (failures.length === 0 && freshQuotes.length === symbols.length) {
    status = 'connected'
    detail = `${freshQuotes.length} provider quote${freshQuotes.length === 1 ? '' : 's'} retrieved. Every card shows the provider quote time and retrieval time.`
  } else if (freshQuotes.length > 0) {
    status = 'partial'
    detail = `${freshQuotes.length} fresh quote${freshQuotes.length === 1 ? '' : 's'} retrieved; ${failures.join('; ')}. Any retained prior quote is marked stale.`
  } else if (retained.length > 0) {
    status = 'stale'
    detail = `The latest quote request failed. Showing ${retained.length} previously retrieved quote${retained.length === 1 ? '' : 's'} with their original timestamps, marked stale. ${failures.join('; ')}`
  } else if (rateLimited) {
    status = 'rate_limited'
    detail = `The market-data provider rate limit was reached. No substitute prices were added. ${failures.join('; ')}`
  } else {
    status = 'error'
    detail = `No live quote records were returned. ${failures.join('; ') || 'Check the provider response and retry.'}`
  }

  const previousSuccess = previous.connection.lastSuccessfulRetrieval
  const connection: DataConnection = {
    ...initialConnection(),
    status,
    detail,
    recordCount: quotes.length,
    lastSuccessfulRetrieval: freshQuotes.length ? retrievedAt : previousSuccess,
    setupRequired: undefined
  }
  const snapshot: MarketDataSnapshot = { connection, quotes, retrievedAt }
  lastMarketSnapshot = snapshot
  return snapshot
}
