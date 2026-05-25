const MOVING_AVERAGE_MIN = 1;
const MOVING_AVERAGE_MAX = 1000;

export function sanitizeMovingAverageWindow(value: unknown, fallback = 5): number {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(MOVING_AVERAGE_MAX, Math.max(MOVING_AVERAGE_MIN, parsed));
}

export function computeMovingAverage(
  values: Array<number | null | undefined>,
  windowSize = 5
): Array<number | null> {
  const safeWindow = sanitizeMovingAverageWindow(windowSize);
  const result: Array<number | null> = new Array(values.length).fill(null);

  let rollingSum = 0;
  let rollingCount = 0;
  const queue: Array<number | null> = [];

  for (let index = 0; index < values.length; index += 1) {
    const current = values[index];
    const numericCurrent = Number.isFinite(current as number) ? Number(current) : null;

    queue.push(numericCurrent);

    if (numericCurrent !== null) {
      rollingSum += numericCurrent;
      rollingCount += 1;
    }

    if (queue.length > safeWindow) {
      const removed = queue.shift() ?? null;
      if (removed !== null) {
        rollingSum -= removed;
        rollingCount -= 1;
      }
    }

    if (queue.length === safeWindow && rollingCount > 0) {
      result[index] = rollingSum / rollingCount;
    }
  }

  return result;
}
