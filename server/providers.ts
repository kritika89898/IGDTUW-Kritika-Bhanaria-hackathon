import { createHash } from 'node:crypto'
import type { DataConnection, Evidence, MarketDataSnapshot, Reliability, RiskEvent, SourceFact, SourceType } from '../src/types.ts'
import { getMarketDataSnapshot, refreshMarketData } from './marketData.ts'
import { getAlphaVantageSnapshot, refreshAlphaVantage } from './alphaVantage.ts'

type ProviderRecord = {
  id: string
  headline: string
  sourceName: string
  publishedAt: string
  retrievedAt: string
  url: string
  excerpt: string
  sourceType: SourceType
  official: boolean
  provider: string
  textAvailability: 'full_text' | 'excerpt' | 'metadata_only'
  companyNames: string[]
  stale?: boolean
  sourceTimestampLabel?: string
  sourceFacts?: SourceFact[]
  filingType?: string
  issuer?: string
  cik?: string
  accession?: string
}

type ProviderSnapshot = {
  connections: DataConnection[]
  events: RiskEvent[]
  records: ProviderRecord[]
  marketData: MarketDataSnapshot
  alphaHistory: import('../src/types.ts').AlphaVantageSnapshot
  retrievedAt: string
}

const nowIso = () => new Date().toISOString()
const validDate = (value: unknown, fallback: string) => {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback
}
const displayTime = (value: string) => {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(new Date(parsed)) + ' UTC' : 'Time unavailable'
}
const safeText = (value: unknown, fallback = '') => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : fallback
const gdeltTimestamp = (value: unknown) => {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(safeText(value))
  return match ? validDate(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`, '') : ''
}
const normalizeGdeltDomain = (value: unknown) => {
  const domain = safeText(value).toLowerCase().replace(/\.$/, '')
  if (!domain || domain.length > 253) return ''
  const labels = domain.split('.')
  if (labels.length < 2 || labels.some((label) => label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return ''
  return domain
}
const normalizeGdeltLanguage = (value: unknown) => {
  const language = safeText(value)
  return /^(?:english|eng|en)$/i.test(language) ? language : ''
}
const isValidSecUserAgent = (value: unknown) => { const text = safeText(value); return text.length >= 12 && /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text) }
const unique = <T,>(items: T[]) => Array.from(new Set(items))
const canonicalCompany = (name: string) => name.replace(/,?\s+(inc\.?|corp\.?|corporation|ltd\.?|plc|co\.?)$/i, '').trim()
const companyMatches = (text: string) => unique(Object.entries(liveEntityAliases).filter(([, aliases]) => aliases.some((alias) => new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\\\]/g, '\\\\$&')}\\b`, 'i').test(text))).map(([canonical]) => canonicalCompany(canonical)))
const normalizeProviderCompany = (name: string) => companyMatches(name)[0] ?? canonicalCompany(name)
const providerEntityMatches = (text: string, configuredEntities: string[]) => unique([...companyMatches(text), ...configuredEntities.filter((entity) => entity && new RegExp(`\\b${canonicalCompany(entity).replace(/[.*+?^${}()|[\]\\\\]/g, '\\\\$&')}\\b`, 'i').test(text)).map(normalizeProviderCompany)])

const connectionBase = (overrides: DataConnection): DataConnection => overrides

const newsConnection = (status: DataConnection['status'], detail: string, lastSuccessfulRetrieval?: string): DataConnection => connectionBase({
  id: 'newsapi', name: 'Live news', provider: 'NewsAPI-compatible', coverage: 'English company-specific material news; consumer promotions and explicit investor-solicitation notices are excluded; article metadata plus excerpt where permitted', status, detail, lastSuccessfulRetrieval,
  setupRequired: status === 'not_configured' ? 'Set NEWS_API_KEY in the server environment using a NewsAPI-compatible provider account.' : undefined
})

const filingsConnection = (status: DataConnection['status'], detail: string, lastSuccessfulRetrieval?: string): DataConnection => connectionBase({
  id: 'sec-edgar', name: 'Official filings', provider: 'SEC EDGAR', coverage: 'US-listed issuers; default coverage: Apple, Microsoft, and Alphabet recent submissions', status, detail, lastSuccessfulRetrieval,
  setupRequired: status === 'not_configured' ? 'Set SEC_USER_AGENT in the server environment with a descriptive app name and your real contact email.' : status === 'error' ? 'Check outbound access and SEC fair-access User-Agent configuration.' : undefined
})

const gdeltConnection = (status: DataConnection['status'], detail: string, lastSuccessfulRetrieval?: string, recordCount?: number): DataConnection => connectionBase({
  id: 'gdelt', name: 'Global news', provider: 'GDELT DOC 2.0', coverage: 'English-language online news matching tracked issuers and material business context within the last seven days; article title and metadata only, not social-media posts or full text', status, detail, lastSuccessfulRetrieval, recordCount
})

async function requestJson(url: string, headers: Record<string, string>, timeoutMs = 12000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { headers, signal: controller.signal })
    const body = await response.text()
    if (!response.ok) {
      const error = new Error(`Provider returned HTTP ${response.status}`) as Error & { status?: number; retryAfter?: string }
      error.status = response.status
      error.retryAfter = response.headers.get('retry-after') ?? undefined
      throw error
    }
    let parsed: unknown
    try { parsed = JSON.parse(body) } catch {
      const error = new Error('Provider returned malformed JSON') as Error & { status?: number }
      error.status = 502
      throw error
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      const error = new Error('Provider returned an invalid response shape') as Error & { status?: number }
      error.status = 502
      throw error
    }
    return parsed as Record<string, any>
  } finally { clearTimeout(timeout) }
}

const liveEntityAliases: Record<string, string[]> = {
  'Apple Inc.': ['apple', 'apple inc'],
  'Microsoft Corporation': ['microsoft', 'microsoft corp'],
  'Alphabet Inc.': ['alphabet', 'google'],
  'Amazon.com, Inc.': ['amazon', 'amazon.com'],
  'NVIDIA Corporation': ['nvidia'],
  'Tesla, Inc.': ['tesla'],
  'Meta Platforms, Inc.': ['meta platforms', 'facebook'],
  'Boeing Company': ['boeing'],
  'Intel Corporation': ['intel'],
  'Adani Enterprises': ['adani enterprises', 'adani']
}
const defaultTrackedEntities = ['Apple Inc.', 'Microsoft Corporation', 'Alphabet Inc.']
const trackedEntitiesFromEnvironment = () => {
  const configured = process.env.NEWS_COMPANIES?.split(',').map((value) => safeText(value)).filter(Boolean).slice(0, 20)
  return configured?.length ? configured : defaultTrackedEntities
}
const aliasesForCompany = (company: string) => {
  const normalized = canonicalCompany(company).toLowerCase()
  const known = Object.entries(liveEntityAliases).find(([canonical, aliases]) => canonicalCompany(canonical).toLowerCase() === normalized || aliases.some((alias) => alias.toLowerCase() === normalized))
  return unique([company, ...(known?.[1] ?? [])]).filter((alias) => alias.length >= 4)
}
const businessEventContext = /\b(earnings?|guidance|revenue|profits?|losses?|quarterly results|shares?|stock price|share price|market cap|market share|investors?|supplier|supply chain|factory|production|shipping disruption|price increase|price cut|rate hike|interest rates?|inflation|tariffs?|mergers?|acquisitions?|filings?|investment|capacity|semiconductor|financial results|recall|outage|lawsuit|investigation|layoffs?|dividend|forecast|contract|regulator|regulatory|CEO|chief executive|board|antitrust|data breach|cyberattack|restructuring|bankruptcy|default|credit downgrade|debt|settlement|fraud|restatement)\b/i
const defaultCiks = ['0000320193', '0000789019', '0001652044']
const safeHttpUrl = (value: unknown) => {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) return undefined
  try {
    const parsed = new URL(value)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname ? value : undefined
  } catch { return undefined }
}
const canonicalHttpUrl = (value: unknown) => {
  const safe = safeHttpUrl(value)
  if (!safe) return undefined
  const parsed = new URL(safe)
  parsed.hash = ''
  for (const key of Array.from(parsed.searchParams.keys())) if (/^(utm_|fbclid$|gclid$|mc_)/i.test(key)) parsed.searchParams.delete(key)
  parsed.searchParams.sort()
  return parsed.toString()
}
const liveCompanyId = (name: string) => `live-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`

async function fetchNews(configuredEntities: string[] = []): Promise<{ records: ProviderRecord[]; connection: DataConnection }> {
  const key = process.env.NEWS_API_KEY?.trim()
  if (!key) return { records: [], connection: newsConnection('not_configured', 'No News provider key is configured; live articles are unavailable. Set NEWS_API_KEY in the server environment.') }
  const retrievedAt = nowIso()
  try {
    const trackedEntities = unique([...(configuredEntities.length ? configuredEntities : []), ...trackedEntitiesFromEnvironment()]).slice(0, 10)
    const companyAliases = unique(trackedEntities.flatMap(aliasesForCompany)).filter((alias) => alias.length >= 4)
    const companyQuery = companyAliases.map((alias) => `"${alias.replace(/"/g, '')}"`).join(' OR ')
    const topicQuery = 'earnings OR guidance OR revenue OR profit OR results OR shares OR stock price OR supplier OR supply chain OR acquisition OR merger OR lawsuit OR investigation OR regulatory OR antitrust OR recall OR forecast OR dividend OR restructuring OR bankruptcy OR debt OR contract OR data breach OR outage'
    const query = encodeURIComponent(`(${companyQuery}) AND (${topicQuery})`)
    const url = `https://newsapi.org/v2/everything?q=${query}&language=en&sortBy=publishedAt&pageSize=20`
    const data = await requestJson(url, { 'X-Api-Key': key, 'User-Agent': 'SignalScope/1.0' })
    if (data.status === 'error') {
      const providerError = new Error(safeText(data.message, 'News provider returned an error')) as Error & { status?: number }
      providerError.status = data.code === 'rateLimited' ? 429 : 502
      throw providerError
    }
    if (data.status !== 'ok' || !Array.isArray(data.articles)) {
      const providerError = new Error('News provider returned an invalid response shape') as Error & { status?: number }
      providerError.status = 502
      throw providerError
    }
    const articles = data.articles
    const malformedArticle = articles.some((article) => !article || typeof article !== 'object' || typeof article.title !== 'string' || typeof article.url !== 'string' || typeof article.publishedAt !== 'string' || !validDate(article.publishedAt, '') || (article.description != null && typeof article.description !== 'string') || (article.content != null && typeof article.content !== 'string'))
    if (malformedArticle) {
      const providerError = new Error('News provider returned a malformed article record') as Error & { status?: number }
      providerError.status = 502
      throw providerError
    }
    const records: ProviderRecord[] = articles.filter((article) => {
      const articleUrl = canonicalHttpUrl(article?.url)
      const text = `${article?.title ?? ''} ${article?.description ?? ''} ${article?.content ?? ''}`
      const parsedUrl = articleUrl ? new URL(articleUrl) : undefined
      const outOfScope = /pypi\.org|npmjs\.com|github\.com|school|education board|software package|open source|developer tooling/i.test(`${parsedUrl?.hostname ?? ''} ${text}`)
      const discoveryText = `${article?.title ?? ''} ${article?.description ?? ''}`
      const consumerPromotion = /\b(refurb(?:ished)?|clearance|coupon|promo code|free shipping|special offer|deal roundup|retail sale|save\s+\$\s?\d+|\d+\s?%\s+off)\b/i.test(discoveryText)
      const investorSolicitation = /\binvestors?\s+have\s+(?:an?\s+)?opportunity\s+to\s+lead\b|\binvestors?\s+(?:are\s+)?(?:urged|reminded|encouraged)\s+to\s+(?:join|contact|act)\b|\bshareholders?\s+(?:are\s+)?(?:urged|reminded|encouraged)\s+to\s+(?:join|contact|act)\b/i.test(discoveryText)
      const directMatches = providerEntityMatches(discoveryText, trackedEntities)
      // Require a named tracked issuer in the headline/description. This prevents broad macro
      // stories and unrelated headlines from becoming low-confidence, unassigned risk signals.
      return Boolean(articleUrl && article?.title && article.title !== '[Removed]' && validDate(article.publishedAt, '') && directMatches.length > 0 && businessEventContext.test(discoveryText) && !outOfScope && !consumerPromotion && !investorSolicitation)
    }).map((article) => {
      const articleUrl = canonicalHttpUrl(article.url)!
      const excerpt = safeText(article.content || article.description || article.title)
      const companyNames = providerEntityMatches(`${article.title} ${article.description ?? ''}`, trackedEntities)
      const publishedAt = validDate(article.publishedAt, '')
      const content = safeText(article.content)
      const textAvailability = content && !/\[\+\d+ chars\]/i.test(content) && content.length > 600 ? 'full_text' : content || safeText(article.description) ? 'excerpt' : 'metadata_only'
      return { id: `news-${createHash('sha256').update(articleUrl).digest('hex').slice(0, 32)}`, headline: safeText(article.title), sourceName: safeText(article.source?.name, 'News provider'), publishedAt, retrievedAt, url: articleUrl, excerpt, sourceType: 'News', official: false, provider: 'NewsAPI-compatible', textAvailability, companyNames }
    })
    return { records, connection: newsConnection(records.length ? 'connected' : 'empty', records.length ? `${records.length} company-specific article records retrieved for ${trackedEntities.length} tracked issuers. Text availability is shown per record.` : `Provider returned no matching articles for ${trackedEntities.length} tracked issuers. Unmatched headlines were excluded; no fictional records were substituted.`, retrievedAt) }
  } catch (error) {
    const status = (error as { status?: number }).status
    const detail = status === 429 ? 'News provider rate limit reached. Try manual refresh later.' : status === 401 || status === 403 ? `News provider rejected the configured key/account (HTTP ${status}). Check NEWS_API_KEY and account access; no records were substituted.` : status ? `News provider request failed (HTTP ${status}); no records were substituted.` : 'News provider request failed before a response was received. Check connectivity and provider account settings; no records were substituted.'
    return { records: [], connection: newsConnection(status === 429 ? 'rate_limited' : 'error', detail, undefined) }
  }
}

type GdeltResult = { records: ProviderRecord[]; connection: DataConnection }
let gdeltCache: { scopeKey: string; result: GdeltResult; expiresAt: number } | undefined
let gdeltInFlight: Promise<GdeltResult> | undefined
const GDELT_CACHE_TTL_MS = 15 * 60 * 1000

async function fetchGdeltSource(trackedEntities: string[]): Promise<GdeltResult> {
  const retrievedAt = nowIso()
  try {
    const aliases = unique(trackedEntities.flatMap(aliasesForCompany))
      .map((alias) => alias.replace(/["()|]/g, ' ').replace(/\s+/g, ' ').trim())
      .filter((alias) => alias.length >= 4)
    if (!aliases.length) return { records: [], connection: gdeltConnection('empty', 'No valid tracked company names are available for the GDELT search.') }
    const companyQuery = aliases.map((alias) => `"${alias}"`).join(' OR ')
    const topicTerms = ['earnings', 'guidance', 'revenue', 'profit', 'results', 'acquisition', 'merger', 'lawsuit', 'investigation', 'regulatory', 'antitrust', 'recall', 'restructuring', 'bankruptcy', 'debt', 'contract', 'supplier', '"supply chain"', 'factory', 'production', 'outage', 'cyberattack', 'layoffs', 'dividend']
    const query = `(${companyQuery}) AND (${topicTerms.join(' OR ')}) sourcelang:english`
    const params = new URLSearchParams({ query, mode: 'artlist', format: 'json', maxrecords: '40', sort: 'datedesc', timespan: '7d' })
    const data = await requestJson(`https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`, { 'User-Agent': 'SignalScope/1.0', Accept: 'application/json' }, 18000)
    if (!Array.isArray(data.articles)) throw Object.assign(new Error('GDELT returned no ArticleList array.'), { status: 502 })

    const records: ProviderRecord[] = []
    let malformed = 0
    for (const candidate of data.articles) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) { malformed += 1; continue }
      const article = candidate as Record<string, unknown>
      const title = safeText(article.title)
      const url = canonicalHttpUrl(article.url)
      const indexedAt = gdeltTimestamp(article.seendate)
      const domain = normalizeGdeltDomain(article.domain)
      const language = normalizeGdeltLanguage(article.language)
      if (!title || title === '[Removed]' || !url || !indexedAt || !domain || !language) { malformed += 1; continue }
      const discoveryText = title
      const outOfScope = /pypi\.org|npmjs\.com|github\.com|school|education board|software package|open source|developer tooling/i.test(`${domain} ${discoveryText}`)
      const consumerPromotion = /\b(refurb(?:ished)?|clearance|coupon|promo code|free shipping|special offer|deal roundup|retail sale|save\s+\$\s?\d+|\d+\s?%\s+off)\b/i.test(discoveryText)
      const investorSolicitation = /\binvestors?\s+have\s+(?:an?\s+)?opportunity\s+to\s+lead\b|\binvestors?\s+(?:are\s+)?(?:urged|reminded|encouraged)\s+to\s+(?:join|contact|act)\b|\bshareholders?\s+(?:are\s+)?(?:urged|reminded|encouraged)\s+to\s+(?:join|contact|act)\b/i.test(discoveryText)
      const companyNames = providerEntityMatches(discoveryText, trackedEntities)
      if (!companyNames.length || !businessEventContext.test(discoveryText) || outOfScope || consumerPromotion || investorSolicitation) continue
      const customFacts: SourceFact[] = [{ label: 'Publisher domain', value: domain }, { label: 'Source language', value: language }]
      records.push({
        id: `gdelt-${createHash('sha256').update(url).digest('hex').slice(0, 32)}`,
        headline: title,
        sourceName: domain,
        publishedAt: indexedAt,
        retrievedAt,
        url,
        excerpt: title,
        sourceType: 'News',
        official: false,
        provider: 'GDELT DOC 2.0',
        textAvailability: 'metadata_only',
        companyNames,
        sourceTimestampLabel: 'GDELT indexed at',
        sourceFacts: customFacts
      })
    }
    const status: DataConnection['status'] = records.length && malformed ? 'partial' : records.length ? 'connected' : malformed ? 'error' : 'empty'
    const detail = records.length
      ? `${records.length} GDELT article record${records.length === 1 ? '' : 's'} matched tracked issuers and material business context in the last seven days. GDELT indexed time is not asserted as publisher publication time; title-only records remain metadata-only evidence.${malformed ? ` ${malformed} malformed listings were omitted.` : ''}`
      : malformed
        ? `GDELT returned ${malformed} malformed ArticleList entries; no article records were added.`
        : 'GDELT responded successfully, but no English-language article titles matched the tracked issuers and material business-event filter in the last seven days.'
    return { records, connection: gdeltConnection(status, detail, retrievedAt, records.length) }
  } catch (error) {
    const status = (error as { status?: number }).status
    const detail = status === 429
      ? 'GDELT rate limit reached. The app will reuse the short-lived provider response cache and will not add substitute articles.'
      : status
        ? `GDELT ArticleList request failed (HTTP ${status}); no article records were substituted.`
        : 'GDELT ArticleList request failed before a response was received. Check provider availability; no article records were substituted.'
    return { records: [], connection: gdeltConnection(status === 429 ? 'rate_limited' : 'error', detail) }
  }
}

async function fetchGdelt(configuredEntities: string[] = []): Promise<GdeltResult> {
  const trackedEntities = unique([...configuredEntities, ...trackedEntitiesFromEnvironment()]).slice(0, 10)
  const scopeKey = trackedEntities.map((item) => canonicalCompany(item).toLowerCase()).sort().join('|')
  if (gdeltInFlight) return gdeltInFlight
  if (gdeltCache && gdeltCache.scopeKey === scopeKey && gdeltCache.expiresAt > Date.now()) {
    const age = gdeltCache.result.connection.lastSuccessfulRetrieval
      ? Math.max(1, Math.round((Date.now() - Date.parse(gdeltCache.result.connection.lastSuccessfulRetrieval)) / 60000))
      : 1
    return {
      ...gdeltCache.result,
      connection: { ...gdeltCache.result.connection, detail: `${gdeltCache.result.connection.detail} Reusing the short-lived GDELT response cache (${age} minute${age === 1 ? '' : 's'} since the provider request).` }
    }
  }
  gdeltInFlight = fetchGdeltSource(trackedEntities).then((result) => {
    const shortNegativeCache = result.connection.status === 'error' || result.connection.status === 'rate_limited'
    gdeltCache = { scopeKey, result, expiresAt: Date.now() + (shortNegativeCache ? 60_000 : GDELT_CACHE_TTL_MS) }
    return result
  }).finally(() => { gdeltInFlight = undefined })
  return gdeltInFlight
}

async function fetchFilings(): Promise<{ records: ProviderRecord[]; connection: DataConnection }> {
  const retrievedAt = nowIso()
  const configuredCiks = process.env.SEC_CIKS?.split(',').map((value) => value.trim()).filter(Boolean)
  const ciks = configuredCiks?.length ? configuredCiks : defaultCiks
  if (ciks.some((cik) => !/^\d{1,10}$/.test(cik) || /^0+$/.test(cik))) return { records: [], connection: filingsConnection('error', 'SEC_CIKS contains an invalid issuer identifier. Use non-zero numeric CIK values separated by commas.') }
  const userAgent = process.env.SEC_USER_AGENT?.trim()
  if (!isValidSecUserAgent(userAgent)) return { records: [], connection: filingsConnection('not_configured', 'SEC EDGAR requires a descriptive SEC_USER_AGENT with a contact email before refresh.', undefined) }
  const records: ProviderRecord[] = []
  let failures = 0
  let rateLimited = false
  for (const cik of ciks) {
    try {
      const data = await requestJson(`https://data.sec.gov/submissions/CIK${cik.padStart(10, '0')}.json`, { 'User-Agent': userAgent ?? '', Accept: 'application/json' })
      const recent = data.filings?.recent
      const issuer = safeText(data.name)
      const returnedCik = safeText(data.cik).replace(/^0+/, '')
      const requiredLists = recent ? [recent.form, recent.accessionNumber, recent.filingDate, recent.primaryDocument] : []
      if (!issuer || !returnedCik || returnedCik !== cik.replace(/^0+/, '') || !recent || requiredLists.some((list) => !Array.isArray(list)) || requiredLists.some((list) => list.length < recent.form.length)) { failures += 1; continue }
      const limit = Math.min(recent.form.length, 120)
      const malformedRow = Array.from({ length: limit }, (_, index) => typeof recent.form[index] !== 'string' || typeof recent.accessionNumber[index] !== 'string' || typeof recent.filingDate[index] !== 'string' || typeof recent.primaryDocument[index] !== 'string').some(Boolean)
      if (malformedRow) { failures += 1; continue }
      let issuerRecords = 0
      for (let index = 0; index < limit; index += 1) {
        const form = safeText(recent.form[index])
        if (!['8-K', '10-K', '10-Q', '6-K', '20-F'].includes(form)) continue
        const accession = safeText(recent.accessionNumber?.[index])
        const filingDate = validDate(safeText(recent.filingDate?.[index]), '')
        if (!filingDate) throw Object.assign(new Error('SEC provider returned an invalid eligible filing date'), { status: 502 })
        const primaryDocument = safeText(recent.primaryDocument?.[index])
        const accessionPath = accession.replaceAll('-', '')
        if (!/^\d{10}-\d{2}-\d{6}$/.test(accession) || !primaryDocument || primaryDocument.startsWith('/') || primaryDocument.split('/').some((segment) => !segment || segment === '.' || segment === '..' || !/^[A-Za-z0-9._-]+$/.test(segment))) throw Object.assign(new Error('SEC provider returned a malformed eligible filing row'), { status: 502 })
        const url = safeHttpUrl(`https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accessionPath}/${primaryDocument}`)
        if (!url) continue
        const headline = `${issuer} files ${form}`
        records.push({ id: `sec-${accession}`, headline, sourceName: 'SEC EDGAR', publishedAt: filingDate, retrievedAt, url, excerpt: `${issuer} submitted ${form}${filingDate ? ` on ${filingDate}` : ''}. Filing text is not fetched in this metadata-first provider path.`, sourceType: 'Company Filing', official: true, provider: 'SEC EDGAR', textAvailability: 'metadata_only', companyNames: [normalizeProviderCompany(issuer)], filingType: form, issuer, cik: cik.padStart(10, '0'), accession })
        issuerRecords += 1
        if (issuerRecords >= 8) break
      }
    } catch (error) { failures += 1; if ((error as { status?: number }).status === 429) rateLimited = true }
  }
  if (records.length && failures) return { records, connection: filingsConnection(rateLimited ? 'rate_limited' : 'partial', `${records.length} official filing metadata records retrieved; some configured issuers failed. Filing text availability is metadata-only.`, retrievedAt) }
  if (records.length) return { records, connection: filingsConnection('connected', `${records.length} official filing metadata records retrieved; filing text availability is metadata-only.`, retrievedAt) }
  if (failures && failures < ciks.length) return { records: [], connection: filingsConnection(rateLimited ? 'rate_limited' : 'partial', 'Some configured SEC issuers failed and the remaining responses contained no eligible 8-K, 10-K, 10-Q, 6-K, or 20-F records.', retrievedAt) }
  if (!failures) return { records: [], connection: filingsConnection('empty', 'SEC EDGAR responded, but no eligible 8-K, 10-K, 10-Q, 6-K, or 20-F records were found in the configured recent coverage.', retrievedAt) }
  return { records: [], connection: filingsConnection(rateLimited ? 'rate_limited' : 'error', rateLimited ? 'SEC EDGAR rate limit reached. Try manual refresh later.' : 'SEC EDGAR could not be reached. No filing records were substituted.') }
}

const analyzeRecord = (record: ProviderRecord): RiskEvent => {
  const text = `${record.headline} ${record.excerpt}`.toLowerCase()
  const negativeHits = (text.match(/risk|delay|disruption|downgrade|cut|lower|slow|shortage|loss|pressure|uncertain|drop|decline|restatement|investigation/g) || []).length
  const positiveHits = (text.match(/improve|restore|growth|strong|recover|benefit|raise|record|expansion|approval/g) || []).length
  const sentiment = Math.max(-1, Math.min(1, (positiveHits - negativeHits) * 0.12))
  const category = /policy|operational|supplier|traceability|procedure|control/i.test(text) ? 'Company Policy / Operational Change' : /geopolitic|sanction|war|tariff/i.test(text) ? 'Geopolitical' : /rate|inflation|central bank|monetary/i.test(text) ? 'Macroeconomic' : /credit|debt|downgrade|default/i.test(text) ? 'Credit Event' : /merger|acquisition|takeover/i.test(text) ? 'Merger / Acquisition' : /earnings|guidance|revenue|profit|10-k|10-q|8-k|20-f/i.test(text) ? 'Earnings / Guidance' : /product|launch|factory|production|delivery|supply|shipping/i.test(text) ? 'Product / Operations' : 'Other'
  const impact = Math.max(1, Math.min(10, 3 + (record.official ? 1 : 0) + Math.min(3, negativeHits) + (category === 'Credit Event' ? 2 : 0)))
  const confidence = Math.min(0.9, 0.42 + (record.official ? 0.22 : 0) + (record.textAvailability === 'full_text' ? 0.12 : record.textAvailability === 'excerpt' ? 0.04 : 0) + (record.companyNames.length ? 0.1 : 0))
  const reliability: Reliability = record.official ? 'Official' : 'Reported'
  const insufficientEvidence = record.textAvailability === 'metadata_only'
  const companyMatchUncertain = record.companyNames.length === 0
  const sourceFacts: SourceFact[] = [
    { label: 'Source type', value: record.sourceType },
    { label: 'Provider', value: record.provider },
    { label: 'Publisher / issuer', value: record.issuer || record.sourceName },
    { label: 'Original URL', value: record.url },
    { label: 'Matched entities', value: record.companyNames.length ? record.companyNames.join(', ') : 'No confident entity match' },
    { label: record.sourceTimestampLabel ?? (record.official ? 'Filing date' : 'Publisher timestamp'), value: displayTime(record.publishedAt) },
    { label: 'Retrieved', value: displayTime(record.retrievedAt) },
    { label: 'Text available', value: record.textAvailability === 'full_text' ? 'Full provider text' : record.textAvailability === 'excerpt' ? 'Provider excerpt; full text not confirmed' : 'Metadata only' },
    ...(record.filingType ? [{ label: 'Filing type', value: record.filingType }] : []),
    ...(record.cik ? [{ label: 'CIK', value: record.cik }] : []),
    ...(record.accession ? [{ label: 'Accession', value: record.accession }] : []),
    ...(record.sourceFacts ?? [])
  ]
  const evidence: Evidence = { id: `${record.id}-evidence`, title: record.headline, sourceName: record.sourceName, sourceType: record.sourceType, reliability, publishedAt: displayTime(record.publishedAt), timestamp: displayTime(record.publishedAt), timestampLabel: record.sourceTimestampLabel ?? (record.official ? 'Filing date' : 'Publisher timestamp'), url: record.url, excerpt: record.excerpt, sentiment: companyMatchUncertain || insufficientEvidence ? 0 : sentiment, excerptKind: record.textAvailability === 'metadata_only' ? 'metadata_note' : 'source_excerpt' }
  return {
    id: `live-${record.id}`, headline: companyMatchUncertain ? `Company match uncertain · ${record.headline}` : insufficientEvidence ? `Insufficient evidence · ${record.headline}` : record.headline, summary: companyMatchUncertain ? 'The provider record was retrieved, but no confident company/entity match was found. Review the original source before using this signal.' : insufficientEvidence ? 'The source metadata was retrieved, but the available text is insufficient to support a strong risk conclusion.' : record.excerpt, explanation: companyMatchUncertain ? `Source facts are available, but SignalScope did not identify a confident company match. Model analysis is withheld until the entity can be resolved.` : insufficientEvidence ? `Only metadata was available from the cited source. Model analysis is intentionally low-confidence and should not be treated as a complete finding.` : record.textAvailability === 'excerpt' ? `Model analysis is based on a provider excerpt, not confirmed full text. Review the original source before treating the assessment as complete.` : `Model analysis based on the cited ${record.sourceType.toLowerCase()} record. The impact score estimates potential relevance and severity; it does not predict a precise stock-price move.`, category, sentiment: companyMatchUncertain || insufficientEvidence ? 0 : sentiment, impact: companyMatchUncertain || insufficientEvidence ? 1 : impact, confidence: companyMatchUncertain || insufficientEvidence ? 0.12 : confidence, firstSeen: displayTime(record.publishedAt), updated: `Retrieved ${displayTime(record.retrievedAt)}`, sourceCount: 1, sourceTypes: [record.sourceType], reliability, companyIds: record.companyNames.map(liveCompanyId), companyNames: record.companyNames, stale: record.stale, origin: 'live', provider: record.provider, official: record.official, publishedAt: record.publishedAt, retrievedAt: record.retrievedAt, textAvailability: record.textAvailability, sourceFacts, limitedEvidence: record.textAvailability !== 'full_text' || companyMatchUncertain, sourcesDisagree: false, whatCouldChange: companyMatchUncertain ? ['A source adapter identifies the company using a full name and context.', 'A second independent source corroborates the same event and entity.', 'A person reviews the original source before analysis is used.'] : insufficientEvidence ? ['The provider exposes fuller article or filing text.', 'A second independent source corroborates the event and entity.', 'A person reviews the original source before analysis is used.'] : ['A second independent source corroborates the same event.', 'The issuer or publisher provides fuller context or a correction.', 'Subsequent filings or reporting change the timing or severity.'], evidence: [evidence], timeline: [{ time: displayTime(record.publishedAt), label: record.sourceTimestampLabel ?? (record.official ? 'Official filing date' : 'Provider observation'), detail: record.textAvailability === 'metadata_only' ? 'Metadata was retrieved; full source text was not available through this provider path.' : record.textAvailability === 'excerpt' ? 'A provider excerpt was retrieved; full source text was not available through this provider path.' : 'Article metadata and available text were retrieved through the configured provider.', sourceType: record.sourceType }]
  }
}

const headlineTerms = (headline: string) => {
  const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'files', 'filed', 'inc', 'corp', 'corporation', 'company', 'limited', 'reports', 'report', 'says'])
  return new Set(headline.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter((term) => term && !stopWords.has(term)))
}
const sameUtcDay = (left?: string, right?: string) => {
  if (!left || !right) return true
  const leftTime = Date.parse(left), rightTime = Date.parse(right)
  return !Number.isFinite(leftTime) || !Number.isFinite(rightTime) || new Date(leftTime).toISOString().slice(0, 10) === new Date(rightTime).toISOString().slice(0, 10)
}
const duplicateEvent = (left: RiskEvent, right: RiskEvent) => {
  if (left.provider === 'SEC EDGAR' && right.provider === 'SEC EDGAR') return left.evidence.some((leftEvidence) => right.evidence.some((rightEvidence) => leftEvidence.url === rightEvidence.url))
  const leftCompanies = (left.companyNames ?? []).slice().sort().join('|')
  const rightCompanies = (right.companyNames ?? []).slice().sort().join('|')
  if (leftCompanies !== rightCompanies || left.category !== right.category || !sameUtcDay(left.publishedAt, right.publishedAt)) return false
  const leftTerms = headlineTerms(left.headline), rightTerms = headlineTerms(right.headline)
  const overlap = Array.from(leftTerms).filter((term) => rightTerms.has(term)).length
  return overlap >= Math.max(3, Math.ceil(Math.min(leftTerms.size, rightTerms.size) * 0.6))
}
const mergeEvents = (events: RiskEvent[]) => {
  const grouped: RiskEvent[] = []
  for (const event of events) {
    const existing = grouped.find((candidate) => duplicateEvent(candidate, event))
    if (!existing) { grouped.push(event); continue }
    existing.evidence = unique([...existing.evidence, ...event.evidence].map((item) => item.url)).map((url) => [...existing.evidence, ...event.evidence].find((item) => item.url === url)!).filter(Boolean)
    existing.timeline = [...existing.timeline, ...event.timeline]
    existing.sourceTypes = unique([...existing.sourceTypes, ...event.sourceTypes])
    existing.sourceCount = new Set(existing.evidence.map((item) => item.sourceName.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ') || 'unknown source')).size
    existing.confidence = Math.min(0.95, existing.confidence + 0.08)
    existing.limitedEvidence = Boolean(existing.limitedEvidence || event.limitedEvidence || event.textAvailability === 'metadata_only')
    if (existing.limitedEvidence) existing.confidence = Math.min(existing.confidence, 0.2)
    const sourceSentiments = existing.evidence.map((item) => item.sentiment).filter((value): value is number => typeof value === 'number')
    if (sourceSentiments.length) existing.sentiment = sourceSentiments.reduce((sum, value) => sum + value, 0) / sourceSentiments.length
    existing.sourcesDisagree = Boolean(existing.sourcesDisagree || (sourceSentiments.length > 1 && Math.max(...sourceSentiments) - Math.min(...sourceSentiments) >= 0.35))
    if (existing.sourcesDisagree) existing.confidence = Math.min(existing.confidence, 0.45)
    existing.stale = Boolean(existing.stale || event.stale)
    existing.official = Boolean(existing.official || event.official)
    existing.reliability = existing.official ? 'Official' : existing.reliability
    existing.sourceFacts = [...(existing.sourceFacts ?? []), ...(event.sourceFacts ?? [])]
  }
  for (const event of grouped) {
    const evidenceUrls = event.evidence.map((item) => item.url).sort()
    event.id = `live-group-${createHash('sha256').update(evidenceUrls.join('|')).digest('hex').slice(0, 32)}`
    event.evidence.sort((left, right) => left.url.localeCompare(right.url))
    event.timeline.sort((left, right) => Date.parse(left.time) - Date.parse(right.time))
    const dates = [event.publishedAt, ...event.evidence.map((item) => item.publishedAt)].map((value) => value ? Date.parse(value) : NaN).filter(Number.isFinite)
    if (dates.length) { event.publishedAt = new Date(Math.min(...dates)).toISOString(); event.firstSeen = displayTime(event.publishedAt) }
  }
  return grouped
}

let lastSnapshot: ProviderSnapshot | undefined

export const getConnectionSnapshot = (): ProviderSnapshot => {
  const marketData = lastSnapshot?.marketData ?? getMarketDataSnapshot()
  const alphaHistory = lastSnapshot?.alphaHistory ?? getAlphaVantageSnapshot()
  return {
    connections: lastSnapshot?.connections ?? [
      newsConnection(process.env.NEWS_API_KEY?.trim() ? 'ready' : 'not_configured', process.env.NEWS_API_KEY?.trim() ? 'Configured but not refreshed yet.' : 'No News provider key is configured; live articles are unavailable. Set NEWS_API_KEY in the server environment.'),
      filingsConnection(isValidSecUserAgent(process.env.SEC_USER_AGENT) ? 'ready' : 'not_configured', isValidSecUserAgent(process.env.SEC_USER_AGENT) ? 'Configured; official filing records load automatically on startup and can be refreshed manually.' : 'Configure SEC_USER_AGENT with a contact email before requesting official filing metadata.'),
      gdeltConnection('ready', 'The keyless GDELT DOC 2.0 ArticleList feed loads automatically on startup and can be refreshed manually; recent responses are cached briefly to respect provider limits.'),
      marketData.connection,
      alphaHistory.connection
    ],
    events: [], records: [], marketData, alphaHistory, retrievedAt: lastSnapshot?.retrievedAt ?? ''
  }
}

export async function refreshProviders(): Promise<ProviderSnapshot> {
  const [filings, marketData] = await Promise.all([fetchFilings(), refreshMarketData()])
  const configuredEntities = unique([
    ...filings.records.map((record) => record.issuer).filter((issuer): issuer is string => Boolean(issuer)),
    ...trackedEntitiesFromEnvironment()
  ])
  const [news, gdelt, alphaHistory] = await Promise.all([
    fetchNews(configuredEntities),
    fetchGdelt(configuredEntities),
    refreshAlphaVantage(marketData)
  ])
  const connections = [news.connection, filings.connection, gdelt.connection, marketData.connection, alphaHistory.connection]
  const providerResults = [
    { connection: news.connection, records: news.records },
    { connection: filings.connection, records: filings.records },
    { connection: gdelt.connection, records: gdelt.records }
  ]
  const combinedRecords = providerResults.flatMap(({ connection, records }) => {
    const previousRecords = lastSnapshot?.records.filter((record) => record.provider === connection.provider) ?? []
    const currentIssuerKeys = new Set(records.map((record) => normalizeProviderCompany(record.issuer || record.companyNames?.[0] || '').toLowerCase()).filter(Boolean))
    const missingIssuerRecords = connection.id === 'sec-edgar' && connection.status === 'partial' ? previousRecords.filter((record) => !currentIssuerKeys.has(normalizeProviderCompany(record.issuer || record.companyNames?.[0] || '').toLowerCase())).map((record) => ({ ...record, stale: true })) : []
    if (missingIssuerRecords.length) {
      const previousConnection = lastSnapshot?.connections.find((item) => item.id === connection.id)
      const index = connections.findIndex((item) => item.id === connection.id)
      connections[index] = { ...connection, detail: `${connection.detail} Some issuer records are retained as stale until the missing issuer recovers.`, lastSuccessfulRetrieval: previousConnection?.lastSuccessfulRetrieval }
      return [...records, ...missingIssuerRecords]
    }
    const shouldRetain = ['empty', 'not_configured', 'error', 'rate_limited', 'unavailable'].includes(connection.status) && previousRecords.length > 0
    if (!shouldRetain) return records
    const previousConnection = lastSnapshot?.connections.find((item) => item.id === connection.id)
    const index = connections.findIndex((item) => item.id === connection.id)
    connections[index] = { ...connection, status: 'stale', detail: `${connection.detail} Showing the last successful live records until this provider recovers.`, lastSuccessfulRetrieval: previousConnection?.lastSuccessfulRetrieval }
    return previousRecords.map((record) => ({ ...record, stale: true }))
  })
  const events = mergeEvents(combinedRecords.map(analyzeRecord))
  const snapshot: ProviderSnapshot = { connections, events, records: combinedRecords, marketData, alphaHistory, retrievedAt: nowIso() }
  lastSnapshot = snapshot
  return snapshot
}
