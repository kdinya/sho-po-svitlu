export const QUEUE_NAME_MAX_LENGTH = 24;
const QUEUE_ID_PATTERN = /^[1-6]\.[12]$/;

export function normalizeQueueNames(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter(([queue, name]) => QUEUE_ID_PATTERN.test(queue) && typeof name === "string")
      .map(([queue, name]) => [queue, Array.from(name.trim()).slice(0, QUEUE_NAME_MAX_LENGTH).join("")])
      .filter(([, name]) => name.length > 0)
  );
}

export function areQueueNamesEqual(left, right) {
  const a = normalizeQueueNames(left);
  const b = normalizeQueueNames(right);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => a[key] === b[key]);
}
