/**
 * GitHubClient — calls the GitHub REST API to fetch PR details.
 *
 * Reads GITHUB_TOKEN from the environment (set in ~/.zshrc).
 * Supports private repos as long as the token has:
 *   - Pull requests: Read
 *   - Contents: Read
 *   - Metadata: Read
 */

export interface PrDetails {
  title: string
  number: number
  author: string
  state: string
  body: string | null
  baseBranch: string
  headBranch: string
  filesChanged: FileChange[]
}

export interface FileChange {
  filename: string
  status: string   // added | modified | removed | renamed
  additions: number
  deletions: number
  patch: string | null  // the actual diff for this file
}

/**
 * Parses a GitHub PR URL into owner, repo, and PR number.
 * Supports:
 *   https://github.com/owner/repo/pull/123
 *   https://github.com/owner/repo/pull/123/files
 */
export function parsePrUrl(url: string): { owner: string; repo: string; prNumber: number } {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  if (!match) {
    throw new Error(`Invalid GitHub PR URL: ${url}`)
  }
  return {
    owner: match[1],
    repo: match[2],
    prNumber: parseInt(match[3], 10),
  }
}

/**
 * Fetches full PR details including the diff for each changed file.
 */
export async function getPrDetails(url: string): Promise<PrDetails> {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is not set')
  }

  const { owner, repo, prNumber } = parsePrUrl(url)
  const headers: HeadersInit = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  // Fetch PR metadata (title, description, branches, author)
  const prResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
    { headers }
  )
  if (!prResponse.ok) {
    const error = await prResponse.text()
    throw new Error(`GitHub API error ${prResponse.status}: ${error}`)
  }
  const pr = await prResponse.json() as any

  // Fetch changed files with diffs
  const filesResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`,
    { headers }
  )
  if (!filesResponse.ok) {
    const error = await filesResponse.text()
    throw new Error(`GitHub API error fetching files ${filesResponse.status}: ${error}`)
  }
  const files = await filesResponse.json() as any[]

  const filesChanged: FileChange[] = files.map(f => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch ?? null,
  }))

  return {
    title: pr.title,
    number: pr.number,
    author: pr.user?.login ?? 'unknown',
    state: pr.state,
    body: pr.body ?? null,
    baseBranch: pr.base?.ref ?? 'unknown',
    headBranch: pr.head?.ref ?? 'unknown',
    filesChanged,
  }
}

/**
 * Formats PR details into a clean text block Claude can read.
 */
export function formatPrForClaude(pr: PrDetails): string {
  const lines: string[] = []

  lines.push(`# PR #${pr.number}: ${pr.title}`)
  lines.push(`**Author:** ${pr.author}`)
  lines.push(`**State:** ${pr.state}`)
  lines.push(`**Branch:** ${pr.headBranch} → ${pr.baseBranch}`)
  lines.push('')

  if (pr.body) {
    lines.push('## PR Description')
    lines.push(pr.body)
    lines.push('')
  }

  lines.push(`## Files Changed (${pr.filesChanged.length} files)`)
  for (const file of pr.filesChanged) {
    lines.push(`\n### ${file.filename} (${file.status}, +${file.additions} -${file.deletions})`)
    if (file.patch) {
      lines.push('```diff')
      lines.push(file.patch)
      lines.push('```')
    } else {
      lines.push('_(no diff available — binary file or too large)_')
    }
  }

  return lines.join('\n')
}
