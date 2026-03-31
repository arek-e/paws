import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';

import { getTemplates, deployTemplate, type DaemonTemplate } from '../api/client.js';
import { usePolling } from '../hooks/usePolling.js';
import { Alert, AlertDescription } from '../components/ui/alert.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent } from '../components/ui/card.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import { Skeleton } from '../components/ui/skeleton.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';

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
    <Badge className={`border ${cls}`}>{categoryLabels[category as Category] ?? category}</Badge>
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
        <Label className="text-xs text-zinc-500 mb-1">Role name</Label>
        <Input
          type="text"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="bg-zinc-800 border-zinc-700 text-zinc-100 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20"
        />
      </div>
      <div>
        <Label className="text-xs text-zinc-500 mb-1">Snapshot</Label>
        <Input
          type="text"
          value={snapshot}
          onChange={(e) => setSnapshot(e.target.value)}
          className="bg-zinc-800 border-zinc-700 text-zinc-100 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20"
        />
      </div>
      {trigger && (
        <div>
          <Label className="text-xs text-zinc-500 mb-1">Trigger</Label>
          <div className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-400">
            {trigger.type === 'schedule' && `Cron: ${trigger.cron}`}
            {trigger.type === 'webhook' && `Webhook: ${trigger.events?.join(', ')}`}
            {trigger.type === 'watch' && 'Watch'}
          </div>
        </div>
      )}
      {error && (
        <Alert variant="destructive" className="bg-red-400/10 border-red-400/20 px-3 py-2">
          <AlertDescription className="text-red-400 text-xs">{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-center gap-2">
        <Button
          onClick={handleDeploy}
          disabled={deploying || !role.trim()}
          className="bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          {deploying ? 'Deploying...' : 'Deploy'}
        </Button>
        <Button variant="ghost" onClick={onClose} className="text-zinc-400 hover:text-zinc-200">
          Cancel
        </Button>
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
    <Card
      className={`bg-zinc-900 gap-0 py-0 transition-colors ${expanded ? 'border-emerald-500/40' : 'border-zinc-800 hover:border-zinc-700'}`}
    >
      <CardContent className="p-4">
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
      </CardContent>
    </Card>
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
      <Tabs
        value={activeCategory}
        onValueChange={(val) => {
          setActiveCategory(val as Category);
          setExpandedId(null);
        }}
      >
        <TabsList variant="line" className="border-b border-zinc-800 pb-2 w-full justify-start">
          {(Object.keys(categoryLabels) as Category[]).map((cat) => (
            <TabsTrigger
              key={cat}
              value={cat}
              className="text-xs data-[state=active]:text-emerald-400"
            >
              {categoryLabels[cat]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {templates.loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-32 bg-zinc-800 rounded-lg" />
          ))}
        </div>
      ) : templates.error ? (
        <Alert variant="destructive" className="bg-red-400/10 border-red-400/20">
          <AlertDescription className="text-red-400 text-sm">
            Failed to load templates: {templates.error.message}
          </AlertDescription>
        </Alert>
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
        <Card className="bg-zinc-900 border-zinc-800 py-0">
          <CardContent className="p-8 text-center">
            <p className="text-zinc-500 text-sm">No templates found for this category.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
