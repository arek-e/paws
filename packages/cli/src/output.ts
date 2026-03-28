/**
 * Output formatting. JSON by default (pipe-friendly), --pretty for tables.
 */

export function formatOutput(data: unknown, pretty: boolean): string {
  if (pretty) {
    return prettyFormat(data);
  }
  return JSON.stringify(data, null, 2);
}

function prettyFormat(data: unknown): string {
  if (Array.isArray(data)) {
    if (data.length === 0) return '(empty)';
    // Table format for arrays of objects
    const first = data[0];
    if (typeof first === 'object' && first !== null) {
      return formatTable(data as Record<string, unknown>[]);
    }
    return data.map((item) => String(item)).join('\n');
  }

  if (typeof data === 'object' && data !== null) {
    const entries = Object.entries(data as Record<string, unknown>);
    const maxKey = Math.max(...entries.map(([k]) => k.length));
    return entries
      .map(([k, v]) => {
        const value = typeof v === 'object' ? JSON.stringify(v) : String(v);
        return `${k.padEnd(maxKey)}  ${value}`;
      })
      .join('\n');
  }

  return String(data);
}

function formatTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '(empty)';

  const keys = Object.keys(rows[0]!);
  const widths = keys.map((k) => Math.max(k.length, ...rows.map((r) => String(r[k] ?? '').length)));

  const header = keys.map((k, i) => k.padEnd(widths[i]!)).join('  ');
  const separator = widths.map((w) => '─'.repeat(w)).join('──');
  const body = rows
    .map((row) => keys.map((k, i) => String(row[k] ?? '').padEnd(widths[i]!)).join('  '))
    .join('\n');

  return `${header}\n${separator}\n${body}`;
}

export function printError(message: string): void {
  process.stderr.write(`error: ${message}\n`);
}
