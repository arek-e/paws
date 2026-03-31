import type { SnapshotTemplateId } from './config.js';

export interface SnapshotTemplate {
  /** Setup script (bash) to run inside the VM */
  setup: string;
  /** Domains the snapshot needs in the proxy allowlist */
  requiredDomains: string[];
}

const COMMON_SETUP = `apt-get update
apt-get install -y --no-install-recommends curl git ca-certificates openssh-server
echo "PermitRootLogin yes" >> /etc/ssh/sshd_config
systemctl enable ssh`;

const DOCKER_REGISTRY_DOMAINS = [
  'registry-1.docker.io',
  'auth.docker.io',
  'production.cloudflare.docker.com',
  'ghcr.io',
  'docker.io',
];

const templates: Record<SnapshotTemplateId, SnapshotTemplate> = {
  minimal: {
    setup: COMMON_SETUP,
    requiredDomains: [],
  },

  node: {
    setup: `${COMMON_SETUP}

# Install Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
npm install -g npm@latest`,
    requiredDomains: ['registry.npmjs.org', 'nodejs.org'],
  },

  python: {
    setup: `${COMMON_SETUP}

# Install Python 3.12
apt-get install -y python3 python3-pip python3-venv`,
    requiredDomains: ['pypi.org', 'files.pythonhosted.org'],
  },

  docker: {
    setup: `${COMMON_SETUP}

# Install Docker CE + Compose plugin
curl -fsSL https://get.docker.com | sh
systemctl enable docker`,
    requiredDomains: DOCKER_REGISTRY_DOMAINS,
  },

  fullstack: {
    setup: `${COMMON_SETUP}

# Install Docker CE + Compose plugin
curl -fsSL https://get.docker.com | sh
systemctl enable docker

# Install Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
npm install -g npm@latest

# Install Bun
curl -fsSL https://bun.sh/install | bash`,
    requiredDomains: [...DOCKER_REGISTRY_DOMAINS, 'registry.npmjs.org', 'nodejs.org', 'bun.sh'],
  },

  'claude-code': {
    setup: `${COMMON_SETUP}

# Install Node.js 22 LTS (required by Claude Code)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# Install Claude Code CLI
curl -fsSL https://claude.ai/install.sh | bash

# Create output directory for structured results
mkdir -p /output

# Install common dev tools agents typically need
apt-get install -y --no-install-recommends jq ripgrep fd-find`,
    requiredDomains: ['api.anthropic.com', 'claude.ai', 'registry.npmjs.org', 'nodejs.org'],
  },
};

/** Get a snapshot template by ID */
export function getTemplate(id: SnapshotTemplateId): SnapshotTemplate {
  return templates[id];
}

/** List all available template IDs */
export function listTemplateIds(): SnapshotTemplateId[] {
  return Object.keys(templates) as SnapshotTemplateId[];
}
