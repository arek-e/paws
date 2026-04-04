import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';

import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { Label } from './ui/label.js';
import { Textarea } from './ui/textarea.js';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from './ui/sheet.js';
import { Badge } from './ui/badge.js';
import { createDaemon, updateDaemon, getDaemonDetail, getSnapshotConfigs } from '../api/client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TriggerType = 'github' | 'webhook' | 'schedule' | 'watch';
type DaemonStatus = 'active' | 'paused' | 'stopped';

interface DaemonFormData {
  role: string;
  description: string;
  status: DaemonStatus;
  triggerType: TriggerType;
  // GitHub trigger
  githubRepos: string[];
  githubEvents: string[];
  githubCommand: string;
  // Webhook trigger
  webhookEvents: string[];
  webhookSecret: string;
  webhookSignatureScheme: 'hmac-sha256' | 'slack-v0' | 'none';
  webhookSignatureHeader: string;
  // Schedule trigger
  cron: string;
  // Watch trigger
  watchCondition: string;
  watchIntervalMs: number;
  // Execution
  snapshot: string;
  script: string;
  timeoutMs: number;
  vcpus: number;
  memoryMB: number;
  // Governance
  maxActionsPerHour: number;
  auditLog: boolean;
}

const DEFAULT_FORM: DaemonFormData = {
  role: '',
  description: '',
  status: 'active',
  triggerType: 'github',
  githubRepos: [],
  githubEvents: ['issue_comment'],
  githubCommand: '',
  webhookEvents: [],
  webhookSecret: '',
  webhookSignatureScheme: 'hmac-sha256',
  webhookSignatureHeader: 'x-hub-signature-256',
  cron: '',
  watchCondition: '',
  watchIntervalMs: 60000,
  snapshot: '',
  script: '',
  timeoutMs: 300000,
  vcpus: 2,
  memoryMB: 4096,
  maxActionsPerHour: 20,
  auditLog: true,
};

interface DaemonFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, form is in edit mode */
  editRole?: string | undefined;
  onSaved: () => void;
}

// ---------------------------------------------------------------------------
// GitHub event options
// ---------------------------------------------------------------------------

const GITHUB_EVENT_OPTIONS = [
  { value: 'pull_request.opened', label: 'PR opened' },
  { value: 'pull_request.synchronize', label: 'PR synchronized' },
  { value: 'pull_request.closed', label: 'PR closed' },
  { value: 'issue_comment', label: 'Issue comment' },
  { value: 'push', label: 'Push' },
  { value: 'issues.opened', label: 'Issue opened' },
];

// ---------------------------------------------------------------------------
// Tag Input
// ---------------------------------------------------------------------------

function TagInput({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault();
      const value = input.trim().replace(/,$/, '');
      if (value && !tags.includes(value)) {
        onChange([...tags, value]);
      }
      setInput('');
    }
    if (e.key === 'Backspace' && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <div className="flex flex-wrap gap-1.5 min-h-9 items-center rounded-3xl border border-transparent bg-input/50 px-3 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
      {tags.map((tag) => (
        <Badge
          key={tag}
          variant="outline"
          className="gap-1 bg-zinc-800 text-zinc-300 border-zinc-700 pr-1"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="text-zinc-500 hover:text-zinc-300"
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-24 bg-transparent text-sm text-zinc-100 placeholder-zinc-600 outline-none"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// DaemonForm
// ---------------------------------------------------------------------------

export function DaemonForm({ open, onOpenChange, editRole, onSaved }: DaemonFormProps) {
  const [form, setForm] = useState<DaemonFormData>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [snapshots, setSnapshots] = useState<string[]>([]);

  const isEdit = Boolean(editRole);

  // Fetch snapshots for dropdown
  useEffect(() => {
    if (!open) return;
    getSnapshotConfigs()
      .then((configs) => setSnapshots(configs.map((c) => c.id)))
      .catch(() => {
        // Silently fail - user can type manually
      });
  }, [open]);

  // Load daemon data when editing
  useEffect(() => {
    if (!open || !editRole) {
      if (!editRole) setForm(DEFAULT_FORM);
      return;
    }
    setLoading(true);
    getDaemonDetail(editRole)
      .then((daemon) => {
        // eslint-disable-next-line typescript/no-explicit-any
        const trigger = daemon.trigger as Record<string, any>;
        const triggerType = trigger.type as TriggerType;
        const partial: Partial<DaemonFormData> = {
          role: daemon.role as string,
          description: (daemon.description as string) ?? '',
          status: daemon.status as DaemonStatus,
          triggerType,
        };

        if (triggerType === 'github') {
          partial.githubRepos = (trigger.repos as string[]) ?? [];
          partial.githubEvents = (trigger.events as string[]) ?? ['issue_comment'];
          partial.githubCommand = (trigger.command as string) ?? '';
        } else if (triggerType === 'webhook') {
          partial.webhookEvents = (trigger.events as string[]) ?? [];
          partial.webhookSecret = (trigger.secret as string) ?? '';
          partial.webhookSignatureScheme =
            (trigger.signatureScheme as 'hmac-sha256' | 'slack-v0' | 'none') ?? 'hmac-sha256';
          partial.webhookSignatureHeader =
            (trigger.signatureHeader as string) ?? 'x-hub-signature-256';
        } else if (triggerType === 'schedule') {
          partial.cron = trigger.cron as string;
        } else if (triggerType === 'watch') {
          partial.watchCondition = trigger.condition as string;
          partial.watchIntervalMs = (trigger.intervalMs as number) ?? 60000;
        }

        setForm({ ...DEFAULT_FORM, ...partial });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        toast.error(`Failed to load daemon: ${message}`);
      })
      .finally(() => setLoading(false));
  }, [open, editRole]);

  function update<K extends keyof DaemonFormData>(key: K, value: DaemonFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function buildTrigger() {
    switch (form.triggerType) {
      case 'github':
        return {
          type: 'github' as const,
          repos: form.githubRepos,
          events: form.githubEvents,
          ...(form.githubCommand ? { command: form.githubCommand } : {}),
        };
      case 'webhook':
        return {
          type: 'webhook' as const,
          events: form.webhookEvents,
          signatureScheme: form.webhookSignatureScheme,
          ...(form.webhookSecret ? { secret: form.webhookSecret } : {}),
          ...(form.webhookSignatureHeader ? { signatureHeader: form.webhookSignatureHeader } : {}),
        };
      case 'schedule':
        return {
          type: 'schedule' as const,
          cron: form.cron,
        };
      case 'watch':
        return {
          type: 'watch' as const,
          condition: form.watchCondition,
          intervalMs: form.watchIntervalMs,
        };
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const trigger = buildTrigger();

      if (isEdit && editRole) {
        await updateDaemon(editRole, {
          description: form.description,
          trigger,
          ...(form.script
            ? { workload: { type: 'script' as const, script: form.script, env: {} } }
            : {}),
          resources: { vcpus: form.vcpus, memoryMB: form.memoryMB },
          governance: {
            maxActionsPerHour: form.maxActionsPerHour,
            requiresApproval: [],
            auditLog: form.auditLog,
          },
        });
        toast.success(`Daemon "${editRole}" updated`);
      } else {
        await createDaemon({
          role: form.role,
          description: form.description,
          snapshot: form.snapshot,
          trigger,
          workload: { type: 'script' as const, script: form.script, env: {} },
          resources: { vcpus: form.vcpus, memoryMB: form.memoryMB },
          governance: {
            maxActionsPerHour: form.maxActionsPerHour,
            requiresApproval: [],
            auditLog: form.auditLog,
          },
        });
        toast.success(`Daemon "${form.role}" created`);
      }

      onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  const isValid =
    form.role.length > 0 &&
    form.snapshot.length > 0 &&
    form.script.length > 0 &&
    (form.triggerType !== 'github' || form.githubRepos.length > 0) &&
    (form.triggerType !== 'schedule' || form.cron.length > 0) &&
    (form.triggerType !== 'watch' || form.watchCondition.length > 0);

  const triggerTypes: { value: TriggerType; label: string }[] = [
    { value: 'github', label: 'GitHub' },
    { value: 'webhook', label: 'Webhook' },
    { value: 'schedule', label: 'Schedule' },
    { value: 'watch', label: 'Watch' },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit Daemon' : 'Create Daemon'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? 'Update daemon configuration'
              : 'Configure a persistent agent role that responds to triggers'}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="p-6 text-sm text-zinc-500">Loading...</div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-6 px-6 pb-6">
            {/* Basic */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Basic
              </h3>
              <div>
                <Label className="text-xs text-zinc-400 mb-1">Role</Label>
                <Input
                  type="text"
                  value={form.role}
                  onChange={(e) => update('role', e.target.value)}
                  placeholder="code-reviewer"
                  required
                  disabled={isEdit}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
                />
                <p className="text-xs text-zinc-600 mt-1">Unique identifier for this daemon</p>
              </div>
              <div>
                <Label className="text-xs text-zinc-400 mb-1">Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => update('description', e.target.value)}
                  placeholder="Reviews PRs for code quality and security issues"
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
                />
              </div>
              {isEdit && (
                <div>
                  <Label className="text-xs text-zinc-400 mb-1">Status</Label>
                  <select
                    value={form.status}
                    onChange={(e) => update('status', e.target.value as DaemonStatus)}
                    className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-3xl text-zinc-100 focus:outline-none focus:border-emerald-400/50"
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="stopped">Stopped</option>
                  </select>
                </div>
              )}
            </section>

            {/* Trigger */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Trigger
              </h3>
              <div>
                <Label className="text-xs text-zinc-400 mb-1">Type</Label>
                <div className="flex gap-1.5">
                  {triggerTypes.map((tt) => (
                    <button
                      key={tt.value}
                      type="button"
                      onClick={() => update('triggerType', tt.value)}
                      className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                        form.triggerType === tt.value
                          ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/30'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      {tt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* GitHub trigger fields */}
              {form.triggerType === 'github' && (
                <>
                  <div>
                    <Label className="text-xs text-zinc-400 mb-1">Repositories</Label>
                    <TagInput
                      tags={form.githubRepos}
                      onChange={(repos) => update('githubRepos', repos)}
                      placeholder="org/repo (press Enter to add)"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-400 mb-1">Events</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {GITHUB_EVENT_OPTIONS.map((opt) => (
                        <label
                          key={opt.value}
                          className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={form.githubEvents.includes(opt.value)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                update('githubEvents', [...form.githubEvents, opt.value]);
                              } else {
                                update(
                                  'githubEvents',
                                  form.githubEvents.filter((ev) => ev !== opt.value),
                                );
                              }
                            }}
                            className="rounded border-zinc-600 bg-zinc-800 text-emerald-400 focus:ring-emerald-400/30"
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-400 mb-1">Command (optional)</Label>
                    <Input
                      type="text"
                      value={form.githubCommand}
                      onChange={(e) => update('githubCommand', e.target.value)}
                      placeholder="@paws review"
                      className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
                    />
                    <p className="text-xs text-zinc-600 mt-1">
                      Trigger word for @paws mentions in comments
                    </p>
                  </div>
                </>
              )}

              {/* Webhook trigger fields */}
              {form.triggerType === 'webhook' && (
                <>
                  <div>
                    <Label className="text-xs text-zinc-400 mb-1">Events</Label>
                    <TagInput
                      tags={form.webhookEvents}
                      onChange={(events) => update('webhookEvents', events)}
                      placeholder="push, pull_request (press Enter)"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-400 mb-1">Signature scheme</Label>
                    <select
                      value={form.webhookSignatureScheme}
                      onChange={(e) =>
                        update(
                          'webhookSignatureScheme',
                          e.target.value as DaemonFormData['webhookSignatureScheme'],
                        )
                      }
                      className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-3xl text-zinc-100 focus:outline-none focus:border-emerald-400/50"
                    >
                      <option value="hmac-sha256">HMAC-SHA256</option>
                      <option value="slack-v0">Slack v0</option>
                      <option value="none">None</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-400 mb-1">Secret</Label>
                    <Input
                      type="password"
                      value={form.webhookSecret}
                      onChange={(e) => update('webhookSecret', e.target.value)}
                      placeholder="webhook secret"
                      className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-400 mb-1">Signature header</Label>
                    <Input
                      type="text"
                      value={form.webhookSignatureHeader}
                      onChange={(e) => update('webhookSignatureHeader', e.target.value)}
                      placeholder="x-hub-signature-256"
                      className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
                    />
                  </div>
                </>
              )}

              {/* Schedule trigger fields */}
              {form.triggerType === 'schedule' && (
                <div>
                  <Label className="text-xs text-zinc-400 mb-1">Cron expression</Label>
                  <Input
                    type="text"
                    value={form.cron}
                    onChange={(e) => update('cron', e.target.value)}
                    placeholder="0 */6 * * *"
                    required
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 font-mono focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
                  />
                  <p className="text-xs text-zinc-600 mt-1">
                    Standard cron syntax (minute hour day month weekday)
                  </p>
                </div>
              )}

              {/* Watch trigger fields */}
              {form.triggerType === 'watch' && (
                <>
                  <div>
                    <Label className="text-xs text-zinc-400 mb-1">Condition</Label>
                    <Input
                      type="text"
                      value={form.watchCondition}
                      onChange={(e) => update('watchCondition', e.target.value)}
                      placeholder="file changed, health check failed"
                      required
                      className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-400 mb-1">Poll interval (ms)</Label>
                    <Input
                      type="number"
                      value={form.watchIntervalMs}
                      onChange={(e) => update('watchIntervalMs', Number(e.target.value))}
                      min={5000}
                      step={1000}
                      className="bg-zinc-800 border-zinc-700 text-zinc-100 focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
                    />
                  </div>
                </>
              )}
            </section>

            {/* Execution */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Execution
              </h3>
              <div>
                <Label className="text-xs text-zinc-400 mb-1">Snapshot</Label>
                {snapshots.length > 0 ? (
                  <select
                    value={form.snapshot}
                    onChange={(e) => update('snapshot', e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-3xl text-zinc-100 focus:outline-none focus:border-emerald-400/50"
                  >
                    <option value="">Select a snapshot...</option>
                    {snapshots.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    type="text"
                    value={form.snapshot}
                    onChange={(e) => update('snapshot', e.target.value)}
                    placeholder="agent-default"
                    required
                    disabled={isEdit}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
                  />
                )}
                <p className="text-xs text-zinc-600 mt-1">
                  VM snapshot to restore for each session
                </p>
              </div>
              <div>
                <Label className="text-xs text-zinc-400 mb-1">Script</Label>
                <Textarea
                  value={form.script}
                  onChange={(e) => update('script', e.target.value)}
                  placeholder="#!/bin/bash&#10;cd /workspace&#10;# your agent script here"
                  required
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 font-mono text-xs min-h-24 focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-zinc-400 mb-1">Timeout (ms)</Label>
                  <Input
                    type="number"
                    value={form.timeoutMs}
                    onChange={(e) => update('timeoutMs', Number(e.target.value))}
                    min={1000}
                    step={1000}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
                  />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400 mb-1">vCPUs</Label>
                  <Input
                    type="number"
                    value={form.vcpus}
                    onChange={(e) => update('vcpus', Number(e.target.value))}
                    min={1}
                    max={8}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
                  />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400 mb-1">Memory (MB)</Label>
                  <Input
                    type="number"
                    value={form.memoryMB}
                    onChange={(e) => update('memoryMB', Number(e.target.value))}
                    min={256}
                    max={16384}
                    step={256}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
                  />
                </div>
              </div>
            </section>

            {/* Governance */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Governance
              </h3>
              <div>
                <Label className="text-xs text-zinc-400 mb-1">Max actions per hour</Label>
                <Input
                  type="number"
                  value={form.maxActionsPerHour}
                  onChange={(e) => update('maxActionsPerHour', Number(e.target.value))}
                  min={1}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.auditLog}
                  onChange={(e) => update('auditLog', e.target.checked)}
                  className="rounded border-zinc-600 bg-zinc-800 text-emerald-400 focus:ring-emerald-400/30"
                />
                Enable audit logging
              </label>
            </section>

            {/* Submit */}
            <SheetFooter className="mt-0 p-0">
              <Button
                type="submit"
                disabled={saving || !isValid}
                className="w-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
              >
                {saving ? 'Saving...' : isEdit ? 'Update Daemon' : 'Create Daemon'}
              </Button>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
