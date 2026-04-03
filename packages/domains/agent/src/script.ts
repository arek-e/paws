import type { AgentConfig } from './types.js';

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

  const args: string[] = ['-p'];

  const prompt = agent.prompt || '$TRIGGER_PAYLOAD';
  args.push(`"${prompt}"`);

  args.push('--bare');

  if (agent.allowedTools?.length) {
    args.push(`--allowedTools "${agent.allowedTools.join(',')}"`);
  } else {
    args.push('--allowedTools "Read,Edit,Bash,Write"');
  }

  if (agent.maxTurns) {
    args.push(`--max-turns ${agent.maxTurns}`);
  }

  if (agent.maxBudgetUsd) {
    args.push(`--max-budget-usd ${agent.maxBudgetUsd}`);
  }

  if (agent.model) {
    args.push(`--model ${agent.model}`);
  }

  args.push('--output-format json');

  if (agent.extraArgs?.length) {
    args.push(...agent.extraArgs);
  }

  lines.push(`# Run Claude Code`);
  lines.push(`claude ${args.join(' ')} > /output/result.json 2>/tmp/stderr.log`);

  return lines.join('\n');
}
