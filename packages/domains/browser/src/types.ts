import { z } from 'zod';

/** Browser/computer-use configuration for a session */
export const BrowserConfigSchema = z.object({
  /** Enable browser/computer-use in this session */
  enabled: z.boolean().default(false),
  /** Viewport width */
  width: z.number().int().min(320).max(3840).default(1280),
  /** Viewport height */
  height: z.number().int().min(240).max(2160).default(720),
  /** Start URL to navigate to on launch */
  startUrl: z.string().url().optional(),
});

export type BrowserConfig = z.infer<typeof BrowserConfigSchema>;

/** Screenshot response from the browser */
export const ScreenshotResponseSchema = z.object({
  /** Base64-encoded PNG screenshot */
  image: z.string(),
  /** Viewport width */
  width: z.number().int(),
  /** Viewport height */
  height: z.number().int(),
  /** ISO 8601 timestamp */
  timestamp: z.string(),
});

export type ScreenshotResponse = z.infer<typeof ScreenshotResponseSchema>;

/** Browser action — a discriminated union of supported actions */
export const BrowserActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('goto'), url: z.string() }),
  z.object({ type: z.literal('click'), x: z.number(), y: z.number() }),
  z.object({ type: z.literal('type'), text: z.string() }),
  z.object({
    type: z.literal('scroll'),
    x: z.number(),
    y: z.number(),
    deltaX: z.number().default(0),
    deltaY: z.number(),
  }),
  z.object({ type: z.literal('screenshot') }),
  z.object({ type: z.literal('key'), key: z.string() }),
]);

export type BrowserAction = z.infer<typeof BrowserActionSchema>;

/** Browser action result — returned after executing an action */
export const BrowserActionResultSchema = z.object({
  /** Whether the action succeeded */
  success: z.boolean(),
  /** Optional screenshot taken after the action (for screenshot action type) */
  screenshot: ScreenshotResponseSchema.optional(),
  /** Error message if action failed */
  error: z.string().optional(),
});

export type BrowserActionResult = z.infer<typeof BrowserActionResultSchema>;
