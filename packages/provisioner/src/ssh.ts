import { Client } from 'ssh2';
import type { SshClient } from './types.js';

export function createSshClient(): SshClient {
  let conn: Client | null = null;

  return {
    connect(opts) {
      return new Promise((resolve, reject) => {
        conn = new Client();
        conn.on('ready', () => resolve());
        conn.on('error', (err) => reject(err));
        conn.connect({
          host: opts.host,
          port: opts.port ?? 22,
          username: opts.username,
          ...(opts.password ? { password: opts.password } : {}),
          ...(opts.privateKey ? { privateKey: opts.privateKey } : {}),
          ...(opts.passphrase ? { passphrase: opts.passphrase } : {}),
          readyTimeout: 30_000,
        });
      });
    },

    exec(command) {
      return new Promise((resolve, reject) => {
        if (!conn) return reject(new Error('Not connected'));
        conn.exec(command, (err, stream) => {
          if (err) return reject(err);
          let stdout = '';
          let stderr = '';
          stream.on('data', (data: Buffer) => {
            stdout += data.toString();
          });
          stream.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });
          stream.on('close', (code: number) => {
            resolve({
              stdout: stdout.trimEnd(),
              stderr: stderr.trimEnd(),
              exitCode: code ?? 0,
            });
          });
        });
      });
    },

    execStream(command, onLine) {
      return new Promise((resolve, reject) => {
        if (!conn) return reject(new Error('Not connected'));
        conn.exec(command, (err, stream) => {
          if (err) return reject(err);
          let buffer = '';
          const processBuffer = (data: string) => {
            buffer += data;
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
              onLine(line);
            }
          };
          stream.on('data', (data: Buffer) => processBuffer(data.toString()));
          stream.stderr.on('data', (data: Buffer) => processBuffer(data.toString()));
          stream.on('close', (code: number) => {
            if (buffer) onLine(buffer);
            resolve({ exitCode: code ?? 0 });
          });
        });
      });
    },

    scp(localPath, remotePath) {
      return new Promise((resolve, reject) => {
        if (!conn) return reject(new Error('Not connected'));
        conn.sftp((err, sftp) => {
          if (err) return reject(err);
          sftp.fastPut(localPath, remotePath, (putErr) => {
            if (putErr) return reject(putErr);
            resolve();
          });
        });
      });
    },

    disconnect() {
      if (conn) {
        conn.end();
        conn = null;
      }
    },
  };
}
