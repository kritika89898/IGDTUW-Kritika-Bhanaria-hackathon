import type { MarketDataSnapshot, MarketQuote } from './types'

const formatTime = (value: string) => {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Time unavailable'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date) + ' UTC'
}

const formatPrice = (quote: MarketQuote) => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: quote.currency, minimumFractionDigits: 2, maximumFractionDigits: Math.max(2, quote.price < 1 ? 4 : 2) }).format(quote.price)
  } catch {
    return `${quote.currency} ${quote.price.toFixed(2)}`
  }
}

const statusLabel = (status?: string) => ({
  connected: 'Connected',
  ready: 'Ready to refresh',
  loading: 'Loading provider status',
  partial: 'Partial data',
  stale: 'Stale snapshot',
  not_configured: 'Not configured',
  unavailable: 'Unavailable',
  rate_limited: 'Rate limited',
  empty: 'No quotes',
  error: 'Provider error'
}[status ?? ''] ?? 'Status unavailable')

export default function MarketDataPanel({ snapshot }: { snapshot: MarketDataSnapshot | null }) {
  const connection = snapshot?.connection
  const quotes = snapshot?.quotes ?? []
  const status = connection?.status ?? (snapshot ? 'unavailable' : 'loading')

  return <section className="panel market-data-panel" aria-labelledby="market-data-title">
    <div className="market-data-header">
      <div>
        <span className="eyebrow teal-text">Market data · source facts</span>
        <h3 id="market-data-title">Latest market prices</h3>
        <p>Provider prices are shown separately from model-generated risk analysis. Quote time comes from the source; retrieval time shows when SignalScope received it.</p>
      </div>
      <span className={`market-status market-status-${status}`}>{statusLabel(status)}</span>
    </div>

    {connection?.detail && status !== 'connected' && <div className={`market-data-notice market-data-notice-${status}`} role="status">{connection.detail}</div>}
    {quotes.length ? <div className="market-quote-grid">{quotes.map((quote) => {
      const direction = quote.changePercent === undefined || quote.changePercent === 0 ? 'flat' : quote.changePercent > 0 ? 'up' : 'down'
      return <article className={`market-quote-card ${quote.stale ? 'is-stale' : ''}`} key={quote.symbol}>
        <div className="market-quote-top">
          <div><span className="market-symbol">{quote.symbol}</span><span className="market-issuer">{quote.issuerName}</span></div>
          {quote.stale ? <span className="market-stale-tag">Stale</span> : <span className="market-fact-tag">Market quote</span>}
        </div>
        <div className="market-quote-value">{formatPrice(quote)}</div>
        <div className={`market-quote-change ${direction}`}>{quote.changePercent === undefined ? 'Change unavailable' : `${quote.changePercent > 0 ? '+' : ''}${quote.changePercent.toFixed(2)}% vs. prior close`}</div>
        <dl className="market-quote-times">
          <div><dt>Quote as of</dt><dd>{formatTime(quote.asOf)}</dd></div>
          <div><dt>Retrieved</dt><dd>{formatTime(quote.retrievedAt)}</dd></div>
        </dl>
        <div className="market-quote-foot">
          <span>{quote.exchange ?? 'US market'} · {quote.currency}</span>
          <a href={quote.sourceUrl} target="_blank" rel="noopener noreferrer">Open Yahoo Finance <span aria-hidden="true">↗</span></a>
        </div>
      </article>
    })}</div> : <div className="market-empty-state">
      <strong>{status === 'loading' ? 'Loading market-data provider status…' : status === 'not_configured' ? 'Market-data service not configured' : connection?.status === 'ready' ? 'Loading latest provider quote observations…' : status === 'empty' ? 'No quote records returned' : 'No live quotes available'}</strong>
      <p>{connection?.detail ?? (status === 'loading' ? 'Checking the provider connection…' : 'Quote status could not be loaded. Check the provider connection, then refresh.')}</p>
    </div>}

    <div className="market-data-footer">
      <span>Source: Yahoo Finance via the managed market-data API.</span>
      <span>Loaded on app startup; manual refresh available · freshness is not guaranteed to be real-time.</span>
    </div>
  </section>
}
