import { z } from 'zod';

/** UUID v4 session/job identifier */
export const IdSchema = z.string().uuid();

/** ISO 8601 datetime string */
export const TimestampSchema = z.string().datetime();

/** Positive integer for durations in milliseconds */
export const DurationMsSchema = z.number().int().positive();

/** Non-empty trimmed string */
export const NonEmptyStringSchema = z.string().trim().min(1);

/** Port number (1-65535) */
export const PortSchema = z.number().int().min(1).max(65535);

/** Key-value metadata (opaque, user-defined) */
export const MetadataSchema = z.record(z.string(), z.unknown());
