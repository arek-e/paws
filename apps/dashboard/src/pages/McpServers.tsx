import { useState } from 'react';
import { toast } from 'sonner';

import { addMcpServer, deleteMcpServer, getMcpServers, type McpServerInfo } from '../api/client.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { Alert, AlertDescription } from '../components/ui/alert.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent } from '../components/ui/card.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import { Skeleton } from '../components/ui/skeleton.js';
import { usePolling } from '../hooks/usePolling.js';

function transportLabel(transport: string): string {
  switch (transport) {
    case 'stdio':
      return 'stdio';
    case 'sse':
      return 'SSE';
    case 'streamable-http':
      return 'Streamable HTTP';
    default:
      return transport;
  }
}

function McpServerCard({ server, onRemove }: { server: McpServerInfo; onRemove: () => void }) {
  const [removing, setRemoving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function doRemove() {
    setRemoving(true);
    try {
      await deleteMcpServer(server.name);
      onRemove();
    } catch {
      setRemoving(false);
    }
  }

  return (
    <Card className="bg-zinc-900 border-zinc-800 gap-0 py-0">
      <CardContent className="p-4 space-y-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-zinc-100">{server.name}</h3>
            <StatusBadge status="healthy" />
          </div>
          <Badge variant="outline" className="bg-zinc-800 text-zinc-400 border-zinc-700">
            {transportLabel(server.transport)}
          </Badge>
        </div>

        <div className="flex gap-6 text-xs mb-3">
          {server.transport === 'stdio' && server.command && (
            <div>
              <span className="text-zinc-500">Command</span>
              <p className="text-zinc-300 font-mono">
                {server.command}
                {server.args?.length ? ` ${server.args.join(' ')}` : ''}
              </p>
            </div>
          )}
          {(server.transport === 'sse' || server.transport === 'streamable-http') && server.url && (
            <div>
              <span className="text-zinc-500">URL</span>
              <p className="text-zinc-300 font-mono">{server.url}</p>
            </div>
          )}
        </div>

        {server.env && Object.keys(server.env).length > 0 && (
          <div className="text-xs mb-3">
            <span className="text-zinc-500">Environment</span>
            <p className="text-zinc-400 font-mono">{Object.keys(server.env).join(', ')}</p>
          </div>
        )}

        <div className="flex gap-2 mt-3">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={removing}
            className="bg-red-400/10 text-red-400 border border-red-400/20 hover:bg-red-400/20 hover:text-red-400"
          >
            {removing ? 'Removing...' : 'Remove'}
          </Button>
        </div>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove MCP Server</DialogTitle>
              <DialogDescription>Remove MCP server "{server.name}"?</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <Button
                variant="destructive"
                onClick={() => {
                  setConfirmOpen(false);
                  doRemove();
                }}
              >
                Remove
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function AddMcpServerForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('');
  const [transport, setTransport] = useState<'stdio' | 'sse' | 'streamable-http'>('stdio');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      await addMcpServer({
        name,
        transport,
        ...(transport === 'stdio'
          ? { command, args: args ? args.split(/\s+/) : undefined }
          : { url }),
      });
      toast.success('MCP server added');
      setName('');
      setCommand('');
      setArgs('');
      setUrl('');
      onAdded();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
      setError(message);
    } finally {
      setAdding(false);
    }
  }

  const isValid = name.length > 0 && (transport === 'stdio' ? command.length > 0 : url.length > 0);

  return (
    <form onSubmit={handleSubmit}>
      <Card className="bg-zinc-900 border-zinc-800 gap-0 py-0">
        <CardContent className="p-4 space-y-0">
          <h3 className="text-sm font-semibold text-zinc-100 mb-3">Add MCP Server</h3>
          <p className="text-xs text-zinc-500 mb-4">
            Register a Model Context Protocol server for agents to access tools.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <Label className="text-xs text-zinc-400 mb-1">Name</Label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="filesystem"
                required
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
              />
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1">Transport</Label>
              <select
                value={transport}
                onChange={(e) => setTransport(e.target.value as typeof transport)}
                className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-emerald-400/50"
              >
                <option value="stdio">stdio</option>
                <option value="sse">SSE</option>
                <option value="streamable-http">Streamable HTTP</option>
              </select>
            </div>
          </div>

          {transport === 'stdio' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <Label className="text-xs text-zinc-400 mb-1">Command</Label>
                <Input
                  type="text"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="npx"
                  required
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
                />
              </div>
              <div>
                <Label className="text-xs text-zinc-400 mb-1">Arguments</Label>
                <Input
                  type="text"
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  placeholder="-y @modelcontextprotocol/server-filesystem /tmp"
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
                />
              </div>
            </div>
          ) : (
            <div className="mb-3">
              <Label className="text-xs text-zinc-400 mb-1">URL</Label>
              <Input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://localhost:3001/mcp"
                required
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
              />
            </div>
          )}

          {error && (
            <Alert variant="destructive" className="bg-red-400/10 border-red-400/20 mb-3 p-2">
              <AlertDescription className="text-red-400 text-xs">{error}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            disabled={adding || !isValid}
            className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
          >
            {adding ? 'Adding...' : 'Add Server'}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}

export function McpServers() {
  const servers = usePolling(getMcpServers, 5000);
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">MCP Servers</h1>
        <Button
          size="sm"
          onClick={() => setShowForm(!showForm)}
          className="bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 hover:bg-emerald-400/20"
        >
          {showForm ? 'Cancel' : 'Add Server'}
        </Button>
      </div>

      {showForm && (
        <AddMcpServerForm
          onAdded={() => {
            setShowForm(false);
          }}
        />
      )}

      {servers.loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-32 bg-zinc-800 rounded-lg" />
          ))}
        </div>
      ) : servers.error ? (
        <Alert variant="destructive" className="bg-red-400/10 border-red-400/20">
          <AlertDescription className="text-red-400 text-sm">
            Failed to load MCP servers: {servers.error.message}
          </AlertDescription>
        </Alert>
      ) : servers.data && servers.data.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {servers.data.map((s) => (
            <McpServerCard key={s.name} server={s} onRemove={() => {}} />
          ))}
        </div>
      ) : (
        <Card className="bg-zinc-900 border-zinc-800 py-0">
          <CardContent className="p-8 text-center">
            <pre className="text-zinc-600 text-xs font-mono mb-2">{`   /\\_/\\
  ( o.o )
   > ^ <`}</pre>
            <p className="text-zinc-500 text-sm">No MCP servers configured yet.</p>
            <p className="text-zinc-600 text-xs mt-1">
              Click <strong className="text-zinc-500">Add Server</strong> to register a Model
              Context Protocol server for agent tools
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
