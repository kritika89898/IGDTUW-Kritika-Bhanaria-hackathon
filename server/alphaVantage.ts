import type { AlphaVantageSeries, AlphaVantageSnapshot, DataConnection, MarketHistoryBar, MarketDataSnapshot } from '../src/types.ts'

const API_URL = 'https://www.alphavantage.co/query'
const SOURCE_URL = 'https://www.alphavantage.co/documentation/'
const DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL']
const DEFAULT_ISSUERS: Record<string, string> = { AAPL: 'Apple Inc.', MSFT: 'Microsoft Corporation', GOOGL: 'Alphabet Inc.' }
const MAX_SYMBOLS_PER_REFRESH = 5
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const ALPHA_REQUEST_INTERVAL_MS = 12_500
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const nowIso = () => new Date().toISOString()
let lastAlphaRequestStartedAt = 0
let alphaRequestStartQueue: Promise<void> = Promise.resolve()

async function scheduleAlphaRequestStart() {
  let release = () => {}
  const previous = alphaRequestStartQueue
  alphaRequestStartQueue = new Promise<void>((resolve) => { release = resolve })
  await previous
  try {
    const remaining = lastAlphaRequestStartedAt + ALPHA_REQUEST_INTERVAL_MS - Date.now()
    if (lastAlphaRequestStartedAt && remaining > 0) await wait(remaining)
    lastAlphaRequestStartedAt = Date.now()
  } finally {
    release()
  }
}

const finiteNumber = (value: unknown): number | undefined => {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  return Number.isFinite(number) ? number : undefined
}

const initialConnection = (status?: DataConnection['status']): DataConnection => {
  const configured = Boolean(process.env.ALPHA_VANTAGE_API_KEY?.trim())
  const effectiveStatus = status ?? (configured ? 'ready' : 'not_configured')
  return {
    id: 'alpha-vantage',
    name: 'Daily price history',
    provider: 'Alpha Vantage',
    coverage: 'Latest 100 daily OHLCV observations per symbol; maximum five symbols per refresh; historical data, not realtime quotes',
    status: effectiveStatus,
    detail: configured
      ? 'Alpha Vantage is configured. Requests are serialized with conservative spacing; successful per-symbol snapshots are reused for 24 hours to conserve the provider request allowance.'
      : 'No Alpha Vantage API key is configured. Historical series are unavailable until ALPHA_VANTAGE_API_KEY is set server-side.',
    setupRequired: configured ? undefined : 'Add ALPHA_VANTAGE_API_KEY using the secure project secret input; never place it in frontend code.'
  }
}

let lastSnapshot: AlphaVantageSnapshot | undefined
let inFlightRefresh: Promise<AlphaVantageSnapshot> | undefined

export function getAlphaVantageSnapshot(): AlphaVantageSnapshot {
  return lastSnapshot ?? { connection: initialConnection(), series: [], retrievedAt: '' }
}

export function getAlphaVantageSeries(symbol: string): AlphaVantageSeries | undefined {
  const normalized = symbol.trim().toUpperCase()
  return getAlphaVantageSnapshot().series.find((item) => item.symbol === normalized)
}

function requestedSymbols() {
  const override = process.env.ALPHA_VANTAGE_SYMBOLS?.trim()
  const sharedWatchlist = process.env.MARKET_DATA_SYMBOLS?.trim()
  const raw = override || sharedWatchlist
  const values = raw ? raw.split(',').map((value) => value.trim().toUpperCase()).filter(Boolean) : DEFAULT_SYMBOLS
  const symbols: string[] = []
  const invalid: string[] = []
  for (const value of values) {
    if (!/^[A-Z0-9][A-Z0-9.^=_-]{0,19}$/.test(value)) invalid.push(value)
    else if (!symbols.includes(value)) symbols.push(value)
  }
  return {
    symbols: symbols.slice(0, MAX_SYMBOLS_PER_REFRESH),
    invalid,
    omitted: symbols.slice(MAX_SYMBOLS_PER_REFRESH)
  }
}

type FetchFailure = Error & { status?: number; kind?: 'rate_limited' | 'invalid_key' | 'invalid_symbol'; rateLimitScope?: 'daily' | 'frequency' | 'combined' }
type FetchedSeries = { series: Omit<AlphaVantageSeries, 'issuerName'>; malformedRows: number }

async function fetchDailySeries(symbol: string, apiKey: string): Promise<FetchedSeries> {
  const url = new URL(API_URL)
  url.searchParams.set('function', 'TIME_SERIES_DAILY')
  url.searchParams.set('symbol', symbol)
  url.searchParams.set('outputsize', 'compact')
  url.searchParams.set('datatype', 'json')
  url.searchParams.set('apikey', apiKey)

  await scheduleAlphaRequestStart()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'SignalScope/1.0' }, signal: controller.signal })
    const body = await response.text()
    if (!response.ok) {
      const error = new Error(`Alpha Vantage returned HTTP ${response.status}.`) as FetchFailure
      error.status = response.status
      if (response.status === 429) error.kind = 'rate_limited'
      throw error
    }

    let data: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(body)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid JSON object')
      data = parsed as Record<string, unknown>
    } catch {
      const error = new Error('Alpha Vantage returned malformed JSON.') as FetchFailure
      error.status = 502
      throw error
    }

    const providerMessage = [data['Error Message'], data.Note, data.Information].find((value) => typeof value === 'string') as string | undefined
    if (providerMessage) {
      const normalized = providerMessage.toLowerCase()
      const error = new Error('Alpha Vantage did not return a daily series.') as FetchFailure
      const dailyQuota = /requests? per day|daily (?:request )?(?:limit|allowance)|25 requests? per day/i.test(normalized)
      const frequencyQuota = /call frequency|per minute|standard api call/i.test(normalized)
      if (dailyQuota || frequencyQuota || /rate limit/i.test(normalized)) {
        error.kind = 'rate_limited'
        error.rateLimitScope = dailyQuota && frequencyQuota ? 'combined' : dailyQuota ? 'daily' : frequencyQuota ? 'frequency' : undefined
        error.status = 429
      } else if (/api.?key|apikey|invalid key|demo value/i.test(normalized)) {
        error.kind = 'invalid_key'
        error.status = 401
      } else {
        error.kind = 'invalid_symbol'
        error.status = 400
      }
      throw error
    }

    const rawSeries = data['Time Series (Daily)']
    if (!rawSeries || typeof rawSeries !== 'object' || Array.isArray(rawSeries)) {
      const error = new Error('Alpha Vantage returned no daily observations for this symbol.') as FetchFailure
      error.status = 502
      throw error
    }

    const observations: MarketHistoryBar[] = []
    let malformedRows = 0
    for (const [date, value] of Object.entries(rawSeries as Record<string, unknown>)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !value || typeof value !== 'object' || Array.isArray(value)) {
        malformedRows += 1
        continue
      }
      const row = value as Record<string, unknown>
      const open = finiteNumber(row['1. open'])
      const high = finiteNumber(row['2. high'])
      const low = finiteNumber(row['3. low'])
      const close = finiteNumber(row['4. close'])
      const volume = finiteNumber(row['5. volume'])
      if (open === undefined || high === undefined || low === undefined || close === undefined || volume === undefined || Math.min(open, high, low, close) <= 0 || volume < 0 || high < low) {
        malformedRows += 1
        continue
      }
      observations.push({ date, open, high, low, close, volume })
    }
    observations.sort((left, right) => left.date.localeCompare(right.date))
    if (!observations.length) {
      const error = new Error('Alpha Vantage returned no valid daily OHLCV observations.') as FetchFailure
      error.status = 502
      throw error
    }

    const withIndicators = observations.map((bar, index) => {
      const next: MarketHistoryBar = { ...bar }
      if (index >= 19) next.sma20 = observations.slice(index - 19, index + 1).reduce((sum, item) => sum + item.close, 0) / 20
      if (index >= 49) next.sma50 = observations.slice(index - 49, index + 1).reduce((sum, item) => sum + item.close, 0) / 50
      return next
    })
    const retrievedAt = nowIso()
    return {
      series: { symbol, observations: withIndicators, retrievedAt, sourceName: 'Alpha Vantage', sourceUrl: SOURCE_URL },
      malformedRows
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function performRefresh(issuerNames: Record<string, string>): Promise<AlphaVantageSnapshot> {
  const key = process.env.ALPHA_VANTAGE_API_KEY?.trim()
  const previous = getAlphaVantageSnapshot()
  const requestStartedAt = nowIso()
  const previousBySymbol = new Map(previous.series.map((item) => [item.symbol, item]))
  if (!key) {
    const retained = previous.series.map((item) => ({ ...item, stale: true }))
    const connection: DataConnection = retained.length
      ? { ...initialConnection('stale'), detail: 'ALPHA_VANTAGE_API_KEY is unavailable. Previously retrieved provider observations are retained with their original dates and marked stale.', recordCount: retained.length, lastSuccessfulRetrieval: previous.connection.lastSuccessfulRetrieval }
      : initialConnection('not_configured')
    const snapshot = { connection, series: retained, retrievedAt: requestStartedAt }
    lastSnapshot = snapshot
    return snapshot
  }

  const { symbols, invalid, omitted } = requestedSymbols()
  if (!symbols.length) {
    const snapshot: AlphaVantageSnapshot = {
      connection: { ...initialConnection('error'), detail: 'No valid symbols are configured for Alpha Vantage. Use comma-separated ticker symbols in ALPHA_VANTAGE_SYMBOLS or MARKET_DATA_SYMBOLS.' },
      series: [],
      retrievedAt: requestStartedAt
    }
    lastSnapshot = snapshot
    return snapshot
  }

  const cachedBySymbol = new Map<string, AlphaVantageSeries>()
  for (const item of previous.series) {
    const age = Date.now() - Date.parse(item.retrievedAt)
    if (symbols.includes(item.symbol) && !item.stale && Number.isFinite(age) && age >= 0 && age < CACHE_TTL_MS) cachedBySymbol.set(item.symbol, item)
  }
  if (cachedBySymbol.size === symbols.length && !invalid.length && !omitted.length && previous.connection.status === 'connected') {
    const snapshot: AlphaVantageSnapshot = {
      ...previous,
      connection: { ...previous.connection, detail: `${previous.connection.detail} Reusing the complete in-process history snapshot (less than 24 hours old) to conserve daily API requests.`, recordCount: previous.series.length }
    }
    lastSnapshot = snapshot
    return snapshot
  }

  const symbolsToFetch = symbols.filter((symbol) => !cachedBySymbol.has(symbol))
  const results: {
    symbol: string
    result?: { series: AlphaVantageSeries; malformedRows: number }
    error?: string
    failureKind?: FetchFailure['kind']
    rateLimitScope?: FetchFailure['rateLimitScope']
    previousSeries?: AlphaVantageSeries
  }[] = []
  for (const symbol of symbolsToFetch) {
    try {
      const fetched = await fetchDailySeries(symbol, key)
      const quoteIssuer = issuerNames[symbol]?.trim()
      results.push({ symbol, result: { ...fetched, series: { ...fetched.series, issuerName: quoteIssuer || DEFAULT_ISSUERS[symbol] || symbol } } })
    } catch (error) {
      const failure = error as FetchFailure
      const previousSeries = previousBySymbol.get(symbol)
      const detail = failure.kind === 'rate_limited'
        ? failure.rateLimitScope === 'frequency'
          ? 'Alpha Vantage per-minute request-frequency limit reached.'
          : failure.rateLimitScope === 'daily'
            ? 'Alpha Vantage daily request allowance reached.'
            : failure.rateLimitScope === 'combined'
              ? 'Alpha Vantage frequency and/or daily request allowance reached.'
              : 'Alpha Vantage request-rate limit reached.'
        : failure.kind === 'invalid_key'
          ? 'Alpha Vantage rejected the configured API key. Check ALPHA_VANTAGE_API_KEY and account access.'
          : failure.kind === 'invalid_symbol'
            ? `Alpha Vantage rejected the requested symbol ${symbol}.`
            : failure.status
              ? `Alpha Vantage request failed for ${symbol} (HTTP ${failure.status}).`
              : `Alpha Vantage request failed for ${symbol}; check outbound connectivity.`
      results.push({ symbol, error: detail, failureKind: failure.kind, rateLimitScope: failure.rateLimitScope, previousSeries })
    }
  }

  const retrievedAt = nowIso()
  const newlyRetrieved = results.flatMap((result) => result.result ? [result.result.series] : [])
  const freshSeries = [...cachedBySymbol.values(), ...newlyRetrieved]
  const malformedMessages = results.flatMap((result) => result.result?.malformedRows ? [`${result.symbol}: ${result.result.malformedRows} malformed observation${result.result.malformedRows === 1 ? '' : 's'} omitted`] : [])
  const errorMessages = results.flatMap((result) => result.error ? [`${result.symbol}: ${result.error}`] : [])
  const retainedSeries = results.flatMap((result) => !result.result && result.previousSeries ? [{ ...result.previousSeries, stale: true }] : [])
  const invalidMessages = invalid.map((symbol) => `${symbol}: invalid symbol syntax`)
  const omittedMessages = omitted.map((symbol) => `${symbol}: not requested because the five-symbol refresh cap was reached`)
  const failures = [...errorMessages, ...malformedMessages, ...invalidMessages, ...omittedMessages]
  const series = [...freshSeries, ...retainedSeries]
  const rateLimited = results.some((result) => result.failureKind === 'rate_limited')
  const rateLimitScope = results.find((result) => result.failureKind === 'rate_limited')?.rateLimitScope
  let status: DataConnection['status']
  let detail: string
  if (!failures.length && freshSeries.length === symbols.length) {
    status = 'connected'
    detail = `${freshSeries.length} daily series retrieved from Alpha Vantage. Requests are serialized and spaced to reduce frequency-limit errors. OHLCV values are provider facts; SMA20/SMA50 are calculated by SignalScope when enough observations exist.`
  } else if (freshSeries.length && failures.length) {
    status = 'partial'
    detail = `${freshSeries.length} fresh daily series available; ${failures.join('; ')}. Successful symbol snapshots remain cached for 24 hours; missing symbols can be retried on a later refresh.`
  } else if (retainedSeries.length) {
    status = 'stale'
    detail = `The latest Alpha Vantage request failed. Showing ${retainedSeries.length} previously retrieved series with original trading dates and retrieval times, marked stale. ${failures.join('; ')}`
  } else if (rateLimited) {
    status = 'rate_limited'
    detail = rateLimitScope === 'frequency'
      ? `Alpha Vantage's per-minute request-frequency limit was reached. Requests are now spaced before a later retry. No substitute price data was added. ${failures.join('; ')}`
      : rateLimitScope === 'daily'
        ? `Alpha Vantage's daily request allowance was reached. No substitute price data was added. ${failures.join('; ')}`
        : rateLimitScope === 'combined'
          ? `Alpha Vantage reported frequency and daily allowance limits. No substitute price data was added. ${failures.join('; ')}`
          : `Alpha Vantage's request-rate limit was reached. No substitute price data was added. ${failures.join('; ')}`
  } else if (results.length && errorMessages.length === results.length) {
    status = 'error'
    detail = `No Alpha Vantage history was returned. ${failures.join('; ')}`
  } else {
    status = 'partial'
    detail = `Alpha Vantage returned an incomplete watchlist. ${failures.join('; ')}`
  }

  const lastSuccessfulRetrieval = freshSeries.length
    ? freshSeries.map((item) => item.retrievedAt).sort().at(-1)
    : previous.connection.lastSuccessfulRetrieval
  const connection: DataConnection = {
    ...initialConnection(status),
    detail,
    recordCount: series.length,
    lastSuccessfulRetrieval,
    setupRequired: undefined
  }
  const snapshot: AlphaVantageSnapshot = { connection, series, retrievedAt }
  lastSnapshot = snapshot
  return snapshot
}

export function refreshAlphaVantage(marketData?: MarketDataSnapshot): Promise<AlphaVantageSnapshot> {
  if (inFlightRefresh) return inFlightRefresh
  const issuerNames = Object.fromEntries((marketData?.quotes ?? []).map((quote) => [quote.symbol.toUpperCase(), quote.issuerName]))
  inFlightRefresh = performRefresh(issuerNames).finally(() => { inFlightRefresh = undefined })
  return inFlightRefresh
}
