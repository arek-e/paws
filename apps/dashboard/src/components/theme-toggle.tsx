import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';

import { SidebarMenuButton } from '@/components/ui/sidebar';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  });

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem('paws_theme', next);
  }

  return (
    <SidebarMenuButton className="text-muted-foreground" size="sm" tooltip={theme === 'dark' ? 'Light mode' : 'Dark mode'} onClick={toggle}>
      {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
    </SidebarMenuButton>
  );
}
