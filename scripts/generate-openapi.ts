#!/usr/bin/env bun
/**
 * Extract the OpenAPI spec from the gateway app without starting a server.
 * Uses Hono's built-in test client (app.request) to fetch /openapi.json.
 *
 * Usage: bun scripts/generate-openapi.ts [output-path]
 * Default output: docs/openapi.json
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createGatewayApp } from '../apps/control-plane/src/app.js';

const outputPath = process.argv[2] ?? resolve(import.meta.dir, '../docs/openapi.json');

// Create the app with a dummy API key — the /openapi.json endpoint has no auth
const app = createGatewayApp({ apiKey: 'spec-extraction' });

const res = await app.request('/openapi.json');
const spec = await res.json();

writeFileSync(outputPath, JSON.stringify(spec, null, 2) + '\n');

console.log(` /\\_/\\`);
console.log(`( o.o )  OpenAPI spec written to ${outputPath}`);
console.log(` > ^ <`);
console.log(`         ${Object.keys((spec as Record<string, unknown>).paths ?? {}).length} paths`);
