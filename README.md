# SE Assistant MCP Server

A Model Context Protocol (MCP) server that exposes GitHub tools to Claude via the SE Assistant backend.

**Full project architecture:** [SE Assistant — Project Architecture](https://docs.google.com/document/d/10_uX209MxOdS-cHkVwnTrvAS3yJ-Y6NLumXs-Hmb8Z8/edit?tab=t.0)

## What is MCP?

MCP (Model Context Protocol) is a standardized way to give LLMs access to external tools. Instead of embedding tool logic inside the LLM orchestrator, tools are served as independent HTTP servers that expose:

- **Tool definitions** — what tools exist, what inputs they accept
- **Tool execution** — run a tool and return results

The LLM orchestrator (our Spring Boot backend) fetches tool definitions at startup and includes them in requests to Claude. When Claude decides to use a tool, the backend calls this MCP server.

## Architecture

```
Claude (Bedrock) responds with tool_use
    → Spring Boot backend calls POST /tools/call
    → MCP Server executes the tool
    → Returns result to backend
    → Backend feeds result back to Claude
```

## Available Tools

### `get_pr_details`

Fetches complete GitHub PR details including diffs for all changed files.

**Input:** GitHub PR URL (e.g., `https://github.com/owner/repo/pull/123`)

**Output:**
- PR title, number, author, state
- Base and head branch
- PR description
- All changed files with unified diffs

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js |
| Language | TypeScript (ES2022) |
| MCP SDK | @modelcontextprotocol/sdk v1.12.0 |
| Validation | Zod |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tools/list` | Returns all tool definitions (called by backend at startup) |
| POST | `/tools/call` | Execute a tool (`{name, input}`) |
| GET | `/health` | Health check |

## Running

```bash
# Install dependencies
npm install

# Set GitHub token (needs PR read access)
export GITHUB_TOKEN=your-token

# Development (live reload)
npm run dev

# Production
npm run build && npm start
```

Server starts on port 8081 (configurable via `MCP_PORT` env var).

## Design Decisions

### Why a Separate Server?

**Pros:**
- Decoupled from backend — add/remove tools without redeploying Java app
- Can use any language per tool (Node.js is natural for GitHub API)
- Security boundary — Claude never gets direct API keys
- Independently scalable and deployable

**Cons:**
- Extra process to run
- Network hop adds ~10ms latency to tool calls
- One more thing that can fail

### Why Not Embed Tools Directly in Spring Boot?

If we had 10 tools (GitHub, Jira, Slack, Confluence...), the backend would grow into a monolith that needs redeploying for every tool change. MCP keeps tools modular.

### Why MCP Over Custom Tool Protocol?

MCP is becoming the industry standard for LLM tool integration. Using it means:
- Compatible with other MCP clients (Claude Desktop, etc.)
- Community tools can be plugged in without modification
- Clear specification for tool definition format
