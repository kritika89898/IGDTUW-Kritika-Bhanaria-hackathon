import type { AlphaVantageSeries, AlphaVantageSnapshot, MarketHistoryBar } from './types'

const STATUS_LABELS: Record<string, string> = {
  connected: 'Connected',
  ready: 'Ready to refresh',
  loading: 'Loading provider status',
  partial: 'Partial data',
  stale: 'Stale snapshot',
  not_configured: 'Not configured',
  unavailable: 'Unavailable',
  rate_limited: 'Rate limited',
  empty: 'No records',
  error: 'Provider error'
}
const statusLabel = (status?: string) => STATUS_LABELS[status ?? ''] ?? 'Status unavailable'

const formatNumber = (value: number) => new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
const formatTime = (value: string) => {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Time unavailable'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date) + ' UTC'
}
const formatDate = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
}

function valueAt(bar: MarketHistoryBar, key: 'close' | 'sma20' | 'sma50') {
  return key === 'close' ? bar.close : bar[key]
}

function chartPoints(series: AlphaVantageSeries, key: 'close' | 'sma20' | 'sma50', low: number, high: number) {
  const bars = series.observations
  const usable = bars.map((bar, index) => ({ index, value: valueAt(bar, key) })).filter((item): item is { index: number; value: number } => typeof item.value === 'number' && Number.isFinite(item.value))
  const width = 560
  const height = 148
  const range = high - low || 1
  return usable.map(({ index, value }) => {
    const x = 12 + (bars.length < 2 ? width / 2 : index * (width / (bars.length - 1)))
    const y = 8 + (high - value) * (height / range)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')
}

function HistoryCard({ series }: { series: AlphaVantageSeries }) {
  const observations = series.observations
  const latest = observations[observations.length - 1]
  const previous = observations.length > 1 ? observations[observations.length - 2] : undefined
  const low = Math.min(...observations.flatMap((bar) => [bar.close, bar.sma20, bar.sma50].filter((value): value is number => typeof value === 'number')))
  const high = Math.max(...observations.flatMap((bar) => [bar.close, bar.sma20, bar.sma50].filter((value): value is number => typeof value === 'number')))
  const closePoints = chartPoints(series, 'close', low, high)
  const sma20Points = chartPoints(series, 'sma20', low, high)
  const sma50Points = chartPoints(series, 'sma50', low, high)
  const change = previous && previous.close > 0 ? ((latest.close - previous.close) / previous.close) * 100 : undefined
  const snapshotUrl = `/api/market-history/${encodeURIComponent(series.symbol)}`
  return <article className={`alpha-history-card ${series.stale ? 'is-stale' : ''}`}>
    <div className="alpha-history-card-head">
      <div><span className="market-symbol">{series.symbol}</span><span className="market-issuer">{series.issuerName}</span></div>
      {series.stale ? <span className="market-stale-tag">Stale</span> : <span className="market-fact-tag">Daily history</span>}
    </div>
    <div className="alpha-history-quote-row">
      <div><span className="alpha-history-metric-label">Latest daily close</span><strong>{formatNumber(latest.close)}</strong><span className="alpha-history-date">Trading date · {formatDate(latest.date)}</span></div>
      <span className={`alpha-history-change ${change === undefined ? 'flat' : change > 0 ? 'up' : change < 0 ? 'down' : 'flat'}`}>{change === undefined ? 'Change unavailable' : `${change > 0 ? '+' : ''}${change.toFixed(2)}% vs. prior session`}</span>
    </div>
    <div className="alpha-history-chart" role="img" aria-label={`${series.symbol} daily close chart from ${formatDate(observations[0].date)} to ${formatDate(latest.date)}; SMA values are calculated by SignalScope from Alpha Vantage closes.`}>
      <svg viewBox="0 0 584 164" preserveAspectRatio="none" aria-hidden="true">
        {[28, 68, 108, 148].map((y) => <line key={y} x1="12" x2="572" y1={y} y2={y} className="alpha-chart-grid"/>)}
        {sma50Points && <polyline points={sma50Points} className="alpha-chart-sma50"/>}
        {sma20Points && <polyline points={sma20Points} className="alpha-chart-sma20"/>}
        <polyline points={closePoints} className="alpha-chart-close"/>
      </svg>
    </div>
    <div className="alpha-chart-legend"><span><i className="alpha-legend-close"/>Daily close · provider data</span><span><i className="alpha-legend-sma20"/>SMA 20 · calculated</span><span><i className="alpha-legend-sma50"/>SMA 50 · calculated</span></div>
    <dl className="alpha-history-facts">
      <div><dt>Open / High / Low</dt><dd>{formatNumber(latest.open)} / {formatNumber(latest.high)} / {formatNumber(latest.low)}</dd></div>
      <div><dt>Volume</dt><dd>{new Intl.NumberFormat().format(latest.volume)}</dd></div>
      <div><dt>SMA 20 / SMA 50</dt><dd>{latest.sma20 === undefined ? '20-session average unavailable' : formatNumber(latest.sma20)} / {latest.sma50 === undefined ? '50-session average unavailable' : formatNumber(latest.sma50)}</dd></div>
      <div><dt>Retrieved</dt><dd>{formatTime(series.retrievedAt)}</dd></div>
    </dl>
    <div className="alpha-history-foot"><span>{observations.length} daily observations · {formatDate(observations[0].date)}–{formatDate(latest.date)}</span><a href={snapshotUrl} target="_blank" rel="noopener noreferrer">View retrieved data ↗</a></div>
    <div className="alpha-history-foot alpha-history-source"><span>Source: Alpha Vantage · key-protected API</span><a href={series.sourceUrl} target="_blank" rel="noopener noreferrer">Provider documentation ↗</a></div>
  </article>
}

export default function AlphaHistoryPanel({ snapshot }: { snapshot: AlphaVantageSnapshot | null }) {
  const connection = snapshot?.connection
  const series = snapshot?.series ?? []
  const status = connection?.status ?? (snapshot ? 'unavailable' : 'loading')
  const emptyTitle = status === 'loading' ? 'Checking Alpha Vantage status…' : status === 'not_configured' ? 'Alpha Vantage key required' : status === 'ready' ? 'Daily history has not been retrieved yet' : status === 'empty' ? 'No daily history returned' : 'No Alpha Vantage history available'
  return <section className="panel alpha-history-panel" aria-labelledby="alpha-history-title">
    <div className="market-data-header">
      <div>
        <span className="eyebrow teal-text">Historical prices · source facts</span>
        <h3 id="alpha-history-title">Alpha Vantage daily context</h3>
        <p>Daily OHLCV observations are provider facts. SMA 20 and SMA 50 are calculated by SignalScope from those closes; neither is a forecast. This feed is historical, not realtime.</p>
      </div>
      <span className={`market-status market-status-${status}`}>{statusLabel(status)}</span>
    </div>
    {connection?.detail && <div className={`market-data-notice market-data-notice-${status}`} role="status">{connection.detail}</div>}
    {series.length ? <div className="alpha-history-grid">{series.map((item) => <HistoryCard key={item.symbol} series={item}/>)}</div> : <div className="market-empty-state">
      <strong>{emptyTitle}</strong>
      <p>{connection?.setupRequired ?? connection?.detail ?? 'Provider history will appear here after the first successful refresh.'}</p>
    </div>}
    <div className="market-data-footer"><span>Source: Alpha Vantage TIME_SERIES_DAILY · latest 100 observations per symbol.</span><span>Exact retrieved series is available through the read-only snapshot link; no API key is included.</span></div>
  </section>
}
