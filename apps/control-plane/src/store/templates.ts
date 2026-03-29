import type { CreateDaemonRequest } from '@paws/types';

export type TemplateCategory = 'code-review' | 'devops' | 'security' | 'general';

export interface DaemonTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  icon: string;
  defaults: Partial<CreateDaemonRequest>;
}

const builtinTemplates: DaemonTemplate[] = [
  {
    id: 'pr-reviewer',
    name: 'PR Reviewer',
    description:
      'Automatically reviews pull requests with Claude Code. Analyzes code quality, catches bugs, and suggests improvements on every PR.',
    category: 'code-review',
    icon: '\uD83D\uDD0D',
    defaults: {
      role: 'pr-reviewer',
      description: 'Reviews pull requests with Claude Code',
      snapshot: 'agent-default',
      trigger: {
        type: 'webhook',
        events: ['pull_request.opened', 'pull_request.synchronize'],
      },
      agent: {
        framework: 'claude-code',
        model: 'claude-sonnet-4-20250514',
        prompt:
          'Review this pull request. Analyze code quality, identify potential bugs, suggest improvements, and provide a summary.',
        maxTurns: 10,
      },
      governance: {
        requiresApproval: [],
        auditLog: true,
      },
    },
  },
  {
    id: 'security-scan',
    name: 'Scheduled Security Scan',
    description:
      'Runs a weekly security audit of your codebase. Checks for known vulnerabilities, outdated dependencies, and common security anti-patterns.',
    category: 'security',
    icon: '\uD83D\uDEE1\uFE0F',
    defaults: {
      role: 'security-scan',
      description: 'Weekly security audit of the codebase',
      snapshot: 'agent-default',
      trigger: {
        type: 'schedule',
        cron: '0 9 * * 1',
      },
      workload: {
        type: 'script',
        script:
          'npm audit --json > /output/audit.json && npx snyk test --json > /output/snyk.json || true',
        env: {},
      },
      governance: {
        requiresApproval: [],
        auditLog: true,
      },
    },
  },
  {
    id: 'deploy-watcher',
    name: 'Deploy Watcher',
    description:
      'Monitors pushes to the main branch and runs deployment scripts. Verifies the deployment succeeds and reports back.',
    category: 'devops',
    icon: '\uD83D\uDE80',
    defaults: {
      role: 'deploy-watcher',
      description: 'Runs deployment on push to main',
      snapshot: 'agent-default',
      trigger: {
        type: 'webhook',
        events: ['push.main'],
      },
      workload: {
        type: 'script',
        script: './scripts/deploy.sh',
        env: {},
      },
      governance: {
        requiresApproval: ['deploy'],
        auditLog: true,
      },
    },
  },
  {
    id: 'issue-triage',
    name: 'Issue Triage',
    description:
      'Automatically classifies and labels new issues. Uses Claude to understand the issue, assign priority, and add relevant labels.',
    category: 'general',
    icon: '\uD83C\uDFF7\uFE0F',
    defaults: {
      role: 'issue-triage',
      description: 'Classifies and labels new issues',
      snapshot: 'agent-default',
      trigger: {
        type: 'webhook',
        events: ['issues.opened'],
      },
      agent: {
        framework: 'claude-code',
        model: 'claude-sonnet-4-20250514',
        prompt:
          'Triage this issue. Classify it as bug/feature/question, assign a priority (P0-P3), and suggest relevant labels.',
        maxTurns: 5,
      },
      governance: {
        requiresApproval: [],
        auditLog: true,
      },
    },
  },
  {
    id: 'dependency-updater',
    name: 'Dependency Updater',
    description:
      'Checks for outdated dependencies on a weekly schedule. Creates a summary of available updates with changelogs and breaking change warnings.',
    category: 'devops',
    icon: '\uD83D\uDCE6',
    defaults: {
      role: 'dependency-updater',
      description: 'Weekly dependency update check',
      snapshot: 'agent-default',
      trigger: {
        type: 'schedule',
        cron: '0 8 * * 3',
      },
      agent: {
        framework: 'claude-code',
        model: 'claude-sonnet-4-20250514',
        prompt:
          'Check for outdated dependencies. List available updates, note breaking changes, and create a summary report.',
        maxTurns: 15,
      },
      governance: {
        requiresApproval: [],
        auditLog: true,
      },
    },
  },
  {
    id: 'code-formatter',
    name: 'Code Formatter',
    description:
      'Runs linting and formatting checks on pull requests. Auto-fixes style issues and reports any remaining problems.',
    category: 'code-review',
    icon: '\u2728',
    defaults: {
      role: 'code-formatter',
      description: 'Linting and formatting on PRs',
      snapshot: 'agent-default',
      trigger: {
        type: 'webhook',
        events: ['pull_request.opened', 'pull_request.synchronize'],
      },
      workload: {
        type: 'script',
        script: 'npm run lint -- --fix && npm run format && git diff --stat > /output/result.json',
        env: {},
      },
      governance: {
        requiresApproval: [],
        auditLog: true,
      },
    },
  },
];

export interface TemplateStore {
  list(category?: TemplateCategory): DaemonTemplate[];
  get(id: string): DaemonTemplate | undefined;
}

export function createTemplateStore(): TemplateStore {
  const templates = new Map<string, DaemonTemplate>();
  for (const t of builtinTemplates) {
    templates.set(t.id, t);
  }

  return {
    list(category) {
      const all = [...templates.values()];
      if (category) return all.filter((t) => t.category === category);
      return all;
    },
    get(id) {
      return templates.get(id);
    },
  };
}
