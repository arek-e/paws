import { describe, expect, test } from 'vitest';

import {
  BrowserActionResultSchema,
  BrowserActionSchema,
  BrowserConfigSchema,
  ScreenshotResponseSchema,
} from './browser.js';

describe('BrowserConfigSchema', () => {
  test('applies defaults', () => {
    const result = BrowserConfigSchema.parse({});
    expect(result.enabled).toBe(false);
    expect(result.width).toBe(1280);
    expect(result.height).toBe(720);
    expect(result.startUrl).toBeUndefined();
  });

  test('accepts full config', () => {
    const result = BrowserConfigSchema.parse({
      enabled: true,
      width: 1920,
      height: 1080,
      startUrl: 'https://example.com',
    });
    expect(result.enabled).toBe(true);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.startUrl).toBe('https://example.com');
  });

  test('rejects width below minimum', () => {
    expect(() => BrowserConfigSchema.parse({ width: 100 })).toThrow();
  });

  test('rejects height above maximum', () => {
    expect(() => BrowserConfigSchema.parse({ height: 5000 })).toThrow();
  });

  test('rejects invalid startUrl', () => {
    expect(() => BrowserConfigSchema.parse({ startUrl: 'not-a-url' })).toThrow();
  });
});

describe('ScreenshotResponseSchema', () => {
  test('accepts valid screenshot', () => {
    const result = ScreenshotResponseSchema.parse({
      image: 'iVBORw0KGgo=',
      width: 1280,
      height: 720,
      timestamp: '2024-01-01T00:00:00Z',
    });
    expect(result.image).toBe('iVBORw0KGgo=');
    expect(result.width).toBe(1280);
  });

  test('rejects missing fields', () => {
    expect(() => ScreenshotResponseSchema.parse({ image: 'abc' })).toThrow();
  });
});

describe('BrowserActionSchema', () => {
  test('accepts goto action', () => {
    const result = BrowserActionSchema.parse({ type: 'goto', url: 'https://example.com' });
    expect(result.type).toBe('goto');
    if (result.type === 'goto') expect(result.url).toBe('https://example.com');
  });

  test('accepts click action', () => {
    const result = BrowserActionSchema.parse({ type: 'click', x: 100, y: 200 });
    expect(result.type).toBe('click');
  });

  test('accepts type action', () => {
    const result = BrowserActionSchema.parse({ type: 'type', text: 'hello' });
    expect(result.type).toBe('type');
  });

  test('accepts scroll action with defaults', () => {
    const result = BrowserActionSchema.parse({ type: 'scroll', x: 0, y: 0, deltaY: -100 });
    expect(result.type).toBe('scroll');
    if (result.type === 'scroll') {
      expect(result.deltaX).toBe(0);
      expect(result.deltaY).toBe(-100);
    }
  });

  test('accepts screenshot action', () => {
    const result = BrowserActionSchema.parse({ type: 'screenshot' });
    expect(result.type).toBe('screenshot');
  });

  test('accepts key action', () => {
    const result = BrowserActionSchema.parse({ type: 'key', key: 'Enter' });
    expect(result.type).toBe('key');
  });

  test('rejects unknown action type', () => {
    expect(() => BrowserActionSchema.parse({ type: 'hover', x: 0, y: 0 })).toThrow();
  });

  test('rejects click without coordinates', () => {
    expect(() => BrowserActionSchema.parse({ type: 'click' })).toThrow();
  });
});

describe('BrowserActionResultSchema', () => {
  test('accepts success result', () => {
    const result = BrowserActionResultSchema.parse({ success: true });
    expect(result.success).toBe(true);
    expect(result.screenshot).toBeUndefined();
  });

  test('accepts result with screenshot', () => {
    const result = BrowserActionResultSchema.parse({
      success: true,
      screenshot: {
        image: 'base64data',
        width: 1280,
        height: 720,
        timestamp: '2024-01-01T00:00:00Z',
      },
    });
    expect(result.screenshot).toBeDefined();
  });

  test('accepts failure result with error', () => {
    const result = BrowserActionResultSchema.parse({
      success: false,
      error: 'Element not found',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Element not found');
  });
});
