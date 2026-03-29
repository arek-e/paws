import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';

import { getTemplates, deployTemplate, type DaemonTemplate } from '../api/client.js';
import { usePolling } from '../hooks/usePolling.js';

type Category = 'all' | 'code-review' | 'devops' | 'security' | 'general';

const categoryLabels: Record<Category, string> = {
  all: 'All',
  'code-review': 'Code Review',
  devops: 'DevOps',
  security: 'Security',
  general: 'General',
};

const categoryColors: Record<string, string> = {
  'code-review': 'bg-blue-400/10 text-blue-400 border-blue-400/20',
  devops: 'bg-purple-400/10 text-purple-400 border-purple-400/20',
  security: 'bg-red-400/10 text-red-400 border-red-400/20',
  general: 'bg-zinc-400/10 text-zinc-400 border-zinc-400/20',
};

function CategoryBadge({ category }: { category: string }) {
  const cls = categoryColors[category] ?? 'bg-zinc-400/10 text-zinc-400 border-zinc-400/20';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}
    >
      {categoryLabels[category as Category] ?? category}
    </span>
  );
}

function DeployForm({ template, onClose }: { template: DaemonTemplate; onClose: () => void }) {
  const navigate = useNavigate();
  const defaults = template.defaults as Record<string, unknown>;
  const [role, setRole] = useState((defaults.role as string) ?? template.id);
  const [snapshot, setSnapshot] = useState((defaults.snapshot as string) ?? 'agent-default');
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDeploy() {
    setDeploying(true);
    setError(null);
    try {
      await deployTemplate(template.id, { role, snapshot });
      navigate({ to: '/daemons' });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeploying(false);
    }
  }

  const trigger = defaults.trigger as
    | { type: string; cron?: string; events?: string[] }
    | undefined;

  return (
    <div className="mt-3 border-t border-zinc-800 pt-3 space-y-3">
      <div>
        <label className="block text-xs text-zinc-500 mb-1">Role name</label>
        <input
          type="text"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500"
        />
      </div>
      <div>
        <label className="block text-xs text-zinc-500 mb-1">Snapshot</label>
        <input
          type="text"
          value={snapshot}
          onChange={(e) => setSnapshot(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500"
        />
      </div>
      {trigger && (
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Trigger</label>
          <div className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-400">
            {trigger.type === 'schedule' && `Cron: ${trigger.cron}`}
            {trigger.type === 'webhook' && `Webhook: ${trigger.events?.join(', ')}`}
            {trigger.type === 'watch' && 'Watch'}
          </div>
        </div>
      )}
      {error && (
        <div className="bg-red-400/10 border border-red-400/20 rounded px-3 py-2 text-red-400 text-xs">
          {error}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={handleDeploy}
          disabled={deploying || !role.trim()}
          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm rounded transition-colors"
        >
          {deploying ? 'Deploying...' : 'Deploy'}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-1.5 text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  expanded,
  onToggle,
}: {
  template: DaemonTemplate;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`bg-zinc-900 border rounded-lg p-4 transition-colors ${expanded ? 'border-emerald-500/40' : 'border-zinc-800 hover:border-zinc-700'}`}
    >
      <button onClick={onToggle} className="w-full text-left">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">{template.icon}</span>
            <h3 className="text-sm font-semibold text-zinc-100">{template.name}</h3>
          </div>
          <CategoryBadge category={template.category} />
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">{template.description}</p>
      </button>
      {expanded && <DeployForm template={template} onClose={onToggle} />}
    </div>
  );
}

export function Templates() {
  const [activeCategory, setActiveCategory] = useState<Category>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const templates = usePolling(
    () => getTemplates(activeCategory === 'all' ? undefined : activeCategory),
    30_000,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Daemon Templates</h1>
        <p className="text-xs text-zinc-500">Pre-built agent configurations</p>
      </div>

      {/* Category filter tabs */}
      <div className="flex gap-1 border-b border-zinc-800 pb-2">
        {(Object.keys(categoryLabels) as Category[]).map((cat) => (
          <button
            key={cat}
            onClick={() => {
              setActiveCategory(cat);
              setExpandedId(null);
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeCategory === cat
                ? 'bg-zinc-800 text-emerald-400'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
            }`}
          >
            {categoryLabels[cat]}
          </button>
        ))}
      </div>

      {templates.loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 h-32 animate-pulse"
            />
          ))}
        </div>
      ) : templates.error ? (
        <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-4 text-red-400 text-sm">
          Failed to load templates: {templates.error.message}
        </div>
      ) : templates.data && templates.data.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.data.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              expanded={expandedId === t.id}
              onToggle={() => setExpandedId(expandedId === t.id ? null : t.id)}
            />
          ))}
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
          <p className="text-zinc-500 text-sm">No templates found for this category.</p>
        </div>
      )}
    </div>
  );
}
