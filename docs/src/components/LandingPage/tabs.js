/**
 * The tab that a key moves to from `index` among `count` tabs, or undefined for a key that does not move (the keyboard of
 * the ARIA tabs pattern): the arrows step and wrap around, Home and End go to the ends. Both arrow axes work, because the
 * list is vertical on a wide screen and horizontal on a narrow one.
 */
export function nextTab(key, index, count) {
  const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[key];
  if (step !== undefined) return (index + step + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return undefined;
}
