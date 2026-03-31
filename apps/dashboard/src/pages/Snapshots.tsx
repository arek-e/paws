import { useState } from 'react';
import { toast } from 'sonner';

import { getSnapshotConfigs, createSnapshotConfig, buildSnapshot } from '../api/client.js';
import { usePolling } from '../hooks/usePolling.js';
import type { SnapshotConfig, SnapshotTemplateId } from '@paws/domain-snapshot';
import { getTemplate, listTemplateIds } from '@paws/domain-snapshot';
import { Alert, AlertDescription } from '../components/ui/alert.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent } from '../components/ui/card.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import { Skeleton } from '../components/ui/skeleton.js';
import { Textarea } from '../components/ui/textarea.js';

const STATUS_COLORS: Record<string, string> = {
  building: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
  ready: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
  failed: 'bg-red-400/10 text-red-400 border-red-400/20',
};

export function Snapshots() {
  const configs = usePolling(getSnapshotConfigs, 5000);
  const [showCreate, setShowCreate] = useState(false);
  const [newId, setNewId] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<SnapshotTemplateId | ''>('');
  const [setupScript, setSetupScript] = useState('');
  const [creating, setCreating] = useState(false);
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [buildStatus, setBuildStatus] = useState<string | null>(null);

  function handleTemplateChange(templateId: string) {
    setSelectedTemplate(templateId as SnapshotTemplateId);
    if (templateId && templateId !== '') {
      const tmpl = getTemplate(templateId as SnapshotTemplateId);
      setSetupScript(tmpl.setup);
    }
  }

  async function handleCreate() {
    if (!newId.trim() || !setupScript.trim()) return;
    setCreating(true);
    try {
      const template = selectedTemplate || undefined;
      const requiredDomains = template ? getTemplate(template).requiredDomains : [];
      await createSnapshotConfig({
        id: newId.trim(),
        template,
        setup: setupScript,
        requiredDomains,
      });
      toast.success('Snapshot config created');
      setShowCreate(false);
      setNewId('');
      setSetupScript('');
      setSelectedTemplate('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create snapshot config');
      console.error('Failed to create snapshot config:', err);
    } finally {
      setCreating(false);
    }
  }

  async function handleBuild(id: string) {
    setBuildingId(id);
    setBuildStatus('building');
    try {
      await buildSnapshot(id);
      setBuildStatus('ready');
      toast.success('Build started');
    } catch {
      setBuildStatus('failed');
      toast.error('Build failed');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Snapshots</h1>
        <Button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          {showCreate ? 'Cancel' : 'New Config'}
        </Button>
      </div>

      {showCreate && (
        <Card className="bg-zinc-900 border-zinc-800 gap-0 py-0">
          <CardContent className="p-4 space-y-4">
            <div>
              <Label className="text-xs text-zinc-500 mb-1">Snapshot ID</Label>
              <Input
                type="text"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder="e.g., docker-ready"
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20"
              />
            </div>

            <div>
              <Label className="text-xs text-zinc-500 mb-1">Template</Label>
              <select
                value={selectedTemplate}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500"
              >
                <option value="">Custom (no template)</option>
                {listTemplateIds().map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-xs text-zinc-500 mb-1">Setup Script</Label>
              <Textarea
                value={setupScript}
                onChange={(e) => setSetupScript(e.target.value)}
                rows={12}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 font-mono placeholder-zinc-600 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20 resize-y"
                placeholder="#!/bin/bash&#10;apt-get update&#10;..."
              />
            </div>

            <Button
              onClick={handleCreate}
              disabled={creating || !newId.trim() || !setupScript.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {creating ? 'Creating...' : 'Create'}
            </Button>
          </CardContent>
        </Card>
      )}

      {configs.loading && !configs.data ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-24 bg-zinc-800 rounded-lg" />
          ))}
        </div>
      ) : configs.error ? (
        <Alert variant="destructive" className="bg-red-400/10 border-red-400/20">
          <AlertDescription className="text-red-400 text-sm">
            Failed to load snapshot configs: {configs.error.message}
          </AlertDescription>
        </Alert>
      ) : configs.data?.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800 py-0">
          <CardContent className="p-8 text-center">
            <pre className="text-zinc-600 text-xs mb-3">
              {` /\\_/\\
( o.o )  no snapshots yet
 > ^ <`}
            </pre>
            <p className="text-zinc-500 text-sm">Create a snapshot config to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {configs.data?.map((config: SnapshotConfig) => (
            <Card key={config.id} className="bg-zinc-900 border-zinc-800 gap-0 py-0">
              <CardContent className="p-4 space-y-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-zinc-100">{config.id}</h3>
                    {config.template && (
                      <Badge
                        variant="outline"
                        className="bg-zinc-800 text-zinc-400 border-zinc-700 rounded-full"
                      >
                        {config.template}
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleBuild(config.id)}
                    disabled={buildingId === config.id && buildStatus === 'building'}
                    className="bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300"
                  >
                    {buildingId === config.id && buildStatus === 'building'
                      ? 'Building...'
                      : 'Build'}
                  </Button>
                </div>

                {buildingId === config.id && buildStatus && (
                  <div className="mb-2">
                    <Badge
                      className={`rounded-full border ${STATUS_COLORS[buildStatus] ?? 'bg-zinc-800 text-zinc-400'}`}
                    >
                      {buildStatus}
                    </Badge>
                  </div>
                )}

                <pre className="text-xs text-zinc-500 font-mono bg-zinc-800/50 rounded p-2 max-h-32 overflow-y-auto">
                  {config.setup.slice(0, 300)}
                  {config.setup.length > 300 ? '...' : ''}
                </pre>

                {config.requiredDomains.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {config.requiredDomains.map((domain) => (
                      <Badge
                        key={domain}
                        variant="secondary"
                        className="bg-zinc-800 text-zinc-500 rounded"
                      >
                        {domain}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
