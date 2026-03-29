// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://getpaws.dev',
  integrations: [
    starlight({
      title: 'paws',
      tagline: 'Protected Agent Workflow System',
      logo: {
        dark: '/src/assets/logo-dark.svg',
        light: '/src/assets/logo-light.svg',
        replacesTitle: false,
      },
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/arek-e/paws' }],
      customCss: ['./src/styles/custom.css'],
      head: [
        {
          tag: 'meta',
          attrs: {
            name: 'description',
            content:
              'Zero-trust credential injection for AI agents. Secrets never enter the sandbox.',
          },
        },
      ],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Introduction', slug: 'getting-started/introduction' },
            { label: 'Installation', slug: 'getting-started/install' },
            { label: 'Quick Start', slug: 'getting-started/quickstart' },
          ],
        },
        {
          label: 'Core Concepts',
          items: [
            { label: 'Architecture', slug: 'concepts/architecture' },
            { label: 'Security Model', slug: 'concepts/security' },
            { label: 'Snapshots', slug: 'concepts/snapshots' },
            { label: 'Port Exposure', slug: 'concepts/port-exposure' },
          ],
        },
        {
          label: 'Agents',
          items: [
            { label: 'Claude Code', slug: 'agents/claude-code' },
            { label: 'Custom Agents', slug: 'agents/custom' },
          ],
        },
        {
          label: 'Reference',
          autogenerate: { directory: 'reference' },
        },
      ],
    }),
  ],
});
