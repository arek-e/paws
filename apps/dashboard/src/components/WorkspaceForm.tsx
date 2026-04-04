import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';

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
import {
  createWorkspace,
  updateWorkspace,
  getWorkspace,
  type WorkspaceRepo,
} from '../api/client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WorkspaceType = 'monorepo' | 'multi-repo';

interface WorkspaceFormData {
  name: string;
  description: string;
  type: WorkspaceType;
  // Monorepo fields
  monoRepo: string;
  monoRootDir: string;
  monoBranch: string;
  // Multi-repo fields
  repos: Array<{ name: string; role: 'primary' | 'reference'; branch: string }>;
  // Settings
  language: string;
  packageManager: string;
  testCommand: string;
  buildCommand: string;
}

const DEFAULT_FORM: WorkspaceFormData = {
  name: '',
  description: '',
  type: 'monorepo',
  monoRepo: '',
  monoRootDir: '',
  monoBranch: 'main',
  repos: [{ name: '', role: 'primary', branch: 'main' }],
  language: '',
  packageManager: '',
  testCommand: '',
  buildCommand: '',
};

const PACKAGE_MANAGERS = [
  { value: '', label: 'Select...' },
  { value: 'bun', label: 'bun' },
  { value: 'npm', label: 'npm' },
  { value: 'pnpm', label: 'pnpm' },
  { value: 'yarn', label: 'yarn' },
  { value: 'go', label: 'go' },
  { value: 'cargo', label: 'cargo' },
  { value: 'pip', label: 'pip' },
];

interface WorkspaceFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editId?: string | undefined;
  onSaved: () => void;
}

// ---------------------------------------------------------------------------
// WorkspaceForm
// ---------------------------------------------------------------------------

export function WorkspaceForm({ open, onOpenChange, editId, onSaved }: WorkspaceFormProps) {
  const [form, setForm] = useState<WorkspaceFormData>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isEdit = Boolean(editId);

  // Load workspace data when editing
  useEffect(() => {
    if (!open || !editId) {
      if (!editId) setForm(DEFAULT_FORM);
      return;
    }
    setLoading(true);
    getWorkspace(editId)
      .then((ws) => {
        const partial: Partial<WorkspaceFormData> = {
          name: ws.name,
          description: ws.description ?? '',
          type: ws.type,
        };

        if (ws.type === 'monorepo') {
          const repo = ws.repos[0];
          partial.monoRepo = repo?.name ?? '';
          partial.monoRootDir = ws.rootDir ?? '';
          partial.monoBranch = repo?.branch ?? 'main';
        } else {
          partial.repos = ws.repos.map((r) => ({
            name: r.name,
            role: r.role ?? 'primary',
            branch: r.branch ?? 'main',
          }));
        }

        if (ws.settings) {
          partial.language = ws.settings.language ?? '';
          partial.packageManager = ws.settings.packageManager ?? '';
          partial.testCommand = ws.settings.testCommand ?? '';
          partial.buildCommand = ws.settings.buildCommand ?? '';
          // Auto-open settings if any are set
          if (
            ws.settings.language ||
            ws.settings.packageManager ||
            ws.settings.testCommand ||
            ws.settings.buildCommand
          ) {
            setSettingsOpen(true);
          }
        }

        setForm({ ...DEFAULT_FORM, ...partial });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        toast.error(`Failed to load workspace: ${message}`);
      })
      .finally(() => setLoading(false));
  }, [open, editId]);

  function update<K extends keyof WorkspaceFormData>(key: K, value: WorkspaceFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateRepo(index: number, field: 'name' | 'role' | 'branch', value: string) {
    setForm((prev) => {
      const repos = [...prev.repos];
      const repo = repos[index];
      if (!repo) return prev;
      repos[index] = {
        ...repo,
        [field]: field === 'role' ? (value as 'primary' | 'reference') : value,
      };
      return { ...prev, repos };
    });
  }

  function addRepo() {
    setForm((prev) => ({
      ...prev,
      repos: [...prev.repos, { name: '', role: 'reference' as const, branch: 'main' }],
    }));
  }

  function removeRepo(index: number) {
    setForm((prev) => ({
      ...prev,
      repos: prev.repos.filter((_, i) => i !== index),
    }));
  }

  function buildPayload() {
    const repos: WorkspaceRepo[] =
      form.type === 'monorepo'
        ? [
            {
              name: form.monoRepo,
              role: 'primary',
              ...(form.monoBranch ? { branch: form.monoBranch } : {}),
            },
          ]
        : form.repos
            .filter((r) => r.name.trim() !== '')
            .map((r) => ({
              name: r.name,
              role: r.role,
              ...(r.branch ? { branch: r.branch } : {}),
            }));

    const settings: Record<string, string> = {};
    if (form.language) settings.language = form.language;
    if (form.packageManager) settings.packageManager = form.packageManager;
    if (form.testCommand) settings.testCommand = form.testCommand;
    if (form.buildCommand) settings.buildCommand = form.buildCommand;

    return {
      name: form.name,
      ...(form.description ? { description: form.description } : {}),
      type: form.type,
      repos,
      ...(form.type === 'monorepo' && form.monoRootDir ? { rootDir: form.monoRootDir } : {}),
      ...(Object.keys(settings).length > 0 ? { settings } : {}),
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const payload = buildPayload();

      if (isEdit && editId) {
        await updateWorkspace(editId, payload);
        toast.success(`Workspace "${form.name}" updated`);
      } else {
        await createWorkspace(payload);
        toast.success(`Workspace "${form.name}" created`);
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

  const hasRepos =
    form.type === 'monorepo'
      ? form.monoRepo.trim().length > 0
      : form.repos.some((r) => r.name.trim().length > 0);

  const isValid = form.name.length > 0 && hasRepos;

  const typeOptions: { value: WorkspaceType; label: string }[] = [
    { value: 'monorepo', label: 'Monorepo' },
    { value: 'multi-repo', label: 'Multi-repo' },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit Workspace' : 'Create Workspace'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? 'Update workspace configuration'
              : 'Configure a workspace to group related repositories'}
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
                <Label className="text-xs text-zinc-400 mb-1">Name</Label>
                <Input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    update('name', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
                  }
                  placeholder="my-workspace"
                  required
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
                />
                <p className="text-xs text-zinc-600 mt-1">
                  Lowercase alphanumeric and hyphens only
                </p>
              </div>
              <div>
                <Label className="text-xs text-zinc-400 mb-1">Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => update('description', e.target.value)}
                  placeholder="Main application workspace"
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
                />
              </div>
            </section>

            {/* Type */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Type</h3>
              <div className="flex gap-1.5">
                {typeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => update('type', opt.value)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      form.type === opt.value
                        ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/30'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </section>

            {/* Repos */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Repositories
              </h3>

              {form.type === 'monorepo' ? (
                <>
                  <div>
                    <Label className="text-xs text-zinc-400 mb-1">Repository</Label>
                    <Input
                      type="text"
                      value={form.monoRepo}
                      onChange={(e) => update('monoRepo', e.target.value)}
                      placeholder="owner/repo"
                      required
                      className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-400 mb-1">Root directory</Label>
                    <Input
                      type="text"
                      value={form.monoRootDir}
                      onChange={(e) => update('monoRootDir', e.target.value)}
                      placeholder="/"
                      className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
                    />
                    <p className="text-xs text-zinc-600 mt-1">
                      Root directory within the repository
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-400 mb-1">Branch</Label>
                    <Input
                      type="text"
                      value={form.monoBranch}
                      onChange={(e) => update('monoBranch', e.target.value)}
                      placeholder="main"
                      className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
                    />
                  </div>
                </>
              ) : (
                <>
                  {form.repos.map((repo, idx) => (
                    <div key={idx} className="flex gap-2 items-start">
                      <div className="flex-1 space-y-2">
                        <Input
                          type="text"
                          value={repo.name}
                          onChange={(e) => updateRepo(idx, 'name', e.target.value)}
                          placeholder="owner/repo"
                          className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
                        />
                        <div className="flex gap-2">
                          <select
                            value={repo.role}
                            onChange={(e) => updateRepo(idx, 'role', e.target.value)}
                            className="flex-1 px-3 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded-3xl text-zinc-100 focus:outline-none focus:border-emerald-400/50"
                          >
                            <option value="primary">Primary</option>
                            <option value="reference">Reference</option>
                          </select>
                          <Input
                            type="text"
                            value={repo.branch}
                            onChange={(e) => updateRepo(idx, 'branch', e.target.value)}
                            placeholder="main"
                            className="flex-1 bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 text-xs focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
                          />
                        </div>
                      </div>
                      {form.repos.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removeRepo(idx)}
                          className="text-zinc-500 hover:text-red-400 mt-1.5"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={addRepo}
                    className="text-zinc-400 hover:text-zinc-200"
                  >
                    <Plus className="size-3.5 mr-1" />
                    Add repository
                  </Button>
                </>
              )}
            </section>

            {/* Settings (collapsible) */}
            <section className="space-y-3">
              <button
                type="button"
                onClick={() => setSettingsOpen(!settingsOpen)}
                className="flex items-center gap-1 text-xs font-semibold text-zinc-500 uppercase tracking-wider hover:text-zinc-400 transition-colors"
              >
                <span
                  className={`inline-block transition-transform ${settingsOpen ? 'rotate-90' : ''}`}
                >
                  &#9654;
                </span>
                Settings
              </button>

              {settingsOpen && (
                <div className="space-y-3 pl-2">
                  <div>
                    <Label className="text-xs text-zinc-400 mb-1">Language</Label>
                    <Input
                      type="text"
                      value={form.language}
                      onChange={(e) => update('language', e.target.value)}
                      placeholder="typescript"
                      className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-400 mb-1">Package manager</Label>
                    <select
                      value={form.packageManager}
                      onChange={(e) => update('packageManager', e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-3xl text-zinc-100 focus:outline-none focus:border-emerald-400/50"
                    >
                      {PACKAGE_MANAGERS.map((pm) => (
                        <option key={pm.value} value={pm.value}>
                          {pm.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-400 mb-1">Test command</Label>
                    <Input
                      type="text"
                      value={form.testCommand}
                      onChange={(e) => update('testCommand', e.target.value)}
                      placeholder="bun test"
                      className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 font-mono text-xs focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-400 mb-1">Build command</Label>
                    <Input
                      type="text"
                      value={form.buildCommand}
                      onChange={(e) => update('buildCommand', e.target.value)}
                      placeholder="bun run build"
                      className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 font-mono text-xs focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
                    />
                  </div>
                </div>
              )}
            </section>

            {/* Submit */}
            <SheetFooter className="mt-0 p-0">
              <Button
                type="submit"
                disabled={saving || !isValid}
                className="w-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
              >
                {saving ? 'Saving...' : isEdit ? 'Update Workspace' : 'Create Workspace'}
              </Button>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
