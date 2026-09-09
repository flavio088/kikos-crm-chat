import { DateTime } from "effect";

export const isoOf = (dateTime: DateTime.Utc): string => DateTime.formatIso(dateTime);

export const optionalIsoOf = (dateTime: DateTime.Utc | undefined): string | null =>
  dateTime === undefined ? null : isoOf(dateTime);

export const deletion = (deletedAt: string | null) => (deletedAt === null ? {} : { deletedAt });

export const present = (fields: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null));
