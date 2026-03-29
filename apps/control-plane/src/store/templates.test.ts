import { describe, expect, test } from 'vitest';

import { createTemplateStore } from './templates.js';

describe('createTemplateStore', () => {
  test('list() returns all built-in templates', () => {
    const store = createTemplateStore();
    const all = store.list();
    expect(all.length).toBe(6);
    expect(all.map((t) => t.id)).toEqual([
      'pr-reviewer',
      'security-scan',
      'deploy-watcher',
      'issue-triage',
      'dependency-updater',
      'code-formatter',
    ]);
  });

  test('list() filters by category', () => {
    const store = createTemplateStore();
    const codeReview = store.list('code-review');
    expect(codeReview.length).toBe(2);
    expect(codeReview.map((t) => t.id)).toEqual(['pr-reviewer', 'code-formatter']);

    const devops = store.list('devops');
    expect(devops.length).toBe(2);
    expect(devops.map((t) => t.id)).toEqual(['deploy-watcher', 'dependency-updater']);

    const security = store.list('security');
    expect(security.length).toBe(1);
    expect(security[0]!.id).toBe('security-scan');

    const general = store.list('general');
    expect(general.length).toBe(1);
    expect(general[0]!.id).toBe('issue-triage');
  });

  test('get() returns template by id', () => {
    const store = createTemplateStore();
    const template = store.get('pr-reviewer');
    expect(template).toBeDefined();
    expect(template!.name).toBe('PR Reviewer');
    expect(template!.category).toBe('code-review');
    expect(template!.defaults).toHaveProperty('role', 'pr-reviewer');
    expect(template!.defaults).toHaveProperty('trigger');
  });

  test('get() returns undefined for unknown id', () => {
    const store = createTemplateStore();
    expect(store.get('nonexistent')).toBeUndefined();
  });

  test('all templates have required fields', () => {
    const store = createTemplateStore();
    for (const t of store.list()) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(['code-review', 'devops', 'security', 'general']).toContain(t.category);
      expect(t.icon).toBeTruthy();
      expect(t.defaults).toBeDefined();
      expect(t.defaults.role).toBeTruthy();
      expect(t.defaults.trigger).toBeDefined();
      // Each template must have either workload or agent
      expect(t.defaults.workload || t.defaults.agent).toBeTruthy();
    }
  });
});
