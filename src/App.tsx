import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { COMPANIES, DEMO_DATE, EVENTS, EVALUATION_CASES, METHODOLOGY, PORTFOLIO_ASSETS, SCENARIOS, SOURCE_MIX, TREND_DATA } from './data'
import type { AlphaVantageSnapshot, Company, DataConnection, MarketDataSnapshot, NavKey, PortfolioAsset, RiskEvent, Scenario, SourceType } from './types'
import MarketDataPanel from './MarketDataPanel'
import AlphaHistoryPanel from './AlphaHistoryPanel'

const NAV_ITEMS: { key: NavKey; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: 'grid' },
  { key: 'events', label: 'Events', icon: 'pulse' },
  { key: 'companies', label: 'Companies', icon: 'briefcase' },
  { key: 'portfolio', label: 'Portfolio Stress Test', icon: 'layers' },
  { key: 'methodology', label: 'Methodology', icon: 'book' }
]

const fmtMoney = (value: number) => `$${(value / 1000000).toFixed(2)}m`
const fmtPrice = (value: number) => `$${value.toFixed(2)}`
const sentimentLabel = (score: number) => score <= -0.2 ? 'Negative' : score >= 0.2 ? 'Positive' : 'Neutral'
const sentimentTone = (score: number) => score <= -0.2 ? 'negative' : score >= 0.2 ? 'positive' : 'neutral'
const sourceTone = (source: string) => { const key = source.toLowerCase(); return key.includes('official') || key.includes('filing') ? 'official' : key.includes('unverified') || key.includes('social') ? 'unverified' : key.includes('demo') ? 'demo' : 'reported' }
const statusLabel = (status: DataConnection['status']) => status === 'connected' ? 'Connected' : status === 'ready' ? 'Ready to refresh' : status === 'empty' ? 'No records' : status === 'not_configured' ? 'Not configured' : status === 'rate_limited' ? 'Rate limited' : status === 'partial' ? 'Partial' : status === 'stale' ? 'Stale data' : status === 'error' ? 'Connection error' : 'Unavailable'
const statusTone = (status: DataConnection['status']) => status === 'connected' || status === 'ready' ? 'teal' : status === 'rate_limited' || status === 'partial' || status === 'stale' || status === 'empty' ? 'watch' : status === 'not_configured' ? 'slate' : 'risk'
const safeExternalUrl = (value: string) => { if (/[\u0000-\u001f\u007f]/.test(value)) return undefined; try { const parsed = new URL(value); return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname ? parsed.toString() : undefined } catch { return undefined } }
const companyById = (id: string) => COMPANIES.find((company) => company.id === id)!
const stableDemoKey = (value: string) => { let hash = 2166136261; for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619); return (hash >>> 0).toString(36) }
const demoTextPrediction = (raw: string) => {
  const lower = raw.toLowerCase()
  const words = raw.split(/\s+/).filter(Boolean)
  const hasEventLanguage = /(announce|policy|operational|supplier|traceability|guidance|revenue|rate|inflation|central bank|delay|disruption|downgrade|credit|delivery|cost|risk|schedule|launch|increase|decrease)/i.test(raw)
  const isVague = raw.length < 45 || words.length < 8 || !hasEventLanguage
  const matchedCompany = COMPANIES.find((company) => lower.includes(company.name.toLowerCase()) || lower.includes(company.ticker.toLowerCase()))
  const negativeHits = (lower.match(/risk|delay|disruption|downgrade|cut|lower|slow|shortage|loss|pressure|uncertain|drop|increase cost|tighten|require/g) || []).length
  const positiveHits = (lower.match(/improve|restore|growth|strong|recover|benefit|on track|raise|increase demand/g) || []).length
  const sentiment = isVague ? 0 : Math.max(-1, Math.min(1, (positiveHits - negativeHits) * 0.14))
  const category = /policy|operational|supplier|traceability|procedure/i.test(raw) ? 'Company Policy / Operational Change' : /rate|inflation|central bank/i.test(raw) ? 'Macro / Monetary Policy' : /guidance|revenue|earnings/i.test(raw) ? 'Earnings / Guidance' : /shipping|port|freight|delivery|disruption/i.test(raw) ? 'Supply Chain / Logistics' : 'Unclassified demo input'
  const impact = isVague ? 1 : Math.max(2, Math.min(10, 3 + (category === 'Company Policy / Operational Change' ? 3 : 0) + (negativeHits >= 2 ? 2 : negativeHits)))
  const confidence = isVague ? 0.12 : Math.min(0.78, 0.34 + (matchedCompany ? 0.2 : 0) + (raw.length > 140 ? 0.12 : 0))
  return { isVague, matchedCompany, sentiment, category, impact, confidence }
}
const eventAgeHours = (event: RiskEvent) => {
  if (event.publishedAt) {
    const timestamp = Date.parse(event.publishedAt)
    return Number.isFinite(timestamp) ? Math.max(0, (Date.now() - timestamp) / 3600000) : 999
  }
  if (event.firstSeen === 'Just now' || event.updated === 'Just now') return 0
  if (event.firstSeen.includes('08 Oct')) return 8
  if (event.firstSeen.includes('07 Oct')) return 32
  if (event.firstSeen.includes('06 Oct')) return 56
  if (event.firstSeen.includes('05 Oct')) return 80
  return 999
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const paths: Record<string, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    pulse: <><path d="M3 12h4l2-7 4 14 2-7h6"/></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></>,
    arrow: <><path d="M5 12h13M13 6l6 6-6 6"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.6-4L3 10M3 5v5h5M4 13a8 8 0 0 0 14.6 4L21 14m0 5v-5h-5"/></>,
    play: <><path d="m8 5 11 7-11 7V5Z"/></>,
    chevron: <><path d="m9 18 6-6-6-6"/></>,
    external: <><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/></>,
    filter: <><path d="M4 6h16M7 12h10M10 18h4"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    shield: <><path d="M12 3 20 6v5c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
    check: <><path d="m5 12 4 4L19 6"/></>,
    upload: <><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></>,
    spark: <><path d="m12 3 1.3 5.7L19 10l-5.7 1.3L12 17l-1.3-5.7L5 10l5.7-1.3L12 3Z"/><path d="m19 16 .5 2.5L22 19l-2.5.5L19 22l-.5-2.5L16 19l2.5-.5L19 16Z"/></>
  }
  return <svg {...common} aria-hidden="true">{paths[name] ?? paths.info}</svg>
}

function BrandMark() {
  return <div className="brand-lockup"><div className="brand-mark"><span/><span/><span/></div><div><strong>SignalScope</strong><small>risk intelligence</small></div></div>
}

function Badge({ children, tone = 'slate', icon }: { children: ReactNode; tone?: string; icon?: string }) {
  return <span className={`badge badge-${tone}`}>{icon && <Icon name={icon} size={12}/>} {children}</span>
}

function ScoreBar({ value, max = 1, tone = 'teal', label }: { value: number; max?: number; tone?: string; label?: string }) {
  const percent = Math.max(4, Math.min(100, (value / max) * 100))
  return <div className="score-wrap">{label && <span className="score-label">{label}</span>}<div className="score-track"><span className={`score-fill ${tone}`} style={{ width: `${percent}%` }}/></div></div>
}

function Sentiment({ score }: { score: number }) {
  const label = sentimentLabel(score)
  return <span className={`sentiment ${sentimentTone(score)}`}><span className="sentiment-dot"/> {label} <b>{score > 0 ? '+' : ''}{score.toFixed(2)}</b></span>
}

function Sidebar({ view, setView, eventCount }: { view: NavKey; setView: (view: NavKey) => void; eventCount: number }) {
  return <aside className="sidebar">
    <BrandMark />
    <div className="side-kicker">Workspace</div>
    <nav className="side-nav">{NAV_ITEMS.map((item) => <button key={item.key} className={view === item.key ? 'active' : ''} onClick={() => setView(item.key)}><Icon name={item.icon}/><span>{item.label}</span>{item.key === 'events' && <em>{eventCount}</em>}</button>)}</nav>
    <div className="side-spacer"/>
    <div className="demo-note"><div className="demo-note-icon"><Icon name="shield" size={16}/></div><div><strong>Live workspace</strong><p>Provider-backed records only. Missing or empty inputs stay visible; sample data is never used.</p></div></div>
    <div className="side-footer"><span>Signals can be wrong.</span><button onClick={() => setView('methodology')}>Review methodology <Icon name="arrow" size={14}/></button></div>
  </aside>
}
function Topbar({ view, query, setQuery, onMenu, mobileNavOpen, menuButtonRef }: { view: NavKey; query: string; setQuery: (value: string) => void; onMenu: () => void; mobileNavOpen: boolean; menuButtonRef: { current: HTMLButtonElement | null } }) {
  const title = NAV_ITEMS.find((item) => item.key === view)?.label ?? 'Overview'
  return <header className="topbar"><button ref={menuButtonRef} className="mobile-menu" onClick={onMenu} aria-label="Open navigation menu" aria-controls="mobile-navigation" aria-expanded={mobileNavOpen}><Icon name="menu"/></button><div className="topbar-title"><span className="eyebrow">SignalScope / Workspace</span><h1>{title}</h1></div><div className="topbar-actions"><label className="global-search"><Icon name="search" size={16}/><input aria-label="Search signals and companies" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search signals, companies..."/><kbd>⌘ K</kbd></label><span className="date-chip"><Icon name="clock" size={14}/>Provider-backed</span><Badge tone="teal" icon="info">Live data</Badge></div></header>
}
function KpiCard({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: string; tone: string }) {
  return <div className="kpi-card"><div className={`kpi-icon ${tone}`}><Icon name={icon} size={18}/></div><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div><div className="kpi-detail">{detail}</div></div>
}

function Hero() {
  return <section className="hero"><div className="hero-copy"><div className="eyebrow teal-text"><span className="live-dot"/> LIVE PROVIDER FEEDS</div><h2>Read the source.<br/><em>Inspect the analysis.</em></h2><p>News articles, SEC EDGAR filings, GDELT global headlines, Yahoo Finance quotes, and Alpha Vantage daily history load from their providers. Source facts retain links and timestamps; any risk fields are model analysis.</p><div className="hero-actions"><span className="hero-note"><Icon name="shield" size={15}/> Provider-backed records only</span><span className="hero-note"><Icon name="check" size={15}/> No sample-data fallback</span></div></div><div className="hero-signal-card live-hero-card"><div className="signal-card-top"><span className="signal-overline">Connected input types</span><Badge tone="teal">Provider data</Badge></div><div className="signal-card-title">News · SEC · GDELT · quotes · daily history</div><p>Records refresh on startup. Empty and provider-error states remain explicit.</p><div className="signal-card-foot"><span><Icon name="shield" size={13}/> Server-side calls</span><span className="confidence"><Icon name="check" size={13}/> Facts + analysis</span></div></div></section>
}
function TrendChart() {
  const points = TREND_DATA.map((point, index) => `${24 + index * 48},${115 - point.value}`).join(' ')
  return <div className="trend-chart"><svg viewBox="0 0 312 140" preserveAspectRatio="none"><defs><linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#0f7b83" stopOpacity=".18"/><stop offset="1" stopColor="#0f7b83" stopOpacity="0"/></linearGradient></defs><path d={`M ${points} L 312 140 L 24 140 Z`} fill="url(#trend-fill)"/><polyline points={points} fill="none" stroke="#0f7b83" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>{TREND_DATA.map((point, index) => <circle key={point.label} cx={24 + index * 48} cy={115 - point.value} r={index === TREND_DATA.length - 1 ? 4 : 2.5} fill={index === TREND_DATA.length - 1 ? '#e7b35b' : '#0f7b83'} stroke="#fff" strokeWidth="2"/>)}</svg><div className="chart-labels">{TREND_DATA.map((point) => <span key={point.label}>{point.label}</span>)}</div></div>
}

function SourceMix({ events, demoMode }: { events: RiskEvent[]; demoMode: boolean }) {
  const liveCounts = events.reduce<Record<string, number>>((counts, event) => { event.evidence.forEach((evidence) => { counts[evidence.sourceType] = (counts[evidence.sourceType] ?? 0) + 1 }); return counts }, {})
  const liveTotal = Object.values(liveCounts).reduce((sum, count) => sum + count, 0)
  const liveRows = Object.entries(liveCounts).map(([label, count], index) => ({ label, count, value: liveTotal ? Math.round((count / liveTotal) * 100) : 0, color: ['teal', 'navy', 'amber', 'slate'][index % 4] }))
  const rows = demoMode ? SOURCE_MIX : liveRows
  return <div className="source-mix">{rows.length ? rows.map((item) => <div className="mix-row" key={item.label}><div className="mix-label"><span className={`mix-dot ${item.color}`}/><span>{item.label}</span><strong>{item.count}</strong></div><div className="mix-track"><span className={`mix-fill ${item.color}`} style={{ width: `${item.value}%` }}/></div><span className="mix-percent">{item.value}%</span></div>) : <div className="empty-state compact"><strong>No live source records yet.</strong><p>Refresh a configured provider to populate source coverage.</p></div>}</div>
}

function SectionHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return <div className="section-header"><div><span className="eyebrow">{eyebrow}</span><h3>{title}</h3></div>{action}</div>
}

function EventRow({ event, onSelect }: { event: RiskEvent; onSelect: (event: RiskEvent) => void }) {
  const company = event.companyNames?.[0] ? { name: event.companyNames[0] } : companyById(event.companyIds[0]) || { name: 'Unassigned input' }
  return <button className="event-row" onClick={() => onSelect(event)}><div className="event-main"><div className="event-signal-line"><span className={`impact-dot impact-${event.impact >= 8 ? 'high' : event.impact >= 6 ? 'medium' : 'low'}`}/><span className="event-company">{company.name}</span><span className="event-time">{event.updated}</span></div><strong>{event.headline}</strong><p>{event.summary}</p><div className="event-tags"><Badge tone={event.origin === 'live' ? 'teal' : 'demo'}>{event.origin === 'live' ? `${event.stale ? 'Stale live' : 'Live'} · ${event.provider}` : 'Demo record'}</Badge><Badge tone={sourceTone(event.reliability)}>{event.reliability}</Badge>{event.sourceTypes.slice(0, 2).map((source) => <Badge key={source} tone={sourceTone(source)}>{source}</Badge>)}</div><span className="event-meta">{event.sourceCount ? `${event.sourceCount} independent source${event.sourceCount === 1 ? '' : 's'}` : 'User-provided input · no independent corroboration'} · First seen {event.firstSeen}</span></div><div className="event-metrics"><div><span>Sentiment</span><Sentiment score={event.sentiment}/></div><div><span>Impact</span><strong className="impact-number">{event.impact}<small>/10</small></strong></div><div><span>Confidence</span><ScoreBar value={event.confidence} label={`${Math.round(event.confidence * 100)}%`}/></div><Icon name="chevron" size={17}/></div></button>
}

function TopSignals({ events, onSelect, onAll }: { events: RiskEvent[]; onSelect: (event: RiskEvent) => void; onAll: () => void }) {
  const priorityEvents = [...events].sort((a, b) => b.impact - a.impact).slice(0, 4)
  return <section className="panel top-signals"><SectionHeader eyebrow="Priority queue" title="Top risk signals" action={<button className="text-button" onClick={onAll}>View all <Icon name="arrow" size={14}/></button>}/>{priorityEvents.length ? <><div className="signal-table-head"><span>Signal</span><span>Sentiment</span><span>Impact</span><span>Confidence</span><span/></div><div className="signal-table">{priorityEvents.map((event) => <EventRow key={event.id} event={event} onSelect={onSelect}/>)}</div></> : <div className="empty-state live-empty-state"><div className="empty-icon"><Icon name="info"/></div><strong>No provider-backed signals available.</strong><p>Check provider status and refresh from Overview. No sample records are substituted.</p></div>}</section>
}

function DataConnections({ onLiveEvents, onMarketData, onAlphaHistory, autoRefresh, onAutoRefreshStarted }: { onLiveEvents: (events: RiskEvent[]) => void; onMarketData: (snapshot: MarketDataSnapshot | null) => void; onAlphaHistory: (snapshot: AlphaVantageSnapshot | null) => void; autoRefresh: boolean; onAutoRefreshStarted: () => void }) {
  const [connections, setConnections] = useState<DataConnection[]>([])
  const [refreshState, setRefreshState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const startupRefreshStarted = useRef(false)
  const loadConnections = async () => {
    try {
      const response = await fetch('/api/connections')
      if (!response.ok) throw new Error('Connection status unavailable')
      const data = await response.json()
      setConnections(data.connections ?? [])
      onMarketData(data.marketData ?? null)
      onAlphaHistory(data.alphaHistory ?? null)
    } catch {
      onMarketData({
        connection: {
          id: 'market-data',
          name: 'Market quotes',
          provider: 'Yahoo Finance via Manus API hub',
          coverage: 'Market-data provider status unavailable.',
          status: 'unavailable',
          detail: 'Could not load provider status from /api/connections. Check server health and retry.'
        },
        quotes: [],
        retrievedAt: new Date().toISOString()
      })
      onAlphaHistory({ connection: { id: 'alpha-vantage', name: 'Daily price history', provider: 'Alpha Vantage', coverage: 'Provider status unavailable.', status: 'unavailable', detail: 'Could not load provider status from /api/connections. Check server health and retry.' }, series: [], retrievedAt: new Date().toISOString() })
      setMessage('Connection status unavailable; the provider service may be offline.')
    }
  }
  const refresh = async () => {
    setRefreshState('loading')
    setMessage('Refreshing configured providers…')
    try {
      const response = await fetch('/api/refresh', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Provider refresh failed')
      const nextConnections: DataConnection[] = data.connections ?? []
      setConnections(nextConnections)
      onLiveEvents(data.events ?? [])
      onMarketData(data.marketData ?? null)
      onAlphaHistory(data.alphaHistory ?? null)
      const providerConnections = nextConnections.filter((connection) => ['newsapi', 'sec-edgar', 'market-data', 'gdelt', 'alpha-vantage'].includes(connection.id))
      const issueStatuses: DataConnection['status'][] = ['not_configured', 'error', 'rate_limited', 'partial', 'stale', 'unavailable']
      const providerIssues = providerConnections.some((connection) => issueStatuses.includes(connection.status))
      const emptyProviders = providerConnections.filter((connection) => connection.status === 'empty')
      const staleData = providerConnections.some((connection) => connection.status === 'stale')
      const refreshTime = data.retrievedAt ? new Date(data.retrievedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'just now'
      setRefreshState(providerIssues ? 'error' : 'success')
      setMessage(staleData ? 'Refresh could not replace the last good live records; retained records are marked stale.' : providerIssues ? 'Refresh completed with provider issues; no sample records were added.' : emptyProviders.length ? `Refresh completed at ${refreshTime}; no matching records from ${emptyProviders.map((connection) => connection.name).join(', ')}.` : `Refresh completed at ${refreshTime}.`)
    } catch (error) {
      setRefreshState('error')
      setMessage(error instanceof Error ? error.message : 'Provider refresh failed; no records were substituted.')
    }
  }
  useEffect(() => {
    if (startupRefreshStarted.current) return
    startupRefreshStarted.current = true
    const initialize = async () => {
      await loadConnections()
      if (!autoRefresh) return
      onAutoRefreshStarted()
      await refresh()
    }
    void initialize()
  }, [])
  return <section className="panel connections-panel"><div className="connections-head"><div><span className="eyebrow teal-text">Data connections</span><h3>Real inputs, visible boundaries.</h3><p>This workspace loads provider data on startup. Use manual refresh for updates; empty and error states never fall back to sample records.</p></div><div className="connections-actions"><Badge tone="teal">Live only</Badge><button className="secondary-button small" onClick={refresh} disabled={refreshState === 'loading'}><Icon name="refresh" size={13}/>{refreshState === 'loading' ? 'Refreshing…' : 'Refresh providers'}</button></div></div><div className="connection-grid">{connections.map((connection) => <div className="connection-card" key={connection.id}><div className="connection-card-top"><span className={`connection-icon ${statusTone(connection.status)}`}><Icon name={connection.id === 'sec-edgar' ? 'book' : ['market-data', 'alpha-vantage'].includes(connection.id) ? 'layers' : 'pulse'} size={15}/></span><div><strong>{connection.name}</strong><span>{connection.provider}</span></div><Badge tone={statusTone(connection.status)}>{statusLabel(connection.status)}</Badge></div><p>{connection.detail}</p><small><b>Coverage:</b> {connection.coverage}</small>{connection.lastSuccessfulRetrieval && <small><b>Last successful retrieval:</b> {new Date(connection.lastSuccessfulRetrieval).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small>}{connection.setupRequired && <small className="connection-setup"><b>Setup:</b> {connection.setupRequired}</small>}</div>)}{!connections.length && <div className="connection-empty"><Icon name="clock" size={16}/><span>Loading provider status…</span></div>}</div>{message && <div className={`connection-message ${refreshState}`} aria-live="polite"><Icon name={refreshState === 'error' ? 'info' : 'check'} size={14}/>{message}</div>}</section>
}
function Overview({ events, onSelect, onAll, demoMode, onLiveEvents, marketData, onMarketData, alphaHistory, onAlphaHistory, autoRefresh, onAutoRefreshStarted }: { events: RiskEvent[]; onSelect: (event: RiskEvent) => void; onAll: () => void; demoMode: boolean; onLiveEvents: (events: RiskEvent[]) => void; marketData: MarketDataSnapshot | null; onMarketData: (snapshot: MarketDataSnapshot | null) => void; alphaHistory: AlphaVantageSnapshot | null; onAlphaHistory: (snapshot: AlphaVantageSnapshot | null) => void; autoRefresh: boolean; onAutoRefreshStarted: () => void }) {
  const activeEvents = events.length
  const highImpactEvents = events.filter((event) => event.impact >= 8).length
  const companiesAffected = new Set(events.flatMap((event) => event.companyNames?.length ? event.companyNames : event.companyIds)).size
  return <div className="view-stack"><Hero/><DataConnections onLiveEvents={onLiveEvents} onMarketData={onMarketData} onAlphaHistory={onAlphaHistory} autoRefresh={autoRefresh} onAutoRefreshStarted={onAutoRefreshStarted}/>{!demoMode && <MarketDataPanel snapshot={marketData}/>} {!demoMode && <AlphaHistoryPanel snapshot={alphaHistory}/>} <div className="kpi-grid"><KpiCard label="Active events" value={`${activeEvents}`} detail={demoMode ? 'Grouped demo signals' : 'Provider-backed signals'} icon="pulse" tone="teal"/><KpiCard label="High-impact events" value={`${highImpactEvents}`} detail="Impact score ≥ 8" icon="shield" tone="amber"/><KpiCard label="Companies affected" value={`${companiesAffected}`} detail={demoMode ? 'Across demo sectors' : 'Named entities in source records'} icon="briefcase" tone="navy"/><KpiCard label="Portfolio exposure at risk" value={demoMode ? "$2.45m" : "—"} detail={demoMode ? "Illustrative · sample only" : "No portfolio connected"} icon="layers" tone="rose"/></div><TopSignals events={events} onSelect={onSelect} onAll={onAll}/><div className="overview-grid"><section className="panel chart-panel"><SectionHeader eyebrow="Signal activity" title="Risk signals over time" action={<Badge tone="slate">{demoMode ? 'Demo history' : 'Current refresh'}</Badge>}/>{demoMode ? <><div className="chart-summary"><strong>74</strong><span><b>+18%</b> vs prior period</span></div><TrendChart/></> : <div className="live-empty-note"><strong>{events.length ? `${events.length} grouped live signals` : 'No live signals yet'}</strong><p>Refresh time series history is not stored in this release; current provider records are shown in Events.</p></div>}<div className="chart-foot"><span><i className="legend-line teal"/> {demoMode ? 'Total grouped signals' : 'Current grouped signals'}</span><span><i className="legend-dot amber"/> {demoMode ? 'Today' : 'Retrieved'}</span></div></section><section className="panel source-panel"><SectionHeader eyebrow="Evidence coverage" title="Source mix" action={<button className="icon-button" aria-label="Source mix info"><Icon name="info" size={15}/></button>}/><SourceMix events={events} demoMode={demoMode}/><div className="source-foot"><span><i className="status-dot teal"/> {demoMode ? '39 total demo sources' : `${events.reduce((sum, event) => sum + event.evidence.length, 0)} retrieved sources`}</span><span>Source facts, then analysis</span></div></section></div><section className="method-strip"><div className="method-icon"><Icon name="spark" size={17}/></div><div><strong>How are these scores estimated?</strong><p>Signals combine language sentiment, event severity, source quality, and corroboration. They describe potential risk — never a guaranteed outcome.</p></div><button className="text-button" onClick={() => onAll()}>Review signals <Icon name="arrow" size={14}/></button></section></div>
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <label className="filter-select"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>
}

function SourceIntake({ onCreated }: { onCreated: (event: RiskEvent) => void }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'news-text' | 'filing-text' | 'transcript-text' | 'article' | 'video' | 'filing'>('news-text')
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [stage, setStage] = useState(0)
  const [status, setStatus] = useState('')
  const isTextMode = mode.endsWith('-text')
  const isUrlMode = !isTextMode
  const sourceType: SourceType = mode === 'filing-text' ? 'Company Filing' : mode === 'transcript-text' ? 'Video Transcript' : 'News'
  const sourceLabel = mode === 'article' ? 'news article' : mode === 'video' ? 'YouTube video' : mode === 'filing' ? 'company announcement or filing' : mode === 'filing-text' ? 'company announcement or filing text' : mode === 'transcript-text' ? 'video transcript text' : 'news or social-media text'
  const buildDemoEvent = (raw: string, now: string): RiskEvent => {
    const { isVague, matchedCompany, sentiment, category, impact, confidence } = demoTextPrediction(raw)
    const headline = isVague ? 'Not enough evidence' : `Demo analysis: ${matchedCompany ? `${matchedCompany.name} · ` : ''}${category}`
    const summary = isVague ? 'The pasted text was received, but it does not contain enough company, event, or outcome detail to create a useful signal.' : raw.slice(0, 170) + (raw.length > 170 ? '…' : '')
    const explanation = isVague ? 'Missing information: a company name or ticker, a specific event, and enough context to estimate relevance and severity.' : `This is a manually mapped demo result from pasted ${sourceType.toLowerCase()} text. It is not a verified finding or a live model prediction.`
    return { id: `demo-${now}`, headline, summary, explanation, category, sentiment, impact, confidence, firstSeen: 'Just now', updated: 'Just now', sourceCount: 0, sourceTypes: [sourceType], reliability: 'Unverified demo input', companyIds: matchedCompany ? [matchedCompany.id] : [], limitedEvidence: true, sourcesDisagree: false, whatCouldChange: isVague ? ['Add a company name or ticker.', 'Describe the event and expected timing.', 'Provide a supporting excerpt or source context.'] : ['A permitted source adapter verifies the original content.', 'Independent sources corroborate the same company or event.', 'A person reviews the extracted context and timing.'], evidence: [{ id: `demo-source-${now}`, title: isVague ? 'Pasted text needs more evidence' : `Pasted ${sourceLabel}`, sourceName: 'User-provided demo input', sourceType, reliability: 'Unverified demo input', publishedAt: 'Just now', url: 'https://example.com/demo-input', excerpt: raw }], timeline: [{ time: 'Just now', label: 'Demo input received', detail: 'Text was prepared locally; no external source was fetched or verified.', sourceType }] }
  }
  const submit = () => {
    if (isTextMode && text.trim().length < 1) { setStatus('Paste some text to start the demo analysis.'); return }
    if (isUrlMode && !url.trim()) { setStatus(`Paste a ${sourceLabel} URL to start the demo processing flow.`); return }
    setStatus('')
    setStage(1)
    window.setTimeout(() => setStage(2), 500)
    window.setTimeout(() => setStage(3), 1000)
    window.setTimeout(() => {
      setStage(4)
      const raw = isTextMode ? text.trim() : `URL received; demo does not fetch or verify this source. Submitted ${sourceLabel}: ${url.trim()}`
      const now = stableDemoKey(`${sourceType}:${raw}`)
      const demoEvent = isTextMode ? buildDemoEvent(raw, now) : { ...buildDemoEvent(raw, now), headline: 'Demo analysis: URL received', summary: `URL received; demo does not fetch or verify this source. Submitted ${sourceLabel}.`, explanation: 'This URL was accepted into the local demo workflow only. SignalScope did not fetch, transcribe, or verify it.', category: 'Demo Analysis', sentiment: 0, impact: 1, confidence: 0.08, sourceTypes: ['Demo Analysis' as SourceType], reliability: 'Unverified demo input' as const, companyIds: [], evidence: [{ id: `demo-url-${now}`, title: 'URL received; not fetched', sourceName: 'User-provided demo input', sourceType: 'Demo Analysis' as SourceType, reliability: 'Unverified demo input' as const, publishedAt: 'Just now', url: url.trim(), excerpt: 'URL received; demo does not fetch or verify this source.' }], timeline: [{ time: 'Just now', label: 'URL received', detail: 'The demo did not fetch, verify, or automatically transcribe this source.', sourceType: 'Demo Analysis' as SourceType }] }
      onCreated(demoEvent)
      setText(''); setUrl(''); setOpen(false)
      window.setTimeout(() => setStage(0), 400)
    }, 1500)
  }
  return <section className={`intake ${open ? 'open' : ''}`}><button className="intake-trigger" onClick={() => setOpen(!open)}><span className="intake-trigger-icon"><Icon name={open ? 'close' : 'plus'} size={17}/></span><span><strong>Add a source</strong><small>Analyze pasted text locally, or submit a URL to see an honest staged workflow.</small></span><Badge tone="demo">Demo analysis</Badge><Icon name="chevron" size={17}/></button>{open && <div className="intake-body"><div className="intake-tabs"><button className={mode === 'news-text' ? 'active' : ''} onClick={() => setMode('news-text')}><Icon name="upload" size={15}/> Paste news / social</button><button className={mode === 'filing-text' ? 'active' : ''} onClick={() => setMode('filing-text')}><Icon name="book" size={15}/> Paste filing text</button><button className={mode === 'transcript-text' ? 'active' : ''} onClick={() => setMode('transcript-text')}><Icon name="play" size={15}/> Paste transcript</button><button className={mode === 'article' ? 'active' : ''} onClick={() => setMode('article')}><Icon name="external" size={15}/> News URL</button><button className={mode === 'video' ? 'active' : ''} onClick={() => setMode('video')}><Icon name="play" size={15}/> YouTube URL</button><button className={mode === 'filing' ? 'active' : ''} onClick={() => setMode('filing')}><Icon name="book" size={15}/> Filing URL</button></div>{isTextMode ? <label className="intake-field"><span>{mode === 'filing-text' ? 'Company announcement or filing text' : mode === 'transcript-text' ? 'Video transcript text' : 'News or social-media text'}</span><textarea aria-label="Pasted source text" value={text} onChange={(event) => setText(event.target.value)} placeholder={mode === 'filing-text' ? 'Paste a company announcement or filing excerpt…' : mode === 'transcript-text' ? 'Paste a permitted transcript excerpt; SignalScope will not auto-transcribe the video…' : 'Paste news or social-media text…'}/></label> : <label className="intake-field"><span>{sourceLabel} URL</span><input aria-label={`${sourceLabel} URL`} className="intake-url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder={mode === 'video' ? 'https://youtube.com/watch?v=demo' : mode === 'filing' ? 'https://example.com/company-filing' : 'https://example.com/news-article'}/></label>}<div className="intake-foot"><span className="intake-disclaimer"><Icon name="info" size={14}/> {isUrlMode ? 'URL received; demo does not fetch or verify this source.' : 'Local demo analysis; source quality is not verified.'}</span><button className="primary-button small" onClick={submit} disabled={stage > 0}><Icon name={stage > 0 ? 'clock' : 'spark'} size={14}/> {stage > 0 ? 'Processing…' : 'Create demo signal'}</button></div>{stage > 0 && <div className="processing"><div className="processing-line">{['Source received', 'Text prepared', 'Companies and events identified', 'Risk signal created'].map((label, index) => <div className={stage > index ? 'done' : ''} key={label}><span>{stage > index ? <Icon name="check" size={11}/> : index + 1}</span><small>{label}</small></div>)}</div></div>}{status && <div className="form-status">{status}</div>}</div>}</section>
}

function EventsView({ events, query, setQuery, onSelect }: { events: RiskEvent[]; query: string; setQuery: (value: string) => void; onSelect: (event: RiskEvent) => void }) {
  const [companyFilter, setCompanyFilter] = useState('All companies')
  const [categoryFilter, setCategoryFilter] = useState('All categories')
  const [sentimentFilter, setSentimentFilter] = useState('All sentiment')
  const [impactFilter, setImpactFilter] = useState('Any impact')
  const [sourceFilter, setSourceFilter] = useState('All sources')
  const [providerFilter, setProviderFilter] = useState('All providers')
  const [officialFilter, setOfficialFilter] = useState('All source classes')
  const [dateFilter, setDateFilter] = useState('Any date')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filtered = events.filter((event) => {
    const haystack = `${event.headline} ${event.summary} ${event.category} ${event.provider ?? ''} ${event.origin ?? ''} ${(event.companyNames ?? []).join(' ')} ${event.companyIds.map((id) => companyById(id)?.name ?? '').join(' ')} ${(event.sourceFacts ?? []).map((fact) => `${fact.label} ${fact.value}`).join(' ')} ${event.evidence.map((item) => `${item.title} ${item.sourceName} ${item.sourceType} ${item.url} ${item.excerpt}`).join(' ')}`.toLowerCase()
    const searchMatch = !query || haystack.includes(query.toLowerCase())
    const companyMatch = companyFilter === 'All companies' || (event.companyNames ?? []).includes(companyFilter) || event.companyIds.some((id) => companyById(id)?.name === companyFilter)
    const categoryMatch = categoryFilter === 'All categories' || event.category === categoryFilter
    const sentimentMatch = sentimentFilter === 'All sentiment' || sentimentLabel(event.sentiment) === sentimentFilter
    const impactMatch = impactFilter === 'Any impact' || (impactFilter === 'High impact' ? event.impact >= 8 : event.impact < 8)
    const sourceMatch = sourceFilter === 'All sources' || event.sourceTypes.includes(sourceFilter as SourceType)
    const providerMatch = providerFilter === 'All providers' || (event.provider ?? 'Provider source') === providerFilter
    const officialMatch = officialFilter === 'All source classes' || (officialFilter === 'Official' ? event.origin === 'live' && event.official === true : officialFilter === 'Third-party' ? event.origin === 'live' && event.official !== true : event.origin !== 'live')
    const ageHours = eventAgeHours(event)
    const dateMatch = dateFilter === 'Any date' || (dateFilter === 'Last 24 hours' ? ageHours <= 24 : ageHours <= 168)
    return searchMatch && companyMatch && categoryMatch && sentimentMatch && impactMatch && sourceMatch && providerMatch && officialMatch && dateMatch
  })
  return <div className="view-stack"><div className="page-intro"><div><span className="eyebrow teal-text">Traceable event explorer</span><h2>Signals with a paper trail.</h2><p>Search, filter, and open the evidence behind each grouped event. Official filings are never treated the same as unverified posts.</p></div><div className="intro-count"><strong>{filtered.length}</strong><span>visible signals</span></div></div><section className="panel explorer-panel"><div className="explorer-toolbar"><label className="explorer-search"><Icon name="search" size={16}/><input aria-label="Search event signals" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search headlines, summaries, companies…"/></label><button className="filter-toggle" aria-controls="event-filters" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}><Icon name="filter" size={15}/> {filtersOpen ? 'Hide filters' : 'Filters'}</button></div><div id="event-filters" className={`filters ${filtersOpen ? 'mobile-open' : ''}`}><FilterSelect label="Company" value={companyFilter} onChange={setCompanyFilter} options={['All companies', ...Array.from(new Set(events.flatMap((event) => event.companyNames ?? [])))]}/><FilterSelect label="Category" value={categoryFilter} onChange={setCategoryFilter} options={['All categories', ...Array.from(new Set(events.map((event) => event.category)))]}/><FilterSelect label="Sentiment" value={sentimentFilter} onChange={setSentimentFilter} options={['All sentiment', 'Negative', 'Neutral', 'Positive']}/><FilterSelect label="Impact" value={impactFilter} onChange={setImpactFilter} options={['Any impact', 'High impact', 'Standard impact']}/><FilterSelect label="Source" value={sourceFilter} onChange={setSourceFilter} options={['All sources', 'News', 'Company Filing']}/><FilterSelect label="Provider" value={providerFilter} onChange={setProviderFilter} options={['All providers', ...Array.from(new Set(events.map((event) => event.provider ?? 'Provider source')))]}/><FilterSelect label="Source class" value={officialFilter} onChange={setOfficialFilter} options={['All source classes', 'Official', 'Third-party']}/><FilterSelect label="Date range" value={dateFilter} onChange={setDateFilter} options={['Any date', 'Last 24 hours', 'Last 7 days']}/></div><div className="results-meta"><span><b>{filtered.length}</b> grouped signals</span><span>Sorted by impact <Icon name="chevron" size={13}/></span></div><div className="event-list">{filtered.length ? [...filtered].sort((a, b) => b.impact - a.impact).map((event) => <EventRow key={event.id} event={event} onSelect={onSelect}/>) : <div className="empty-state"><div className="empty-icon"><Icon name="search"/></div><strong>{events.length ? 'No signals match those filters.' : 'No provider-backed signals yet.'}</strong><p>{events.length ? 'Try a broader search or reset one of the filters.' : 'Check provider status on Overview. Empty provider results never show sample records.'}</p></div>}</div></section></div>
}

function EventDetail({ event, onClose, onCompany, onStress, demoStep }: { event: RiskEvent; onClose: () => void; onCompany: (company: Company) => void; onStress: () => void; demoStep: number }) {
  const drawerRef = useRef<HTMLElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null
    drawerRef.current?.focus()
    const handleKey = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === 'Escape') { onCloseRef.current(); return }
      if (keyboardEvent.key !== 'Tab') return
      const focusable = Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? []).filter((element) => !element.hasAttribute('disabled'))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (keyboardEvent.shiftKey && document.activeElement === first) { keyboardEvent.preventDefault(); last.focus() }
      else if (!keyboardEvent.shiftKey && document.activeElement === last) { keyboardEvent.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('keydown', handleKey); previousFocus.current?.focus() }
  }, [])
  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><aside ref={drawerRef} className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="signal-detail-title" tabIndex={-1}><div className="drawer-head"><div><span className="eyebrow teal-text">Signal detail</span><div className="drawer-id">{event.id.startsWith('demo-') ? 'DEMO ANALYSIS' : `GROUPED EVENT · ${event.sourceCount} SOURCES`}</div></div><button className="icon-button" onClick={onClose} aria-label="Close details"><Icon name="close"/></button></div><div className="drawer-body"><div className="detail-title-row"><h2 id="signal-detail-title">{event.headline}</h2><Badge tone={sourceTone(event.reliability)}>{event.reliability}</Badge></div><p className="detail-lead">{event.explanation}</p>{event.limitedEvidence && <div className="notice limited"><Icon name="info" size={17}/><div><strong>Limited evidence</strong><p>This signal is early and should be reviewed as more independent sources arrive.</p></div></div>}{event.sourcesDisagree && <div className="notice disagree"><Icon name="info" size={17}/><div><strong>Sources disagree</strong><p>{event.origin === 'live' ? 'Retrieved sources differ in language, timing, or reliability. Review the original links before treating the grouped signal as settled.' : 'One unverified post claims a line stoppage; no official production notice corroborates it.'}</p></div></div>}<div className="detail-score-grid"><div className="detail-score"><span>Sentiment</span><Sentiment score={event.sentiment}/><small>Language tone across sources</small></div><div className="detail-score"><span>Impact</span><strong className="big-score">{event.impact}<small>/10</small></strong><small>Potential severity, not price movement</small></div><div className="detail-score"><span>Confidence</span><strong className="big-score">{Math.round(event.confidence * 100)}<small>%</small></strong><small>Evidence amount and quality</small></div></div><div className="detail-section"><div className="detail-section-head"><span className="eyebrow">Why it matters</span><span className="detail-updated"><Icon name="clock" size={13}/> First seen {event.firstSeen}</span></div><p>{event.summary}</p><div className="affected-list"><span className="mini-label">Affected companies</span>{event.companyNames?.map((name) => <div className="affected-live-company" key={name}><span className="company-avatar small">{name.slice(0, 2).toUpperCase()}</span><span><b>{name}</b><small>{event.category} · provider match</small></span></div>)}{event.companyIds.map((id) => { const company = companyById(id); if (!company) return null; return <button key={id} onClick={() => onCompany(company)}><span className="company-avatar small">{company.ticker.slice(0, 2)}</span><span><b>{company.name}</b><small>{company.sector} · {event.category}</small></span><Icon name="chevron" size={14}/></button> })}</div></div><div className="detail-section"><div className="detail-section-head"><span className="eyebrow">Signal timeline</span></div><div className="timeline">{event.timeline.map((item, index) => <div className="timeline-item" key={`${item.time}-${index}`}><span className="timeline-node"/><div><div className="timeline-meta"><b>{item.label}</b><span>{item.time}</span></div><p>{item.detail}</p><Badge tone={sourceTone(item.sourceType)}>{item.sourceType}</Badge></div></div>)}</div></div>{event.sourceFacts && <div className="detail-section source-facts"><div className="detail-section-head"><span className="eyebrow">Source facts</span><Badge tone={event.origin === 'live' ? 'teal' : 'demo'}>{event.origin === 'live' ? 'Retrieved record' : 'Demo record'}</Badge></div><div className="facts-grid">{event.sourceFacts.map((fact) => <div key={`${fact.label}-${fact.value}`}><span>{fact.label}</span><strong>{fact.value}</strong></div>)}</div></div>}<div className="detail-section"><div className="detail-section-head"><span className="eyebrow">Evidence snippets</span><span className="detail-updated">{event.origin === 'live' ? 'Original provider links' : 'Clickable demo links'}</span></div><div className="evidence-list">{event.evidence.map((item) => <a className="evidence-card" href={safeExternalUrl(item.url) ?? '#'} onClick={(clickEvent) => { if (!safeExternalUrl(item.url)) clickEvent.preventDefault() }} target="_blank" rel="noreferrer" key={item.id}><div className="evidence-top"><Badge tone={sourceTone(item.reliability)}>{item.reliability}</Badge><span>{item.publishedAt}</span></div><strong>{item.title}</strong><span className="evidence-source">{item.sourceName} · {item.sourceType}{item.timestamp && ` · ${item.timestampLabel ? `${item.timestampLabel}: ` : ''}${item.timestamp}`}</span>{item.excerptKind === 'metadata_note' ? <p className="metadata-note"><em>Metadata note: {item.excerpt}</em></p> : <p>“{item.excerpt}”</p>}<Icon name="external" size={14}/></a>)}</div></div><div className="detail-section what-change"><div className="detail-section-head"><span className="eyebrow">What could change this assessment?</span></div><ul>{event.whatCouldChange.map((item) => <li key={item}><Icon name="check" size={14}/>{item}</li>)}</ul></div>{event.sourceTypes.includes('Video Transcript') && <div className="video-note"><div className="video-thumb"><Icon name="play" size={22}/></div><div><Badge tone="reported">Demo transcript</Badge><strong>Video source details included</strong><p>Title, channel, publication date, and timestamped excerpts are shown from sample data. SignalScope does not imply that every public video can be automatically transcribed.</p></div></div>}</div><div className="drawer-foot">{demoStep > 0 && <button className="primary-button" onClick={onStress}>Continue to portfolio impact <Icon name="arrow" size={14}/></button>}<button className="secondary-button" onClick={onClose}>Close detail</button></div></aside></div>
}

function Sparkline({ data }: { data: number[] }) {
  const min = Math.min(...data), max = Math.max(...data)
  const points = data.map((value, index) => `${index * 16},${28 - ((value - min) / Math.max(0.01, max - min)) * 24}`).join(' ')
  return <svg className="sparkline" viewBox="0 0 112 32" preserveAspectRatio="none"><polyline points={points} fill="none" stroke="#0f7b83" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
}

function CompanyProfile({ company, events, onBack, onEvent }: { company: Company; events: RiskEvent[]; onBack: () => void; onEvent: (event: RiskEvent) => void }) {
  const companyEvents = events.filter((event) => event.companyIds.includes(company.id))
  return <div className="view-stack"><button className="back-button" onClick={onBack}><Icon name="arrow" size={15}/> All companies</button><div className="company-profile-head"><div className="profile-identity"><span className="company-avatar large">{company.ticker.slice(0, 2)}</span><div><span className="eyebrow teal-text">Demo company profile</span><h2>{company.name}</h2><p>{company.ticker} · {company.sector}</p></div></div><div className="profile-price"><span>Demo price</span><strong>{fmtPrice(company.price)}</strong><b className={company.change < 0 ? 'down' : 'up'}>{company.change > 0 ? '+' : ''}{company.change.toFixed(1)}% today</b><small>Illustrative only · not live market data</small></div></div><div className="company-grid"><section className="panel company-about"><SectionHeader eyebrow="Company context" title="Why it is on the radar"/><p>{company.description}</p><div className="relationship-title"><span className="eyebrow">Affected relationships</span><Badge tone="demo">Demo data</Badge></div><div className="relationships">{company.relationships.map((relationship) => <div className="relationship" key={relationship.name}><span className="relationship-icon"><Icon name={relationship.relation === 'Supplier' ? 'upload' : relationship.relation === 'Customer' ? 'briefcase' : 'layers'} size={15}/></span><div><strong>{relationship.name}</strong><span>{relationship.relation} · {relationship.note}</span></div></div>)}</div></section><section className="panel history-panel"><SectionHeader eyebrow="Language trend" title="Sentiment history" action={<Sentiment score={company.sentimentHistory[company.sentimentHistory.length - 1]}/>}/><div className="sentiment-graphic"><Sparkline data={company.sentimentHistory}/><div className="sentiment-axis"><span>8 days ago</span><span>Today</span></div></div><div className="category-breakdown"><div><span className="breakdown-value">{companyEvents.length}</span><span>linked signals</span></div><div><span className="breakdown-value">{new Set(companyEvents.map((event) => event.category)).size}</span><span>categories</span></div><div><span className="breakdown-value">{companyEvents.filter((event) => event.impact >= 8).length}</span><span>high impact</span></div></div></section></div><section className="panel company-events"><SectionHeader eyebrow="Recent signals" title={`Events linked to ${company.ticker}`} action={<Badge tone="slate">Demo data</Badge>}/>{companyEvents.map((event) => <EventRow key={event.id} event={event} onSelect={onEvent}/>)}</section></div>
}

function LiveCompanyDirectory({ events, onEvent, marketData }: { events: RiskEvent[]; onEvent: (event: RiskEvent) => void; marketData: MarketDataSnapshot | null }) {
  const names = Array.from(new Set(events.flatMap((event) => event.companyNames ?? [])))
  return <div className="view-stack"><div className="page-intro"><div><span className="eyebrow teal-text">Provider entities</span><h2>Companies in live records.</h2><p>These entities are derived from news and SEC records. Sourced quote cards appear separately; event-to-ticker links and sectors are never inferred or invented.</p></div><div className="intro-count"><strong>{names.length}</strong><span>matched entities</span></div></div><MarketDataPanel snapshot={marketData}/>{names.length ? <div className="company-card-grid live-company-grid">{names.map((name) => { const related = events.filter((event) => event.companyNames?.includes(name)); const providers = Array.from(new Set(related.map((event) => event.provider).filter(Boolean))); return <button className="company-card live-company-card" key={name} onClick={() => onEvent(related[0])}><div className="company-card-top"><span className="company-avatar">{name.slice(0, 2).toUpperCase()}</span><Badge tone="teal">Live match</Badge></div><strong>{name}</strong><span>{providers.join(' · ') || 'Provider-backed record'}</span><div className="company-card-bottom"><div><small>Linked signals</small><b>{related.length}</b></div><div><small>Official records</small><b>{related.filter((event) => event.official).length}</b></div><div><small>Latest source</small><b>{related[0]?.updated ?? 'Retrieved'}</b></div><Icon name="chevron" size={17}/></div></button> })}</div> : <div className="panel empty-state"><div className="empty-icon"><Icon name="briefcase"/></div><strong>No provider-backed entities yet.</strong><p>Refresh News or SEC EDGAR, then return here to inspect matched entities.</p></div>}<section className="method-strip"><div className="method-icon"><Icon name="info" size={17}/></div><div><strong>Live company data boundary</strong><p>This directory shows names and relationships from news and SEC records. Sourced quotes appear separately; event-to-ticker mappings, sectors, and holdings are never inferred or invented.</p></div></section></div>
}

function CompanyView({ selectedCompany, events, onSelect, onBack, onEvent, demoMode, marketData }: { selectedCompany: Company | null; events: RiskEvent[]; onSelect: (company: Company) => void; onBack: () => void; onEvent: (event: RiskEvent) => void; demoMode: boolean; marketData: MarketDataSnapshot | null }) {
  if (!demoMode) return <LiveCompanyDirectory events={events} onEvent={onEvent} marketData={marketData}/>
  if (selectedCompany) return <CompanyProfile company={selectedCompany} events={events} onBack={onBack} onEvent={onEvent}/>
  return <div className="view-stack"><div className="page-intro"><div><span className="eyebrow teal-text">Entity intelligence</span><h2>Companies in the signal graph.</h2><p>Open a demo company to see recent risk events, sentiment movement, and labeled relationship context.</p></div><div className="intro-count"><strong>{COMPANIES.length}</strong><span>demo entities</span></div></div><div className="company-card-grid">{COMPANIES.map((company) => { const companyEvents = events.filter((event) => event.companyIds.includes(company.id)); return <button className="company-card" key={company.id} onClick={() => onSelect(company)}><div className="company-card-top"><span className="company-avatar">{company.ticker.slice(0, 2)}</span><span className={company.change < 0 ? 'down' : 'up'}>{company.change > 0 ? '+' : ''}{company.change.toFixed(1)}%</span></div><strong>{company.name}</strong><span>{company.ticker} · {company.sector}</span><div className="company-card-bottom"><div><small>Demo price</small><b>{fmtPrice(company.price)}</b></div><div><small>Linked signals</small><b>{companyEvents.length}</b></div><Sparkline data={company.sentimentHistory}/><Icon name="chevron" size={17}/></div></button> })}</div><section className="relationship-map panel"><SectionHeader eyebrow="Demo relationship view" title="Connected exposure" action={<Badge tone="demo">Not sourced</Badge>}/><div className="map-flow"><div className="map-node primary"><span className="company-avatar">HL</span><b>HelioForge</b><small>Industrial components</small></div><div className="map-connector"><span>supplier</span><i/><span>customer</span></div><div className="map-node"><span className="company-avatar">NS</span><b>Northstar</b><small>Semiconductors</small></div><div className="map-connector short"><span>logistics</span><i/></div><div className="map-node"><span className="company-avatar">MF</span><b>Meridian</b><small>Logistics</small></div></div></section></div>
}

function ScenarioChart({ contributions }: { contributions: { asset: PortfolioAsset; amount: number }[] }) {
  const max = Math.max(...contributions.map((item) => Math.abs(item.amount)))
  return <div className="contribution-chart">{contributions.map(({ asset, amount }) => <div className="contribution-row" key={asset.id}><div className="contribution-label"><span>{asset.name}</span><small>{asset.type}</small></div><div className="contribution-track"><span className={amount < 0 ? 'negative' : 'positive'} style={{ width: `${Math.max(8, (Math.abs(amount) / max) * 100)}%` }}/></div><strong className={amount < 0 ? 'down' : 'up'}>{amount < 0 ? '-' : '+'}{fmtMoney(Math.abs(amount))}</strong></div>)}</div>
}

function PortfolioStressTest({ selectedEvent, events, onReset }: { selectedEvent: RiskEvent | null; events: RiskEvent[]; onReset: () => void }) {
  const scenarioForEvent = (event: RiskEvent | undefined) => {
    if (!event) return 'rates'
    if (event.category === 'Company Policy / Operational Change') return 'policy'
    if (event.category === 'Supply Chain / Logistics') return 'supply'
    if (event.category === 'Earnings / Guidance') return 'credit'
    return 'rates'
  }
  const [scenarioId, setScenarioId] = useState(selectedEvent ? scenarioForEvent(selectedEvent) : 'rates')
  const [selectedEventId, setSelectedEventId] = useState(selectedEvent?.id ?? '')
  const [severity, setSeverity] = useState(100)
  const [horizon, setHorizon] = useState(2)
  const scenario = SCENARIOS.find((item) => item.id === scenarioId) ?? SCENARIOS[0]
  const detectedEvents = events.filter((event) => event.impact >= 6)
  const assumedShock = scenario.baseShock * severity / 100
  return <div className="view-stack"><div className="page-intro portfolio-intro"><div><span className="eyebrow teal-text">Scenario assumptions</span><h2>Stress assumptions, not unknown holdings.</h2><p>Choose a real provider signal or a stress case and adjust the assumptions. Portfolio results remain unavailable until actual holdings are connected; sample values are never substituted.</p></div><button className="secondary-button" aria-label="Reset portfolio scenario" onClick={() => { onReset(); setSeverity(100); setHorizon(2); setSelectedEventId(''); setScenarioId('rates') }}><Icon name="refresh" size={14}/> Reset scenario</button></div><div className="scenario-layout"><section className="panel scenario-controls"><div className="panel-heading-row"><div><span className="eyebrow">Scenario selector</span><h3>Choose a stress case</h3></div><Badge tone="slate">Assumptions only</Badge></div><label className="detected-event-select"><span>Detected provider signal (optional)</span><select value={selectedEventId} onChange={(event) => { const next = detectedEvents.find((item) => item.id === event.target.value); setSelectedEventId(event.target.value); if (next) setScenarioId(scenarioForEvent(next)) }}><option value="">Choose a provider signal…</option>{detectedEvents.map((event) => <option key={event.id} value={event.id}>{event.headline}</option>)}</select></label><div className="scenario-list">{SCENARIOS.map((item) => <button key={item.id} className={scenarioId === item.id ? 'selected' : ''} onClick={() => { setScenarioId(item.id); setSelectedEventId('') }}><span className={`scenario-icon ${item.accent}`}><Icon name={item.id === 'rates' ? 'pulse' : item.id === 'credit' ? 'shield' : item.id === 'supply' ? 'layers' : 'spark'} size={15}/></span><span><strong>{item.name}</strong><small>{item.description}</small></span><Icon name="chevron" size={15}/></button>)}</div><div className="shock-control"><div><span className="eyebrow">Shock severity</span><strong>{severity}%</strong></div><input aria-label="Shock severity" type="range" min="50" max="150" value={severity} onChange={(event) => setSeverity(Number(event.target.value))}/><div className="range-labels"><span>Contained</span><span>Severe</span></div></div><div className="shock-control duration-control"><div><span className="eyebrow">Duration</span><strong>{horizon} quarter{horizon === 1 ? '' : 's'}</strong></div><input aria-label="Scenario duration" type="range" min="1" max="4" value={horizon} onChange={(event) => setHorizon(Number(event.target.value))}/><div className="range-labels"><span>Short</span><span>Extended</span></div></div><div className="assumption-box"><Icon name="info" size={16}/><div><strong>Current assumption</strong><p>{scenario.description} Base shock {scenario.baseShock.toFixed(1)}%, scaled to {assumedShock.toFixed(1)}% by the selected severity over {horizon} quarter{horizon === 1 ? '' : 's'}. This is a scenario input, not a forecast.</p></div></div></section><section className="panel portfolio-output"><div className="panel-heading-row"><div><span className="eyebrow">Portfolio status</span><h3>No portfolio connected</h3></div><Badge tone="slate">No valuation</Badge></div><div className="live-empty-note"><strong>No holdings were retrieved or connected.</strong><p>SignalScope will not infer investor positions from news, filings, or market prices. This scenario’s inputs remain adjustable, but no before/after portfolio value or exposure estimate is calculated.</p></div></section></div><section className="panel asset-table-panel"><SectionHeader eyebrow="Portfolio data" title="No positions loaded"/><p className="table-note"><Icon name="info" size={14}/> Connect or enter real holdings before calculating portfolio-level outcomes. No sample assets or dollar values are shown.</p></section></div>
}
function EvaluationView() {
  const evaluated = EVALUATION_CASES.map((item) => { const prediction = demoTextPrediction(item.excerpt); return { ...item, demoSentiment: sentimentLabel(prediction.sentiment), demoCategory: prediction.category } })
  const sentimentAccuracy = Math.round((evaluated.filter((item) => item.expectedSentiment === item.demoSentiment).length / evaluated.length) * 100)
  const categoryAccuracy = Math.round((evaluated.filter((item) => item.expectedCategory === item.demoCategory).length / evaluated.length) * 100)
  return <section className="panel evaluation-panel"><SectionHeader eyebrow="Local labeled examples" title="Demo evaluation" action={<Badge tone="demo">Illustrative sample</Badge>}/><p className="evaluation-intro">A small displayed set of fictional examples. Accuracy is computed only from these labels; it is not a benchmark or proof of real-world performance.</p><div className="evaluation-metrics"><div><strong>{sentimentAccuracy}%</strong><span>Sentiment match</span></div><div><strong>{categoryAccuracy}%</strong><span>Category match</span></div><div><strong>{evaluated.length}</strong><span>Example texts</span></div></div><div className="evaluation-list">{evaluated.map((item) => <div className="evaluation-row" key={item.id}><p>“{item.excerpt}”</p><div><span className="eval-label">Expected</span><Badge tone={sourceTone(item.expectedSentiment)}>{item.expectedSentiment}</Badge><Badge tone="slate">{item.expectedCategory}</Badge></div><div><span className="eval-label">Demo output</span><Badge tone={sourceTone(item.demoSentiment)}>{item.demoSentiment}</Badge><Badge tone="teal">{item.demoCategory}</Badge></div></div>)}</div></section>
}

function WalkthroughPanel() {
  return <section className="panel walkthrough-panel"><SectionHeader eyebrow="Presentation guide · under 5 minutes" title="Demo walkthrough" action={<Badge tone="slate">5 steps</Badge>}/><div className="walkthrough-steps">{['Start on Overview and name the four fictional demo signals.', 'Open the supplier policy event to show evidence, source quality, and score explanations.', 'Paste a short company announcement or transcript excerpt and point out the Demo analysis label.', 'Open Portfolio Stress Test, choose Company policy / operational change, and adjust severity.', 'Close with Methodology: local demo only, future providers can be connected later.'].map((step, index) => <div key={step}><span>0{index + 1}</span><p>{step}</p></div>)}</div><div className="submission-goals"><strong>Submission goals</strong><span>Risk engine outputs sentiment, event category, impact, and confidence.</span><span>Downstream use case: portfolio stress testing.</span><span>Future handoff: public code repository and presentation of no more than seven slides.</span></div></section>
}

function MethodologyView() {
  const [expanded, setExpanded] = useState(0)
  const notes = [
    { title: 'Source facts stay separate', body: 'News and SEC records retain their original source links and available publication/filing and retrieval timestamps. Yahoo Finance quotes retain a provider quote timestamp and a separate SignalScope retrieval time.' },
    { title: 'Risk fields are model analysis', body: 'Sentiment, event category, impact, confidence, and rationale are model-generated from retrieved content. They are not reported facts, price forecasts, or guarantees.' },
    { title: 'Evidence coverage has limits', body: 'SEC records in this build use official filing metadata and accession links; filing text is not retrieved. Metadata-only evidence can result in low confidence or an Insufficient evidence conclusion.' },
    { title: 'Market quote freshness', body: 'Prices represent the provider-returned regular-market observation and may be delayed or older than retrieval time. This is not a streaming feed, brokerage link, or execution service.' },
    { title: 'Missing data is never filled with samples', body: 'Unconfigured credentials, provider errors, successful empty results, partial responses, and stale snapshots are shown as separate states. Fictional records are not used as fallbacks.' }
  ]
  return <div className="view-stack"><div className="page-intro"><div><span className="eyebrow teal-text">Trust & transparency</span><h2>Make the reasoning inspectable.</h2><p>SignalScope shows provider-backed news, official SEC filing metadata, and market quotes in a single Live workspace. Source facts remain distinct from model analysis.</p></div><Badge tone="teal" icon="shield">Live data methodology</Badge></div><div className="methodology-hero"><div className="methodology-hero-icon"><Icon name="spark" size={22}/></div><div><span className="eyebrow">The short version</span><h3>Signal = language + event + evidence</h3><p>Every risk score is an estimate based on retrieved content and imperfect evidence. The app shows source facts, model analysis, and provider limitations separately.</p></div><div className="formula"><span>content</span><i>+</i><span>event</span><i>×</i><span>evidence</span></div></div><div className="methodology-grid"><section className="panel accordion-panel"><SectionHeader eyebrow="Scoring and data notes" title="How SignalScope works"/><div className="accordion-list">{notes.map((item, index) => <div className={`accordion-item ${expanded === index ? 'expanded' : ''}`} key={item.title}><button onClick={() => setExpanded(expanded === index ? -1 : index)}><span className="accordion-index">0{index + 1}</span><strong>{item.title}</strong><Icon name="chevron" size={16}/></button>{expanded === index && <p>{item.body}</p>}</div>)}</div></section><section className="panel source-guide"><SectionHeader eyebrow="Connected source types" title="Source facts are not scores"/><div className="hierarchy"><div><span className="hierarchy-bar official"/><div><strong>Official filings</strong><p>SEC EDGAR submissions and filing metadata are linked to the issuer’s official record.</p></div></div><div><span className="hierarchy-bar reported"/><div><strong>Reported news</strong><p>News article metadata and permitted excerpts provide secondary company context.</p></div></div><div><span className="hierarchy-bar reported"/><div><strong>Market observations</strong><p>Yahoo Finance prices are source facts with their own quote time, not event evidence or forecasts.</p></div></div></div><p className="factor-note">Sentiment, category, impact, confidence, and explanation are model analysis based on retrieved content. No score guarantees an outcome or predicts a future market price.</p><div className="method-callout"><Icon name="shield" size={16}/><p><strong>Review the linked sources.</strong> A risk signal can be wrong if evidence is incomplete, stale, or misinterpreted.</p></div></section></div><section className="review-banner"><div><span className="eyebrow">Human review checkpoint</span><h3>Use signals to ask better questions, not to outsource judgment.</h3></div><p>SignalScope is decision support, not investment advice. Market data may be delayed; filings may be metadata-only. Use the source links to verify context before acting.</p></section></div>
}
export default function App() {
  const [view, setView] = useState<NavKey>('overview')
  const [query, setQuery] = useState('')
  const [liveEvents, setLiveEvents] = useState<RiskEvent[]>([])
  const [marketData, setMarketData] = useState<MarketDataSnapshot | null>(null)
  const [alphaHistory, setAlphaHistory] = useState<AlphaVantageSnapshot | null>(null)
  const startupProviderRefreshStarted = useRef(false)
  const demoMode = false
  const [selectedEvent, setSelectedEvent] = useState<RiskEvent | null>(null)
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [portfolioEvent, setPortfolioEvent] = useState<RiskEvent | null>(null)
  const [mobileNav, setMobileNav] = useState(false)
  const mobileNavPanelRef = useRef<HTMLDivElement>(null)
  const mobileMenuTriggerRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!mobileNav) return
    const trigger = mobileMenuTriggerRef.current
    mobileNavPanelRef.current?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMobileNav(false); return }
      if (event.key !== 'Tab') return
      const focusable = Array.from(mobileNavPanelRef.current?.querySelectorAll<HTMLElement>('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? []).filter((element) => !element.hasAttribute('disabled'))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('keydown', handleKey); trigger?.focus() }
  }, [mobileNav])
  const visibleEvents = liveEvents
  const activeEventCount = useMemo(() => visibleEvents.length, [visibleEvents])
  const goTo = (nextView: NavKey) => { setView(nextView); setSelectedEvent(null); if (nextView !== 'portfolio') setPortfolioEvent(null); if (nextView !== 'companies') setSelectedCompany(null); setMobileNav(false) }
  const handleCompany = (company: Company) => { setSelectedEvent(null); setSelectedCompany(company); setView('companies') }
  const handleEvent = (event: RiskEvent) => { setSelectedCompany(null); setSelectedEvent(event) }
  const handleGlobalQuery = (value: string) => { setQuery(value); if (value.trim() && view !== 'events') { setView('events'); setSelectedEvent(null); setSelectedCompany(null); setPortfolioEvent(null) } }
  return <div className="app-shell"><Sidebar view={view} setView={goTo} eventCount={visibleEvents.length}/>{mobileNav && <div id="mobile-navigation" role="dialog" aria-label="SignalScope navigation" className="mobile-nav-overlay" onClick={() => setMobileNav(false)}><div className="mobile-nav-panel" onClick={(event) => event.stopPropagation()}><div className="mobile-nav-head"><BrandMark/><button className="icon-button" onClick={() => setMobileNav(false)} aria-label="Close navigation menu"><Icon name="close"/></button></div>{NAV_ITEMS.map((item) => <button className={view === item.key ? 'active' : ''} key={item.key} onClick={() => goTo(item.key)}><Icon name={item.icon}/>{item.label}</button>)}</div></div>}<main className="main-content"><Topbar view={view} query={query} setQuery={handleGlobalQuery} onMenu={() => setMobileNav(true)} mobileNavOpen={mobileNav} menuButtonRef={mobileMenuTriggerRef}/><div className="content-wrap">{view === 'overview' && <Overview events={visibleEvents} onSelect={handleEvent} onAll={() => goTo('events')} demoMode={demoMode} onLiveEvents={setLiveEvents} marketData={marketData} onMarketData={setMarketData} alphaHistory={alphaHistory} onAlphaHistory={setAlphaHistory} autoRefresh={!startupProviderRefreshStarted.current} onAutoRefreshStarted={() => { startupProviderRefreshStarted.current = true }}/>} {view === 'events' && <EventsView events={visibleEvents} query={query} setQuery={setQuery} onSelect={handleEvent}/>} {view === 'companies' && <CompanyView selectedCompany={selectedCompany} events={visibleEvents} onSelect={setSelectedCompany} onBack={() => setSelectedCompany(null)} onEvent={handleEvent} demoMode={demoMode} marketData={marketData}/>} {view === 'portfolio' && <PortfolioStressTest selectedEvent={portfolioEvent} events={visibleEvents} onReset={() => { setSelectedEvent(null); setPortfolioEvent(null) }}/>} {view === 'methodology' && <MethodologyView/>}<footer className="app-footer"><span>{demoMode ? 'SignalScope is a demo workspace · All companies, prices, events, and portfolio values are fictional.' : 'Live records show source links and timestamps · no sample records or unconnected portfolio values are displayed.'}</span><span>Built for explainability <Icon name="arrow" size={13}/></span></footer></div></main>{selectedEvent && <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} onCompany={handleCompany} onStress={() => { setPortfolioEvent(selectedEvent); setView('portfolio'); setSelectedEvent(null) }} demoStep={0}/>}<div className="sr-only">{activeEventCount} active signals</div></div>
}
