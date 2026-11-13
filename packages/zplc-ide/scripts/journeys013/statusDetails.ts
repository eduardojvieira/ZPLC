import { css, type App } from '../journeyApp';

/**
 * The status rail keeps the cycle count off its line (spec 013 FLW-011): it is in the Details popover. Opens it, reads the number
 * and closes it again, so a journey that polls it leaves the screen as it found it. NaN when the details do not report a count.
 */
export async function cyclesFromDetails(app: App): Promise<number> {
  const rail = '[aria-label="Operational status"]';
  await app.click(
    `[...document.querySelectorAll('button')].find((item) => item.closest(${JSON.stringify(rail)}) && item.textContent?.includes('Details'))`,
    'the status details',
  );
  await app.until('the status details', async () => (await app.visible(css('[role="dialog"]'))) || undefined);
  const text = await app.eval<string>(`document.querySelector('[role="dialog"]')?.innerText ?? ''`);
  await app.press('Escape');
  await app.until('the status details to close', async () => !(await app.visible(css('[role="dialog"]'))) || undefined);
  return Number(/Cycles\s+(\d[\d,]*)/.exec(text)?.[1]?.replace(/,/g, '') ?? 'NaN');
}
