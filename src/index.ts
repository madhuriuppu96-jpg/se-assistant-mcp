/**
 * SE Assistant MCP Server
 *
 * Exposes tools that Claude can use via the Model Context Protocol.
 * Runs as an HTTP server on port 8081.
 *
 * Tools exposed:
 *   - get_pr_details(url) — fetches a GitHub PR diff, description, and file changes
 *
 * The Spring Boot backend (se-assistant-backend) calls this server at startup
 * to get the tool list, then includes it in every Claude request.
 * When Claude responds with a tool_use block, the backend calls POST /tools/call
 * to execute the tool and get the result.
 *
 * Environment variables required:
 *   GITHUB_TOKEN — GitHub personal access token with PR read access
 */

import http from 'http'
import { getPrDetailsTool, executePrDetails } from './tools/getPrDetails.js'

const PORT = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT) : 8081

// Registry of all tools — add new tools here
const TOOLS = [getPrDetailsTool]

const TOOL_EXECUTORS: Record<string, (input: unknown) => Promise<string>> = {
  get_pr_details: executePrDetails,
}

// ── Request router ────────────────────────────────────────────────────────────

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  // CORS — allow requests from Spring Boot backend on any port
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  // GET /tools/list — returns all tool definitions
  // Spring Boot calls this at startup to learn what tools are available
  if (req.method === 'GET' && req.url === '/tools/list') {
    respondJson(res, 200, { tools: TOOLS })
    return
  }

  // POST /tools/call — executes a tool and returns the result
  // Spring Boot calls this when Claude responds with a tool_use block
  if (req.method === 'POST' && req.url === '/tools/call') {
    const body = await readBody(req)
    let parsed: { name: string; input: unknown }

    try {
      parsed = JSON.parse(body)
    } catch {
      respondJson(res, 400, { error: 'Invalid JSON body' })
      return
    }

    const { name, input } = parsed
    const executor = TOOL_EXECUTORS[name]

    if (!executor) {
      respondJson(res, 404, { error: `Unknown tool: ${name}` })
      return
    }

    try {
      console.log(`[MCP] Executing tool: ${name}`, input)
      const result = await executor(input)
      console.log(`[MCP] Tool ${name} completed successfully`)
      respondJson(res, 200, { result })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[MCP] Tool ${name} failed:`, message)
      respondJson(res, 500, { error: message })
    }
    return
  }

  // GET /health — simple health check
  if (req.method === 'GET' && req.url === '/health') {
    respondJson(res, 200, { status: 'ok', tools: TOOLS.map(t => t.name) })
    return
  }

  respondJson(res, 404, { error: `Unknown endpoint: ${req.method} ${req.url}` })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function respondJson(res: http.ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  })
  res.end(json)
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
    req.on('error', reject)
  })
}

// ── Start server ──────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch(err => {
    console.error('[MCP] Unhandled error:', err)
    respondJson(res, 500, { error: 'Internal server error' })
  })
})

server.listen(PORT, () => {
  console.log(`SE Assistant MCP Server running on http://localhost:${PORT}`)
  console.log(`Tools available: ${TOOLS.map(t => t.name).join(', ')}`)
  console.log(`GITHUB_TOKEN: ${process.env.GITHUB_TOKEN ? '✓ set' : '✗ NOT SET — GitHub tools will fail'}`)
})
