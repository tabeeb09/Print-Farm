export function toDatetimeLocalValue(value) {
  if (!value) return "";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function fromDatetimeLocalValue(value) {
  return value ? new Date(value).toISOString() : "";
}

export function toFutureDatetimeLocalValue(value, now = new Date()) {
  const date = new Date(value);
  const current = new Date(now);

  if (!Number.isFinite(date.getTime())) return "";

  if (date.getTime() <= current.getTime() + 60_000) {
    date.setTime(current.getTime() + 5 * 60_000);
  }

  date.setSeconds(0, 0);
  return toDatetimeLocalValue(date);
}
