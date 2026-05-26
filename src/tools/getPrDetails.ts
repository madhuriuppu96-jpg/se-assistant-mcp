import { z } from 'zod'
import { getPrDetails, formatPrForClaude } from '../github/GitHubClient.js'

/**
 * Tool definition for get_pr_details.
 *
 * This is what gets sent to Claude in the `tools` array so Claude knows:
 *   - the tool's name
 *   - what it does (description)
 *   - what inputs it needs (inputSchema)
 */
export const getPrDetailsTool = {
  name: 'get_pr_details',
  description:
    'Fetches the full details of a GitHub pull request including the diff for each changed file, ' +
    'the PR description, author, and branch info. Use this whenever the user provides a GitHub PR URL ' +
    'and wants a review, summary, or analysis of that PR.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      url: {
        type: 'string',
        description: 'The full GitHub PR URL, e.g. https://github.com/owner/repo/pull/123',
      },
    },
    required: ['url'],
  },
}

// Zod schema for validating input at runtime
const InputSchema = z.object({
  url: z.string().url(),
})

/**
 * Executes the get_pr_details tool.
 * Called by the MCP server when Claude requests this tool.
 */
export async function executePrDetails(input: unknown): Promise<string> {
  const { url } = InputSchema.parse(input)
  const pr = await getPrDetails(url)
  return formatPrForClaude(pr)
}
