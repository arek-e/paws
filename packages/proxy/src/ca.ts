import { ResultAsync } from 'neverthrow';

import { ProxyError, ProxyErrorCode } from './errors.js';
import type { ExecFn } from './types.js';

/** Ephemeral per-session CA keypair and certificate */
export interface SessionCa {
  /** PEM-encoded CA certificate */
  cert: string;
  /** PEM-encoded CA private key */
  key: string;
  /** Path to CA cert file on host */
  certPath: string;
  /** Path to CA key file on host */
  keyPath: string;
}

export interface CaOptions {
  /** Directory to write CA files into */
  dir: string;
  /** Validity period in hours (default: 24) */
  validityHours?: number;
  /** Injected exec for testability */
  exec?: ExecFn;
}

/**
 * Generate an ephemeral ECDSA P-256 CA for a session.
 * Creates a self-signed cert valid for the configured duration.
 * Used by the per-VM MITM proxy to generate on-the-fly server certs.
 */
export function generateSessionCa(opts: CaOptions): ResultAsync<SessionCa, ProxyError> {
  const validityDays = Math.max(1, Math.ceil((opts.validityHours ?? 24) / 24));

  return ResultAsync.fromPromise(
    (async () => {
      const exec = opts.exec ?? defaultExecFn;
      const keyPath = `${opts.dir}/ca.key`;
      const certPath = `${opts.dir}/ca.crt`;

      await exec('mkdir', ['-p', opts.dir]);

      // Generate ECDSA P-256 private key
      await exec('openssl', [
        'ecparam',
        '-genkey',
        '-name',
        'prime256v1',
        '-noout',
        '-out',
        keyPath,
      ]);

      // Generate self-signed CA certificate
      await exec('openssl', [
        'req',
        '-new',
        '-x509',
        '-key',
        keyPath,
        '-out',
        certPath,
        '-days',
        String(validityDays),
        '-subj',
        '/CN=paws-session-ca',
        '-addext',
        'basicConstraints=critical,CA:TRUE,pathlen:0',
        '-addext',
        'keyUsage=critical,keyCertSign,cRLSign',
      ]);

      const cert = await Bun.file(certPath).text();
      const key = await Bun.file(keyPath).text();

      return { cert, key, certPath, keyPath };
    })(),
    (e) => new ProxyError(ProxyErrorCode.CA_FAILED, `Failed to generate session CA: ${e}`, e),
  );
}

/** Default exec using Bun.spawn */
const defaultExecFn: ExecFn = async (cmd, args) => {
  const proc = Bun.spawn([cmd, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  if (exitCode !== 0) {
    throw new Error(`${cmd} exited with ${exitCode}: ${stderr}`);
  }
  return { stdout, stderr };
};
