export type NavKey = 'overview' | 'events' | 'companies' | 'portfolio' | 'methodology'
export type SourceType = 'News' | 'Company Filing' | 'Video Transcript' | 'Social' | 'Demo Analysis'
export type Reliability = 'Official' | 'Reported' | 'Unverified' | 'Unverified demo input' | 'Demo'
export type SentimentLabel = 'Negative' | 'Neutral' | 'Positive'
export type DataOrigin = 'demo' | 'live'
export type ProviderStatus = 'connected' | 'ready' | 'empty' | 'not_configured' | 'error' | 'rate_limited' | 'partial' | 'stale' | 'unavailable'

export interface DataConnection {
  id: string
  name: string
  provider: string
  status: ProviderStatus
  coverage: string
  lastSuccessfulRetrieval?: string
  setupRequired?: string
  detail: string
  recordCount?: number
}

export interface MarketQuote {
  symbol: string
  issuerName: string
  currency: string
  exchange?: string
  price: number
  previousClose?: number
  changeAmount?: number
  changePercent?: number
  asOf: string
  retrievedAt: string
  sourceName: string
  sourceUrl: string
  stale?: boolean
}

export interface MarketDataSnapshot {
  connection: DataConnection
  quotes: MarketQuote[]
  retrievedAt: string
}

export interface MarketHistoryBar {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  sma20?: number
  sma50?: number
}

export interface AlphaVantageSeries {
  symbol: string
  issuerName: string
  observations: MarketHistoryBar[]
  retrievedAt: string
  sourceName: string
  sourceUrl: string
  stale?: boolean
}

export interface AlphaVantageSnapshot {
  connection: DataConnection
  series: AlphaVantageSeries[]
  retrievedAt: string
}

export interface SourceFact {
  label: string
  value: string
}

export interface Company {
  id: string
  name: string
  ticker: string
  sector: string
  price: number
  change: number
  description: string
  relationships: { name: string; relation: 'Supplier' | 'Customer' | 'Partner'; note: string }[]
  sentimentHistory: number[]
}

export interface Evidence {
  id: string
  title: string
  sourceName: string
  sourceType: SourceType
  reliability: Reliability
  publishedAt: string
  timestampLabel?: string
  url: string
  excerpt: string
  timestamp?: string
  sentiment?: number
  excerptKind?: 'source_excerpt' | 'metadata_note'
}

export interface TimelineItem {
  time: string
  label: string
  detail: string
  sourceType: SourceType
}

export interface RiskEvent {
  id: string
  headline: string
  summary: string
  explanation: string
  category: string
  sentiment: number
  impact: number
  confidence: number
  firstSeen: string
  updated: string
  sourceCount: number
  sourceTypes: SourceType[]
  reliability: Reliability
  companyIds: string[]
  companyNames?: string[]
  origin?: DataOrigin
  stale?: boolean
  provider?: string
  official?: boolean
  publishedAt?: string
  retrievedAt?: string
  textAvailability?: 'full_text' | 'excerpt' | 'metadata_only'
  sourceFacts?: SourceFact[]
  evidence: Evidence[]
  timeline: TimelineItem[]
  limitedEvidence?: boolean
  sourcesDisagree?: boolean
  whatCouldChange: string[]
}

export interface PortfolioAsset {
  id: string
  name: string
  type: 'Loan' | 'Bond' | 'Equity' | 'Derivative'
  value: number
  sector: string
  exposure: string
  sensitivity: number
}

export interface Scenario {
  id: string
  name: string
  description: string
  baseShock: number
  duration: string
  accent: string
  effects: Record<PortfolioAsset['type'], number>
}
