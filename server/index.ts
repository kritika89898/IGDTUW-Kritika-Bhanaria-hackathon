import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, readFileSync, createReadStream } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'
import { getConnectionSnapshot, refreshProviders } from './providers.ts'
import { getAlphaVantageSeries } from './alphaVantage.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const port = Number(process.env.PORT || 3000)
const json = (response: ServerResponse, status: number, body: unknown) => { response.statusCode = status; response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.setHeader('Cache-Control', 'no-store'); response.end(JSON.stringify(body)) }
const html = readFileSync(join(root, 'index.html'), 'utf8')
const publicRoot = join(root, 'dist')

async function api(request: IncomingMessage, response: ServerResponse) {
  const pathname = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname
  if (request.method === 'GET' && pathname === '/api/health') return json(response, 200, { ok: true, service: 'signalscope', time: new Date().toISOString() })
  if (request.method === 'GET' && pathname === '/api/connections') return json(response, 200, getConnectionSnapshot())
  const historyMatch = pathname.match(/^\/api\/market-history\/([^/]+)$/)
  if (request.method === 'GET' && historyMatch) {
    let symbol = ''
    try { symbol = decodeURIComponent(historyMatch[1]).toUpperCase() } catch { return json(response, 400, { error: 'Invalid symbol path.' }) }
    if (!/^[A-Z0-9][A-Z0-9.^=_-]{0,19}$/.test(symbol)) return json(response, 400, { error: 'Invalid symbol path.' })
    const series = getAlphaVantageSeries(symbol)
    if (!series) return json(response, 404, { error: `No retrieved Alpha Vantage history is available for ${symbol}.` })
    return json(response, 200, {
      provider: series.sourceName,
      symbol: series.symbol,
      issuerName: series.issuerName,
      sourceUrl: series.sourceUrl,
      retrievedAt: series.retrievedAt,
      stale: Boolean(series.stale),
      providerFields: ['date', 'open', 'high', 'low', 'close', 'volume'],
      calculatedFields: ['sma20', 'sma50'],
      calculatedBy: 'SignalScope',
      observations: series.observations
    })
  }
  if (request.method === 'POST' && pathname === '/api/refresh') {
    try { return json(response, 200, await refreshProviders()) } catch { return json(response, 502, { error: 'Provider refresh failed. No records were substituted.' }) }
  }
  return json(response, 404, { error: 'Not found' })
}

const contentType: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.png': 'image/png' }
const serveStatic = (request: IncomingMessage, response: ServerResponse) => {
  const requested = new URL(request.url || '/', 'http://localhost').pathname
  if (requested === '/manus-routes.json') {
    const routeFile = join(process.env.NODE_ENV === 'production' ? publicRoot : join(root, 'public'), 'manus-routes.json')
    response.statusCode = 200; response.setHeader('Content-Type', 'application/json'); return createReadStream(routeFile).pipe(response)
  }
  const candidate = normalize(join(publicRoot, requested === '/' ? 'index.html' : requested))
  if (candidate.startsWith(publicRoot) && existsSync(candidate)) { response.statusCode = 200; response.setHeader('Content-Type', contentType[extname(candidate)] || 'application/octet-stream'); return createReadStream(candidate).pipe(response) }
  response.statusCode = 200; response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(process.env.NODE_ENV === 'production' ? readFileSync(join(publicRoot, 'index.html'), 'utf8') : html)
}

const start = async () => {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ root, server: { middlewareMode: true }, appType: 'spa' })
    const server = createHttpServer((request, response) => {
      if (request.url?.startsWith('/api/')) return void api(request, response)
      vite.middlewares(request, response, () => serveStatic(request, response))
    })
    server.listen(port, '0.0.0.0', () => console.log(`SignalScope server listening on ${port}`))
    return
  }
  createHttpServer((request, response) => request.url?.startsWith('/api/') ? void api(request, response) : serveStatic(request, response)).listen(port, '0.0.0.0', () => console.log(`SignalScope production server listening on ${port}`))
}
start().catch((error) => { console.error(error); process.exit(1) })
