import type { Company, PortfolioAsset, RiskEvent, Scenario } from './types'

export const DEMO_DATE = '08 Oct 2026'

export const COMPANIES: Company[] = [
  {
    id: 'helioforge', name: 'HelioForge Manufacturing', ticker: 'HLF', sector: 'Industrial components', price: 184.62, change: -1.8,
    description: 'A fictional precision-components manufacturer with a concentrated supplier network across the Pacific corridor.',
    relationships: [
      { name: 'Kestrel Materials', relation: 'Supplier', note: 'Specialty alloy supplier; demo relationship' },
      { name: 'Orion Rail Systems', relation: 'Customer', note: 'North American rail customer; demo relationship' },
      { name: 'Meridian Freight', relation: 'Partner', note: 'Regional logistics partner; demo relationship' }
    ], sentimentHistory: [0.28, 0.18, 0.12, -0.05, -0.18, -0.22, -0.16, -0.3]
  },
  {
    id: 'northstar', name: 'Northstar Semiconductors', ticker: 'NSS', sector: 'Semiconductors', price: 92.14, change: 0.6,
    description: 'A fictional chip designer exposed to enterprise hardware demand and higher financing costs.',
    relationships: [
      { name: 'HelioForge Manufacturing', relation: 'Customer', note: 'Industrial electronics customer; demo relationship' },
      { name: 'BlueHarbor Bank', relation: 'Partner', note: 'Working capital facility; demo relationship' }
    ], sentimentHistory: [0.12, 0.2, 0.14, 0.05, 0.1, 0.18, 0.08, -0.02]
  },
  {
    id: 'blueharbor', name: 'BlueHarbor Bank', ticker: 'BHB', sector: 'Financial services', price: 47.88, change: -0.4,
    description: 'A fictional regional lender with a diversified middle-market loan book.',
    relationships: [
      { name: 'Northstar Semiconductors', relation: 'Customer', note: 'Revolving credit facility; demo relationship' },
      { name: 'Meridian Freight', relation: 'Customer', note: 'Equipment finance borrower; demo relationship' }
    ], sentimentHistory: [0.08, 0.02, -0.05, 0.06, 0.02, -0.08, -0.12, -0.1]
  },
  {
    id: 'meridian', name: 'Meridian Freight', ticker: 'MFD', sector: 'Logistics', price: 61.05, change: -2.7,
    description: 'A fictional port-to-warehouse operator serving manufacturers across the western seaboard.',
    relationships: [
      { name: 'HelioForge Manufacturing', relation: 'Partner', note: 'Inbound logistics partner; demo relationship' },
      { name: 'BlueHarbor Bank', relation: 'Customer', note: 'Fleet finance customer; demo relationship' }
    ], sentimentHistory: [0.2, 0.24, 0.1, 0.02, -0.12, -0.2, -0.28, -0.36]
  }
]

export const EVENTS: RiskEvent[] = [
  {
    id: 'supplier-policy',
    headline: 'HelioForge tightens supplier traceability policy',
    summary: 'A new supplier certification rule may slow onboarding and create near-term delivery friction for specialty components.',
    explanation: 'HelioForge says new traceability requirements will apply to tier-two alloy suppliers. The policy is intended to improve resilience, but the transition could lengthen lead times while vendors document origin and labor practices.',
    category: 'Company Policy / Operational Change', sentiment: -0.34, impact: 8, confidence: 0.82,
    firstSeen: '07 Oct · 09:12', updated: '2h ago', sourceCount: 4, sourceTypes: ['Company Filing', 'News', 'Social'], reliability: 'Official', companyIds: ['helioforge', 'meridian'],
    limitedEvidence: false, sourcesDisagree: true,
    whatCouldChange: ['HelioForge publishes a transition timeline with supplier-level milestones.', 'Kestrel Materials receives certification without a production delay.', 'The next two weeks of delivery data shows no change in lead times.'],
    evidence: [
      { id: 'sp-1', title: 'Supplier standards update', sourceName: 'HelioForge investor relations', sourceType: 'Company Filing', reliability: 'Official', publishedAt: '07 Oct · 09:12', url: 'https://example.com/demo/helioforge-policy', excerpt: 'The updated supplier standard introduces documentation requirements for traceability, safety, and origin verification.' },
      { id: 'sp-2', title: 'Manufacturers rethink tier-two visibility', sourceName: 'Industry Ledger', sourceType: 'News', reliability: 'Reported', publishedAt: '07 Oct · 13:40', url: 'https://example.com/demo/industry-ledger', excerpt: 'Procurement teams expect a staged rollout, but smaller alloy vendors may need additional time to comply.' },
      { id: 'sp-3', title: 'Policy could hit Q4 schedules', sourceName: 'MarketBrief video desk', sourceType: 'Video Transcript', reliability: 'Reported', publishedAt: '08 Oct · 08:10', url: 'https://example.com/demo/video-policy', excerpt: 'The policy is constructive over a longer horizon, though the first checkpoint is likely to be operational rather than financial.', timestamp: '03:18' },
      { id: 'sp-4', title: 'Unverified supplier chatter', sourceName: 'Social post sample', sourceType: 'Social', reliability: 'Unverified', publishedAt: '08 Oct · 08:52', url: 'https://example.com/demo/social-policy', excerpt: 'An unverified post claims a line stoppage; no corroborating production notice is available.' }
    ],
    timeline: [
      { time: '07 Oct · 09:12', label: 'Official filing', detail: 'Supplier standards update posted to investor relations.', sourceType: 'Company Filing' },
      { time: '07 Oct · 13:40', label: 'Independent report', detail: 'Industry Ledger adds vendor transition context.', sourceType: 'News' },
      { time: '08 Oct · 08:10', label: 'Video analysis', detail: 'MarketBrief discusses implementation risk.', sourceType: 'Video Transcript' },
      { time: '08 Oct · 08:52', label: 'Unverified mention', detail: 'Social chatter adds a line-stop claim without evidence.', sourceType: 'Social' }
    ]
  },
  {
    id: 'rates-signal',
    headline: 'Central bank signals a higher-for-longer path',
    summary: 'Policy language points to one additional rate increase if inflation progress stalls, raising duration and refinancing sensitivity.',
    explanation: 'The central bank did not announce a rate change today. Its language makes a future increase more plausible if inflation remains sticky, which could pressure rate-sensitive assets and borrowers.',
    category: 'Macro / Monetary Policy', sentiment: -0.21, impact: 7, confidence: 0.76,
    firstSeen: '06 Oct · 14:30', updated: '1d ago', sourceCount: 6, sourceTypes: ['News', 'Video Transcript'], reliability: 'Reported', companyIds: ['northstar', 'blueharbor'],
    limitedEvidence: false, sourcesDisagree: false,
    whatCouldChange: ['The next inflation print continues to cool.', 'Policy makers remove the conditional increase language.', 'Credit spreads remain stable through the next refinancing window.'],
    evidence: [
      { id: 'rs-1', title: 'Policy statement excerpt', sourceName: 'MacroWire', sourceType: 'News', reliability: 'Reported', publishedAt: '06 Oct · 14:30', url: 'https://example.com/demo/macro-wire', excerpt: 'Participants remain prepared to adjust the policy rate if progress toward the target slows.' },
      { id: 'rs-2', title: 'Rates desk briefing', sourceName: 'Northline Research', sourceType: 'Video Transcript', reliability: 'Reported', publishedAt: '06 Oct · 16:05', url: 'https://example.com/demo/rates-video', excerpt: 'The signal is conditional, but the distribution of outcomes has shifted toward a longer restrictive period.', timestamp: '07:44' }
    ],
    timeline: [
      { time: '06 Oct · 14:30', label: 'Policy statement', detail: 'Conditional language adds rate sensitivity to the outlook.', sourceType: 'News' },
      { time: '06 Oct · 16:05', label: 'Video briefing', detail: 'Northline Research explains the market transmission channels.', sourceType: 'Video Transcript' }
    ]
  },
  {
    id: 'guidance-cut',
    headline: 'Northstar revises full-year guidance range',
    summary: 'Management lowered its revenue range as enterprise customers defer two large hardware programs.',
    explanation: 'Northstar cites customer timing rather than cancellations. The change is company-specific, but it may matter for suppliers and lenders if the deferrals extend into the next planning cycle.',
    category: 'Earnings / Guidance', sentiment: -0.52, impact: 6, confidence: 0.91,
    firstSeen: '05 Oct · 07:00', updated: '3d ago', sourceCount: 3, sourceTypes: ['Company Filing', 'News'], reliability: 'Official', companyIds: ['northstar', 'helioforge', 'blueharbor'],
    limitedEvidence: false, sourcesDisagree: false,
    whatCouldChange: ['The next customer shipment schedule confirms timing rather than cancellation.', 'Northstar restores the midpoint of its original guidance range.', 'Supplier order rates normalize in the next channel check.'],
    evidence: [
      { id: 'gc-1', title: 'Quarterly update', sourceName: 'Northstar investor relations', sourceType: 'Company Filing', reliability: 'Official', publishedAt: '05 Oct · 07:00', url: 'https://example.com/demo/northstar-filing', excerpt: 'Two enterprise programs moved to the right, reducing expected second-half revenue by approximately 4% at the midpoint.' },
      { id: 'gc-2', title: 'Chip demand reset', sourceName: 'Signal Daily', sourceType: 'News', reliability: 'Reported', publishedAt: '05 Oct · 11:22', url: 'https://example.com/demo/signal-daily', excerpt: 'Channel checks suggest the pause is concentrated among large enterprise buyers rather than broad-based demand destruction.' }
    ],
    timeline: [
      { time: '05 Oct · 07:00', label: 'Official filing', detail: 'Guidance range revised with customer timing commentary.', sourceType: 'Company Filing' },
      { time: '05 Oct · 11:22', label: 'Independent report', detail: 'Signal Daily summarizes channel checks.', sourceType: 'News' }
    ]
  },
  {
    id: 'shipping-disruption',
    headline: 'Regional shipping disruption adds two-week delivery variance',
    summary: 'A video briefing describes congestion and rerouting risk across the western seaboard, with knock-on effects for industrial shippers.',
    explanation: 'This is an early signal based on a video transcript and one corroborating news item. It may pressure freight costs and delivery predictability, but the scale and duration of the disruption remain uncertain.',
    category: 'Supply Chain / Logistics', sentiment: -0.63, impact: 8, confidence: 0.64,
    firstSeen: '08 Oct · 06:45', updated: '4h ago', sourceCount: 2, sourceTypes: ['Video Transcript', 'News'], reliability: 'Reported', companyIds: ['meridian', 'helioforge'],
    limitedEvidence: true, sourcesDisagree: false,
    whatCouldChange: ['Port throughput returns to the seven-day average.', 'Carriers publish a reliable rerouting schedule.', 'HelioForge confirms no material component delays.'],
    evidence: [
      { id: 'sd-1', title: 'Western corridor disruption explained', sourceName: 'Freightline Briefing', sourceType: 'Video Transcript', reliability: 'Reported', publishedAt: '08 Oct · 06:45', url: 'https://example.com/demo/freightline-video', excerpt: 'Operators are adding buffer days while berth availability remains uneven across the corridor.', timestamp: '01:42' },
      { id: 'sd-2', title: 'Port operators extend appointment windows', sourceName: 'Harbor Notes', sourceType: 'News', reliability: 'Reported', publishedAt: '08 Oct · 10:20', url: 'https://example.com/demo/harbor-notes', excerpt: 'The operational impact is visible in appointment windows, though there is no evidence of a broad shutdown.' }
    ],
    timeline: [
      { time: '08 Oct · 06:45', label: 'Video published', detail: 'Freightline Briefing flags corridor congestion.', sourceType: 'Video Transcript' },
      { time: '08 Oct · 10:20', label: 'News corroboration', detail: 'Harbor Notes reports wider appointment windows.', sourceType: 'News' }
    ]
  }
]

export const TREND_DATA = [
  { label: '02 Oct', value: 38 }, { label: '03 Oct', value: 42 }, { label: '04 Oct', value: 36 }, { label: '05 Oct', value: 55 }, { label: '06 Oct', value: 49 }, { label: '07 Oct', value: 68 }, { label: '08 Oct', value: 74 }
]

export const SOURCE_MIX = [
  { label: 'Written news', value: 46, count: 18, color: 'teal' },
  { label: 'Company announcements', value: 31, count: 12, color: 'navy' },
  { label: 'Video transcripts', value: 16, count: 6, color: 'amber' },
  { label: 'Social posts', value: 7, count: 3, color: 'slate' }
]

export const PORTFOLIO_ASSETS: PortfolioAsset[] = [
  { id: 'hlf-loan', name: 'HelioForge revolving facility', type: 'Loan', value: 680000, sector: 'Industrials', exposure: 'Delivery + covenant risk', sensitivity: 0.42 },
  { id: 'nss-bond', name: 'Northstar 2029 notes', type: 'Bond', value: 520000, sector: 'Semiconductors', exposure: 'Duration + spread', sensitivity: 0.56 },
  { id: 'bhb-equity', name: 'BlueHarbor common equity', type: 'Equity', value: 410000, sector: 'Financials', exposure: 'Credit cycle', sensitivity: 0.38 },
  { id: 'mfd-equity', name: 'Meridian Freight equity', type: 'Equity', value: 275000, sector: 'Logistics', exposure: 'Throughput + fuel', sensitivity: 0.64 },
  { id: 'rate-swap', name: 'Receive-fixed rate swap', type: 'Derivative', value: 210000, sector: 'Rates', exposure: 'Curve + mark-to-market', sensitivity: 0.74 },
  { id: 'muni-bond', name: 'Regional infrastructure bond', type: 'Bond', value: 355000, sector: 'Public finance', exposure: 'Spread + liquidity', sensitivity: 0.28 }
]

export const SCENARIOS: Scenario[] = [
  { id: 'rates', name: 'Interest rates rise', description: 'A parallel rate shock pressures duration, financing costs, and rate-sensitive exposures.', baseShock: 3.2, duration: '6–12 months', accent: 'amber', effects: { Loan: -0.34, Bond: -0.72, Equity: -0.42, Derivative: 0.58 } },
  { id: 'geopolitical', name: 'Geopolitical disruption', description: 'A regional disruption widens risk premia and slows cross-border activity.', baseShock: 4.1, duration: '3–9 months', accent: 'rose', effects: { Loan: -0.48, Bond: -0.38, Equity: -0.66, Derivative: 0.22 } },
  { id: 'credit', name: 'Credit downgrade', description: 'A borrower downgrade widens spreads and increases expected loss on credit exposures.', baseShock: 5.4, duration: '12–18 months', accent: 'rose', effects: { Loan: -0.82, Bond: -0.64, Equity: -0.44, Derivative: -0.18 } },
  { id: 'supply', name: 'Supply chain interruption', description: 'Longer lead times and higher freight costs put pressure on industrial and logistics names.', baseShock: 4.8, duration: '1–2 quarters', accent: 'teal', effects: { Loan: -0.52, Bond: -0.36, Equity: -0.78, Derivative: -0.12 } },
  { id: 'policy', name: 'Company policy / operational change', description: 'A supplier or operating-policy change creates temporary execution friction before benefits compound.', baseShock: 2.8, duration: '1–2 quarters', accent: 'teal', effects: { Loan: -0.46, Bond: -0.28, Equity: -0.6, Derivative: -0.06 } }
]

export const METHODOLOGY = [
  { title: 'Sentiment is directional language', body: 'Sentiment estimates whether the language around an event is positive, negative, or neutral. It describes the tone of the evidence, not a promised market outcome.' },
  { title: 'Impact is potential severity', body: 'Impact is a 1–10 estimate of how broadly an event could matter across operations, financing, customers, or suppliers. It is not an exact stock-price movement.' },
  { title: 'Confidence follows evidence quality', body: 'Confidence reflects how much independent evidence exists and how reliable those sources are. Official filings and direct company announcements carry more weight than unverified social posts.' },
  { title: 'Duplicates are grouped', body: 'Multiple reports about the same event are clustered into one signal to reduce duplicate counting. A source count is not the same as a source-quality score.' },
  { title: 'A human stays in the loop', body: 'Signals can be wrong, incomplete, or stale. Review the source excerpts and what-could-change conditions before using a signal in an actual decision.' }
]


export const EVALUATION_CASES = [
  { id: 'eval-1', excerpt: 'HelioForge will require tier-two suppliers to submit traceability certificates before the next delivery cycle.', expectedSentiment: 'Negative', demoSentiment: 'Negative', expectedCategory: 'Company Policy / Operational Change', demoCategory: 'Company Policy / Operational Change' },
  { id: 'eval-2', excerpt: 'Northstar restored the midpoint of its guidance after two enterprise programs returned to schedule.', expectedSentiment: 'Positive', demoSentiment: 'Positive', expectedCategory: 'Earnings / Guidance', demoCategory: 'Earnings / Guidance' },
  { id: 'eval-3', excerpt: 'A policy maker kept rates unchanged and said future decisions will depend on incoming data.', expectedSentiment: 'Neutral', demoSentiment: 'Neutral', expectedCategory: 'Macro / Monetary Policy', demoCategory: 'Macro / Monetary Policy' },
  { id: 'eval-4', excerpt: 'Unverified social chatter says a port is delayed, but no operator notice has been published.', expectedSentiment: 'Negative', demoSentiment: 'Negative', expectedCategory: 'Supply Chain / Logistics', demoCategory: 'Supply Chain / Logistics' }
]
