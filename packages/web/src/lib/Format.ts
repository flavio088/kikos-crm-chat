import { DateTime } from "effect";

export const formatDate = (value: DateTime.Utc) =>
  DateTime.formatLocal(value, {
    locale: "pt-BR",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

export const formatDateTime = (value: DateTime.Utc) =>
  DateTime.formatLocal(value, {
    locale: "pt-BR",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  const national = digits.length > 11 && digits.startsWith("55") ? digits.slice(2) : digits;
  if (national.length === 11) {
    return `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
  }
  if (national.length === 10) {
    return `(${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`;
  }
  return value;
};

export const dddOf = (value: string) => {
  const digits = value.replace(/\D/g, "");
  const national = digits.length > 11 && digits.startsWith("55") ? digits.slice(2) : digits;
  return national.length >= 10 ? national.slice(0, 2) : undefined;
};

const relative = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const formatTimeAgo = (value: DateTime.Utc, now: DateTime.Utc = DateTime.nowUnsafe()) => {
  const elapsed = DateTime.toEpochMillis(now) - DateTime.toEpochMillis(value);
  if (elapsed < MINUTE) return "agora há pouco";
  if (elapsed < HOUR) return relative.format(-Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return relative.format(-Math.floor(elapsed / HOUR), "hour");
  return relative.format(-Math.floor(elapsed / DAY), "day");
};

export const formatFileSize = (sizeBytes: number) => {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
