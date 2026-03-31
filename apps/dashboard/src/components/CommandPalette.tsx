import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';

const PAGES = [
  { name: 'Topology', path: '/', group: 'Navigation' },
  { name: 'Fleet', path: '/fleet', group: 'Infrastructure' },
  { name: 'Servers', path: '/servers', group: 'Infrastructure' },
  { name: 'Snapshots', path: '/snapshots', group: 'Infrastructure' },
  { name: 'Tunnels', path: '/tunnels', group: 'Infrastructure' },
  { name: 'Daemons', path: '/daemons', group: 'Agents' },
  { name: 'Templates', path: '/templates', group: 'Agents' },
  { name: 'Sessions', path: '/sessions', group: 'Agents' },
  { name: 'Integrations', path: '/integrations', group: 'Configuration' },
  { name: 'MCP Servers', path: '/mcp', group: 'Configuration' },
  { name: 'Audit Log', path: '/audit', group: 'Configuration' },
  { name: 'Settings', path: '/settings', group: 'Configuration' },
  { name: 'Setup Wizard', path: '/setup', group: 'Configuration' },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSelect = useCallback(
    (path: string) => {
      setOpen(false);
      void navigate({ to: path });
    },
    [navigate],
  );

  // Group pages
  const groups = PAGES.reduce<Record<string, typeof PAGES>>((acc, page) => {
    (acc[page.group] ??= []).push(page);
    return acc;
  }, {});

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command Palette"
      description="Navigate to a page..."
    >
      <CommandInput placeholder="Type a page name..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {Object.entries(groups).map(([group, pages], i) => (
          <div key={group}>
            {i > 0 && <CommandSeparator />}
            <CommandGroup heading={group}>
              {pages.map((page) => (
                <CommandItem key={page.path} onSelect={() => handleSelect(page.path)}>
                  {page.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
