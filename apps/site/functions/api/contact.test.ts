import { describe, test, expect, vi } from 'vitest';
import { onRequestPost } from './contact';

function createContext(body: unknown, kvStore?: Map<string, string>) {
  const kv = kvStore
    ? {
        put: vi.fn(async (key: string, value: string) => {
          kvStore.set(key, value);
        }),
        get: vi.fn(async (key: string) => kvStore.get(key) || null),
      }
    : undefined;

  return {
    request: new Request('https://getpaws.dev/api/contact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        referer: 'https://getpaws.dev/pricing',
      },
      body: JSON.stringify(body),
    }),
    env: {
      CONTACT_SUBMISSIONS: kv,
    },
  } as unknown as Parameters<typeof onRequestPost>[0];
}

describe('POST /api/contact', () => {
  test('valid submission returns 200 and writes to KV', async () => {
    const store = new Map<string, string>();
    const ctx = createContext(
      {
        name: 'Jane Doe',
        email: 'jane@example.com',
        company: 'Acme',
        message: 'Interested in Pro tier',
      },
      store
    );

    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);

    expect(store.size).toBe(1);
    const stored = JSON.parse([...store.values()][0]);
    expect(stored.name).toBe('Jane Doe');
    expect(stored.email).toBe('jane@example.com');
    expect(stored.company).toBe('Acme');
    expect(stored.message).toBe('Interested in Pro tier');
  });

  test('missing email returns 400', async () => {
    const ctx = createContext({
      name: 'Jane Doe',
      message: 'Hello',
    });

    const res = await onRequestPost(ctx);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toBe('Invalid email address');
  });

  test('invalid email format returns 400', async () => {
    const ctx = createContext({
      name: 'Jane Doe',
      email: 'not-an-email',
      message: 'Hello',
    });

    const res = await onRequestPost(ctx);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toBe('Invalid email address');
  });

  test('missing name returns 400', async () => {
    const ctx = createContext({
      email: 'jane@example.com',
      message: 'Hello',
    });

    const res = await onRequestPost(ctx);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toBe('Name is required');
  });

  test('missing message returns 400', async () => {
    const ctx = createContext({
      name: 'Jane Doe',
      email: 'jane@example.com',
    });

    const res = await onRequestPost(ctx);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toBe('Message is required');
  });

  test('returns 200 even without KV binding', async () => {
    const ctx = createContext({
      name: 'Jane Doe',
      email: 'jane@example.com',
      message: 'Hello',
    });
    // env.CONTACT_SUBMISSIONS is undefined by default in createContext without store

    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);
  });
});
