import { useState } from 'react';

import { getSnapshotConfigs, createSnapshotConfig, buildSnapshot } from '../api/client.js';
import { usePolling } from '../hooks/usePolling.js';
import type { SnapshotConfig, SnapshotTemplateId } from '@paws/types';
import { getTemplate, listTemplateIds } from '@paws/types';

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
      setShowCreate(false);
      setNewId('');
      setSetupScript('');
      setSelectedTemplate('');
    } catch (err) {
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
    } catch {
      setBuildStatus('failed');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Snapshots</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition-colors"
        >
          {showCreate ? 'Cancel' : 'New Config'}
        </button>
      </div>

      {showCreate && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-4">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Snapshot ID</label>
            <input
              type="text"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="e.g., docker-ready"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-500 block mb-1">Template</label>
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
            <label className="text-xs text-zinc-500 block mb-1">Setup Script</label>
            <textarea
              value={setupScript}
              onChange={(e) => setSetupScript(e.target.value)}
              rows={12}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 font-mono placeholder-zinc-600 focus:outline-none focus:border-emerald-500 resize-y"
              placeholder="#!/bin/bash&#10;apt-get update&#10;..."
            />
          </div>

          <button
            onClick={handleCreate}
            disabled={creating || !newId.trim() || !setupScript.trim()}
            className="px-4 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md transition-colors"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      )}

      {configs.loading && !configs.data ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 animate-pulse h-24"
            />
          ))}
        </div>
      ) : configs.error ? (
        <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-4 text-red-400 text-sm">
          Failed to load snapshot configs: {configs.error.message}
        </div>
      ) : configs.data?.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
          <pre className="text-zinc-600 text-xs mb-3">
            {` /\\_/\\
( o.o )  no snapshots yet
 > ^ <`}
          </pre>
          <p className="text-zinc-500 text-sm">Create a snapshot config to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {configs.data?.map((config: SnapshotConfig) => (
            <div key={config.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-zinc-100">{config.id}</h3>
                  {config.template && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                      {config.template}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleBuild(config.id)}
                  disabled={buildingId === config.id && buildStatus === 'building'}
                  className="px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded transition-colors disabled:opacity-50"
                >
                  {buildingId === config.id && buildStatus === 'building' ? 'Building...' : 'Build'}
                </button>
              </div>

              {buildingId === config.id && buildStatus && (
                <div className="mb-2">
                  <span
                    className={`inline-flex px-2 py-0.5 text-xs rounded-full border ${STATUS_COLORS[buildStatus] ?? 'bg-zinc-800 text-zinc-400'}`}
                  >
                    {buildStatus}
                  </span>
                </div>
              )}

              <pre className="text-xs text-zinc-500 font-mono bg-zinc-800/50 rounded p-2 max-h-32 overflow-y-auto">
                {config.setup.slice(0, 300)}
                {config.setup.length > 300 ? '...' : ''}
              </pre>

              {config.requiredDomains.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {config.requiredDomains.map((domain) => (
                    <span
                      key={domain}
                      className="px-1.5 py-0.5 text-xs rounded bg-zinc-800 text-zinc-500"
                    >
                      {domain}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
