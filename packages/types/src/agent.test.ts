import { describe, expect, test } from 'vitest';

import { AgentConfigSchema, AgentFramework, generateAgentScript } from './agent.js';

describe('AgentFramework', () => {
  test('accepts claude-code', () => {
    expect(AgentFramework.parse('claude-code')).toBe('claude-code');
  });

  test('rejects unknown framework', () => {
    expect(() => AgentFramework.parse('gpt-pilot')).toThrow();
  });
});

describe('AgentConfigSchema', () => {
  test('accepts minimal config', () => {
    const result = AgentConfigSchema.parse({ framework: 'claude-code' });
    expect(result.framework).toBe('claude-code');
    expect(result.prompt).toBe('$TRIGGER_PAYLOAD');
  });

  test('accepts full config', () => {
    const result = AgentConfigSchema.parse({
      framework: 'claude-code',
      prompt: 'Fix the login bug',
      maxTurns: 10,
      maxBudgetUsd: 5.0,
      allowedTools: ['Read', 'Edit', 'Bash'],
      model: 'sonnet',
    });
    expect(result.maxTurns).toBe(10);
    expect(result.allowedTools).toEqual(['Read', 'Edit', 'Bash']);
  });
});

describe('generateAgentScript', () => {
  test('generates claude-code script with defaults', () => {
    const script = generateAgentScript({ framework: 'claude-code', prompt: '$TRIGGER_PAYLOAD' });
    expect(script).toContain('claude');
    expect(script).toContain('-p');
    expect(script).toContain('--bare');
    expect(script).toContain('--output-format json');
    expect(script).toContain('/output/result.json');
  });

  test('includes max-turns when set', () => {
    const script = generateAgentScript({
      framework: 'claude-code',
      prompt: 'Fix bugs',
      maxTurns: 5,
    });
    expect(script).toContain('--max-turns 5');
  });

  test('includes max-budget when set', () => {
    const script = generateAgentScript({
      framework: 'claude-code',
      prompt: 'Fix bugs',
      maxBudgetUsd: 2.5,
    });
    expect(script).toContain('--max-budget-usd 2.5');
  });

  test('includes custom allowed tools', () => {
    const script = generateAgentScript({
      framework: 'claude-code',
      prompt: 'Fix bugs',
      allowedTools: ['Read', 'Bash'],
    });
    expect(script).toContain('--allowedTools "Read,Bash"');
  });

  test('includes model when set', () => {
    const script = generateAgentScript({
      framework: 'claude-code',
      prompt: 'Fix bugs',
      model: 'opus',
    });
    expect(script).toContain('--model opus');
  });

  test('installs claude code if not present', () => {
    const script = generateAgentScript({ framework: 'claude-code', prompt: 'test' });
    expect(script).toContain('claude.ai/install.sh');
  });
});
