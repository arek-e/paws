import { useState } from 'react';

import { addMcpServer, deleteMcpServer, getMcpServers, type McpServerInfo } from '../api/client.js';
import { StatusBadge } from '../components/StatusBadge.js';
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

  async function handleRemove() {
    if (!confirm(`Remove MCP server "${server.name}"?`)) return;
    setRemoving(true);
    try {
      await deleteMcpServer(server.name);
      onRemove();
    } catch {
      setRemoving(false);
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-zinc-100">{server.name}</h3>
          <StatusBadge status="healthy" />
        </div>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs border bg-zinc-800 text-zinc-400 border-zinc-700">
          {transportLabel(server.transport)}
        </span>
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
        <button
          onClick={handleRemove}
          disabled={removing}
          className="px-3 py-1.5 text-xs font-medium rounded bg-red-400/10 text-red-400 border border-red-400/20 hover:bg-red-400/20 transition-colors disabled:opacity-50"
        >
          {removing ? 'Removing...' : 'Remove'}
        </button>
      </div>
    </div>
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
      setName('');
      setCommand('');
      setArgs('');
      setUrl('');
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  }

  const isValid = name.length > 0 && (transport === 'stdio' ? command.length > 0 : url.length > 0);

  return (
    <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-zinc-100 mb-3">Add MCP Server</h3>
      <p className="text-xs text-zinc-500 mb-4">
        Register a Model Context Protocol server for agents to access tools.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="filesystem"
            required
            className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-400/50"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Transport</label>
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
            <label className="block text-xs text-zinc-400 mb-1">Command</label>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="npx"
              required
              className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-400/50"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Arguments</label>
            <input
              type="text"
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              placeholder="-y @modelcontextprotocol/server-filesystem /tmp"
              className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-400/50"
            />
          </div>
        </div>
      ) : (
        <div className="mb-3">
          <label className="block text-xs text-zinc-400 mb-1">URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:3001/mcp"
            required
            className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-400/50"
          />
        </div>
      )}

      {error && (
        <div className="bg-red-400/10 border border-red-400/20 rounded p-2 text-red-400 text-xs mb-3">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={adding || !isValid}
        className="px-4 py-2 text-sm font-medium rounded bg-emerald-500 text-zinc-950 hover:bg-emerald-400 transition-colors disabled:opacity-50"
      >
        {adding ? 'Adding...' : 'Add Server'}
      </button>
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
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 text-xs font-medium rounded bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 hover:bg-emerald-400/20 transition-colors"
        >
          {showForm ? 'Cancel' : 'Add Server'}
        </button>
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
            <div
              key={i}
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 h-32 animate-pulse"
            />
          ))}
        </div>
      ) : servers.error ? (
        <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-4 text-red-400 text-sm">
          Failed to load MCP servers: {servers.error.message}
        </div>
      ) : servers.data && servers.data.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {servers.data.map((s) => (
            <McpServerCard key={s.name} server={s} onRemove={() => {}} />
          ))}
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
          <pre className="text-zinc-600 text-xs font-mono mb-2">{`   /\\_/\\
  ( o.o )
   > ^ <`}</pre>
          <p className="text-zinc-500 text-sm">No MCP servers configured yet.</p>
          <p className="text-zinc-600 text-xs mt-1">
            Click <strong className="text-zinc-500">Add Server</strong> to register a Model Context
            Protocol server for agent tools
          </p>
        </div>
      )}
    </div>
  );
}
