import { z } from 'zod';

/** Supported agent frameworks */
export const AgentFramework = z.enum(['claude-code']);

export type AgentFramework = z.infer<typeof AgentFramework>;

/** Agent configuration for a daemon */
export const AgentConfigSchema = z.object({
  /** Which agent framework to use */
  framework: AgentFramework,

  /** The prompt/task for the agent. Supports $TRIGGER_PAYLOAD placeholder. */
  prompt: z.string().default('$TRIGGER_PAYLOAD'),

  /** Max turns / iterations the agent can take */
  maxTurns: z.number().int().positive().optional(),

  /** Max budget in USD */
  maxBudgetUsd: z.number().positive().optional(),

  /** Allowed tools (e.g., ["Read", "Edit", "Bash"]) */
  allowedTools: z.array(z.string()).optional(),

  /** Model to use (e.g., "sonnet", "opus") */
  model: z.string().optional(),

  /** Additional CLI flags passed to the agent */
  extraArgs: z.array(z.string()).optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/**
 * Generate a workload script for a given agent config.
 * The script is run inside the VM by the executor.
 */
export function generateAgentScript(agent: AgentConfig): string {
  switch (agent.framework) {
    case 'claude-code':
      return generateClaudeCodeScript(agent);
    default:
      throw new Error(`Unknown agent framework: ${agent.framework}`);
  }
}

function generateClaudeCodeScript(agent: AgentConfig): string {
  const lines: string[] = [
    '#!/bin/bash',
    'set -euo pipefail',
    '',
    '# Install Claude Code if not present',
    'if ! command -v claude &>/dev/null; then',
    '  curl -fsSL https://claude.ai/install.sh | bash',
    '  export PATH="$HOME/.claude/bin:$PATH"',
    'fi',
    '',
  ];

  // Build the claude command
  const args: string[] = ['-p'];

  // Prompt — default to $TRIGGER_PAYLOAD
  const prompt = agent.prompt || '$TRIGGER_PAYLOAD';
  args.push(`"${prompt}"`);

  // Always use bare mode for headless
  args.push('--bare');

  // Allowed tools
  if (agent.allowedTools?.length) {
    args.push(`--allowedTools "${agent.allowedTools.join(',')}"`);
  } else {
    // Default: allow common tools
    args.push('--allowedTools "Read,Edit,Bash,Write"');
  }

  // Max turns
  if (agent.maxTurns) {
    args.push(`--max-turns ${agent.maxTurns}`);
  }

  // Max budget
  if (agent.maxBudgetUsd) {
    args.push(`--max-budget-usd ${agent.maxBudgetUsd}`);
  }

  // Model
  if (agent.model) {
    args.push(`--model ${agent.model}`);
  }

  // Output as JSON for structured results
  args.push('--output-format json');

  // Extra args
  if (agent.extraArgs?.length) {
    args.push(...agent.extraArgs);
  }

  lines.push(`# Run Claude Code`);
  lines.push(`claude ${args.join(' ')} > /output/result.json 2>/tmp/stderr.log`);

  return lines.join('\n');
}
