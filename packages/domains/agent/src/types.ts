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
