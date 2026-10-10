// The tracked requirement index (VF-027) and the coverage report built on it. The index is generated from
// section 5 of the spec and the appendix of the plan; CI reads only the committed file.
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

import { buildIndex, checkAgainstSpec, parsePlan, parseSpec, serialize, validateIndex } from './generate-requirement-index';

const spec = [
  '## 4. Scope',
  '- **ZZ-999** A bullet outside section 5 is not a requirement.',
  '## 5. Workstreams',
  '### VF: Verification foundation',
  '#### Requirements',
  '- **VF-001** The repository MUST hold a suite, e.g. a case. It runs `a.b` files.',
  '- **VF-002** A single sentence with no full stop',
  '### CMP: Compiler',
  '- **CMP-001** Compiling MUST fail: it names the `identifier`. A second sentence.',
  `- **CMP-002** ${'word '.repeat(60)}end.`,
  '#### Verification',
  '- A bullet that names no requirement.',
  '## 6. Matrix',
  '- **CMP-003** A bullet after section 5 is not a requirement.',
].join('\n');

const plan = [
  '## 12. Appendix: requirement coverage',
  '| Requirement | Owning package | Phase | Also advanced by |',
  '|---|---|---|---|',
  '| VF-001 | WP-02 | 0 |  |',
  '| VF-002 | WP-14 | 1 | WP-15, WP-16 |',
  '| CMP-001 | WP-24 | 2 | WP-04 |',
].join('\n');

describe('parseSpec', () => {
  it('reads the requirement bullets of section 5 and nothing else', () => {
    expect(parseSpec(spec).map((entry) => entry.id)).toEqual(['VF-001', 'VF-002', 'CMP-001', 'CMP-002']);
  });

  it('takes the workstream from the identifier and the first sentence as the title', () => {
    const [first, second, third] = parseSpec(spec);
    expect(first).toEqual({ id: 'VF-001', workstream: 'VF', title: 'The repository MUST hold a suite, e.g. a case.' });
    expect(second?.title).toBe('A single sentence with no full stop');
    expect(third?.title).toBe('Compiling MUST fail: it names the identifier.');
  });

  it('cuts a long first sentence at a word with an ellipsis', () => {
    const title = parseSpec(spec)[3]!.title;
    expect(title.length).toBeLessThanOrEqual(141);
    expect(title.endsWith('…')).toBe(true);
    expect(title).not.toContain('  ');
  });

  it('refuses a duplicate identifier and an identifier under the wrong workstream heading', () => {
    expect(() => parseSpec(spec.replace('CMP-002', 'VF-001'))).toThrow('VF-001 appears twice');
    expect(() => parseSpec(spec.replace('**CMP-001**', '**LNG-001**'))).toThrow('LNG-001 is under the CMP heading');
  });
});

describe('parsePlan', () => {
  it('reads owner, phase and the packages that also advance each requirement', () => {
    expect(parsePlan(plan).get('VF-002')).toEqual({ workPackage: 'WP-14', phase: 1, alsoAdvancedBy: ['WP-15', 'WP-16'] });
    expect(parsePlan(plan).get('VF-001')).toEqual({ workPackage: 'WP-02', phase: 0, alsoAdvancedBy: [] });
  });
});

describe('buildIndex', () => {
  it('joins the spec with the plan and leaves the plan fields out when the plan does not name the requirement', () => {
    const index = buildIndex(spec, plan);
    expect(index[2]).toEqual({ id: 'CMP-001', workstream: 'CMP', title: 'Compiling MUST fail: it names the identifier.', phase: 2, workPackage: 'WP-24', alsoAdvancedBy: ['WP-04'] });
    expect(index[3]).toEqual({ id: 'CMP-002', workstream: 'CMP', title: expect.any(String) });
  });

  it('fails when the plan names a requirement that the spec does not have', () => {
    expect(() => buildIndex(spec, `${plan}\n| VF-099 | WP-01 | 0 |  |`)).toThrow('VF-099');
  });
});

describe('validateIndex', () => {
  const good = buildIndex(spec, plan);
  it('accepts a generated index', () => expect(validateIndex(good)).toEqual([]));

  it('names an identifier that is malformed, duplicated or under the wrong workstream', () => {
    const errors = validateIndex([good[0], { ...good[0] }, { ...good[1], id: 'vf-2' }, { ...good[2], workstream: 'VF' }]).join('\n');
    expect(errors).toContain('VF-001: duplicate');
    expect(errors).toContain('vf-2: id must look like CMP-012');
    expect(errors).toContain('CMP-001: workstream VF does not match the identifier');
  });

  it('rejects an empty title, a bad package or a phase that is not a whole number', () => {
    const errors = validateIndex([{ ...good[0], title: ' ' }, { ...good[1], workPackage: 'P2' }, { ...good[2], phase: 1.5 }]).join('\n');
    expect(errors).toContain('VF-001: title must not be empty');
    expect(errors).toContain('VF-002: workPackage must look like WP-12');
    expect(errors).toContain('CMP-001: phase must be a whole number');
  });

  it('rejects anything that is not an array', () => expect(validateIndex({})).toEqual(['the index must be an array']));
});

describe('checkAgainstSpec', () => {
  it('passes when the committed text is what the spec generates', () => {
    expect(checkAgainstSpec(serialize(buildIndex(spec, plan)), spec, plan)).toEqual([]);
  });

  it('says how to regenerate when the spec has moved on', () => {
    const reworded = spec.replace('A single sentence with no full stop', 'A reworded sentence');
    const errors = checkAgainstSpec(serialize(buildIndex(spec, plan)), reworded, plan);
    expect(errors.join('\n')).toContain('changed VF-002');
    expect(errors.join('\n')).toContain('bun tools/ci/generate-requirement-index.ts');
  });
});

describe('the committed index', () => {
  const index = JSON.parse(readFileSync(new URL('./requirements-index.json', import.meta.url), 'utf8')) as ReturnType<typeof buildIndex>;

  it('is well formed', () => expect(validateIndex(index)).toEqual([]));

  it('lists the 387 requirements of the plan appendix, per workstream', () => {
    const counts: Record<string, number> = {};
    for (const entry of index) counts[entry.workstream] = (counts[entry.workstream] ?? 0) + 1;
    expect(counts).toEqual({ VF: 27, CMP: 61, LNG: 27, RT: 34, IO: 18, COM: 30, IDE: 33, UX: 34, LRN: 38, HIL: 17, REL: 38, DOC: 30 });
    expect(index.length).toBe(387);
  });

  it('gives every requirement an owning package and a phase', () => {
    expect(index.filter((entry) => !entry.workPackage || entry.phase === undefined).map((entry) => entry.id)).toEqual([]);
  });
});
