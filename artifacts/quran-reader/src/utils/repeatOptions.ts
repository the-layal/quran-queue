export const REPEAT_OPTIONS = [1, 2, 3, 0] as const;
export type RepeatOption = (typeof REPEAT_OPTIONS)[number];

export function clampRepeat(value: number): number {
  if ((REPEAT_OPTIONS as readonly number[]).includes(value)) return value;
  if (value > 3) return 3;
  return 1;
}

export function nextRepeat(current: number): number {
  const idx = REPEAT_OPTIONS.indexOf(current as RepeatOption);
  return REPEAT_OPTIONS[idx === -1 ? 0 : (idx + 1) % REPEAT_OPTIONS.length];
}

export function repeatLabel(count: number): string {
  return count === 0 ? "∞" : `${count}×`;
}
