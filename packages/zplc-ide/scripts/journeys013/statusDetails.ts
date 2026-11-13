import { css, type App } from '../journeyApp';

/**
 * The status rail keeps the runtime, the cycle count, the tasks, the firmware and the protocol off its line (spec 013 FLW-011): they
 * are in the Details popover. Opens it, reads its text and closes it again, so a journey that polls it leaves the screen as it found it.
 */
export async function statusDetailsText(app: App): Promise<string> {
  const rail = '[aria-label="Operational status"]';
  await app.click(
    `[...document.querySelectorAll('button')].find((item) => ` +
      `item.closest(${JSON.stringify(rail)}) && item.textContent?.includes('Details'))`,
    'the status details',
  );
  await app.until('the status details', async () => (await app.visible(css('[role="dialog"]'))) || undefined);
  const text = await app.eval<string>(`document.querySelector('[role="dialog"]')?.innerText ?? ''`);
  await app.press('Escape');
  await app.until('the status details to close', async () => !(await app.visible(css('[role="dialog"]'))) || undefined);
  return text;
}

/** The cycle count of the details. NaN when they do not report one. */
export async function cyclesFromDetails(app: App): Promise<number> {
  const text = await statusDetailsText(app);
  return Number(/Cycles\s+(\d[\d,]*)/.exec(text)?.[1]?.replace(/,/g, '') ?? 'NaN');
}
