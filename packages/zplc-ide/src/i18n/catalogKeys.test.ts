import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

// Every catalog module is spread into one language object (src/i18n/en.ts, es.ts), so a key defined in two modules is silently
// overridden by whichever comes last. That happened once: a new plant.action.* label replaced the 2.0 motor plant's own text.
const dir = join(import.meta.dir, 'catalog');
const files = [...new Bun.Glob('*.ts').scanSync({ cwd: dir })].filter((f) => !f.endsWith('.test.ts')).sort();

async function owners(suffix: 'En' | 'Es'): Promise<Map<string, string[]>> {
  const seen = new Map<string, string[]>();
  for (const file of files) {
    const mod = (await import(join(dir, file))) as Record<string, unknown>;
    for (const [name, value] of Object.entries(mod)) {
      if (!name.endsWith(suffix) || typeof value !== 'object' || value === null) continue;
      for (const key of Object.keys(value)) seen.set(key, [...(seen.get(key) ?? []), `${file}:${name}`]);
    }
  }
  return seen;
}

describe('catalog keys', () => {
  for (const suffix of ['En', 'Es'] as const)
    it(`LRN-029 no ${suffix === 'En' ? 'English' : 'Spanish'} catalog key is defined in two catalog modules`, async () => {
      const duplicated = [...(await owners(suffix))].filter(([, where]) => where.length > 1);
      expect(duplicated).toEqual([]);
    });
});
