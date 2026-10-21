// The structure of the documentation site as a reader meets it: the sidebar is organised by what the reader came to do
// (DOC-002), and a page is published only when both of its languages exist and have the same shape (DOC-016).
//
// The sidebar is loaded as the site generator loads it (a module), not read as text, and the pair rules are run on
// folders built for the test by the validator that CI runs (tools/docs/validate_docs_pages.py), so that the test fails
// when the validator stops enforcing a rule and not when its code is rewritten.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it, setDefaultTimeout } from 'bun:test';

// Each case runs the Python validator or reads the whole site; on a loaded machine that outgrows the 5 s default, which is not what these
// tests measure.
setDefaultTimeout(60_000);

import { VOSEO_MARKERS } from '../ci/i18n-guard';
import { markdownFiles } from './check_doc_claims';

const ROOT = new URL('../../', import.meta.url).pathname;
const EN_DIR = 'docs/docs';
const ES_DIR = 'docs/i18n/es/docusaurus-plugin-content-docs/current';
const text = (path: string) => readFileSync(join(ROOT, path), 'utf8');

interface Category {
  type: 'category';
  label: string;
  items: Item[];
}
type Item = string | Category;

const sidebar = async (): Promise<Item[]> => {
  const module = (await import(pathToFileURL(join(ROOT, 'docs/sidebars.js')).href)) as { default: { docsSidebar: Item[] } };
  return module.default.docsSidebar;
};

const isCategory = (item: Item): item is Category => typeof item !== 'string';
const ids = (items: Item[]): string[] => items.flatMap((item) => (isCategory(item) ? ids(item.items) : [item]));
const labels = (items: Item[]): string[] => items.flatMap((item) => (isCategory(item) ? [item.label, ...labels(item.items)] : []));

/** The id of a page the way the site generator forms it: its front matter `id`, or its file name, inside its folder. */
function pageId(path: string, text: string): { id: string; draft: boolean; unlisted: boolean } {
  const front = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '';
  const field = (key: string) =>
    new RegExp(`^${key}:\\s*(.+)$`, 'm')
      .exec(front)?.[1]
      ?.trim()
      .replace(/^["']|["']$/g, '');
  const folder = dirname(path);
  const id = field('id') ?? (path.split('/').at(-1) ?? '').replace(/\.mdx?$/, '');
  return { id: folder === '.' ? id : `${folder}/${id}`, draft: field('draft') === 'true', unlisted: field('unlisted') === 'true' };
}

function pagesOf(base: string): Array<{ path: string; id: string; draft: boolean; unlisted: boolean }> {
  return markdownFiles(ROOT, base).map((file) => {
    const path = file.slice(base.length + 1);
    return { path, ...pageId(path, text(file)) };
  });
}

describe('docs structure: the sidebar is organised by reader intent (DOC-002)', () => {
  it("has the six intents of the requirement, in the order of a reader's journey", async () => {
    const top = (await sidebar()).filter(isCategory).map((category) => category.label);
    expect(top).toEqual(['Start here', 'How-to guides', 'Reference', 'Concepts', 'Learn', 'Project']);
    expect((await sidebar()).every(isCategory)).toBe(true);
  });

  it('lists every published page of the site once, and only pages that exist in both languages', async () => {
    const listed = ids(await sidebar());
    expect(listed.filter((id, index) => listed.indexOf(id) !== index)).toEqual([]);
    for (const base of [EN_DIR, ES_DIR]) {
      const pages = pagesOf(base);
      const published = pages.filter((page) => !page.draft).map((page) => page.id);
      // an unlisted page (the generated course pages, LRN-035) is published and linked from a listed page, not in the sidebar
      expect({ base, missing: published.filter((id) => !listed.includes(id) && !pages.find((page) => page.id === id)!.unlisted) }).toEqual({
        base,
        missing: [],
      });
      expect({ base, dangling: listed.filter((id) => !published.includes(id)) }).toEqual({ base, dangling: [] });
    }
  });

  it('hides nothing without saying why: a draft page carries its reason in its front matter', () => {
    for (const base of [EN_DIR, ES_DIR]) {
      for (const file of markdownFiles(ROOT, base)) {
        const front = /^---\n([\s\S]*?)\n---/.exec(text(file))?.[1] ?? '';
        if (!/^draft:\s*true\s*$/m.test(front)) continue;
        expect({ file, reason: /^draft_reason:\s*\S.{40,}/m.test(front) }).toEqual({ file, reason: true });
      }
    }
  });

  it('has a Spanish label for every category, through the translation file of the site', async () => {
    const translations = JSON.parse(text('docs/i18n/es/docusaurus-plugin-content-docs/current.json')) as Record<
      string,
      { message: string }
    >;
    for (const label of labels(await sidebar())) {
      const entry = translations[`sidebar.docsSidebar.category.${label}`];
      expect({ label, translated: entry !== undefined && entry.message.trim() !== '' }).toEqual({ label, translated: true });
    }
  });

  it('fails the build of the site on a broken link and on a broken anchor, so that moving a page cannot leave one behind', () => {
    const config = text('docs/docusaurus.config.js');
    expect(config).toContain("onBrokenLinks: 'throw'");
    expect(config).toContain("onBrokenAnchors: 'throw'");
    expect(config).toContain("onBrokenMarkdownLinks: 'throw'");
  });

  it('keeps the labels of the navigation and the footer out of the pages, in the translation files', () => {
    const config = text('docs/docusaurus.config.js');
    // a label with both languages written into it ("Docs / Documentación") cannot be localised
    expect(config.match(/(?:label|title): '[^']* \/ [^']*'/g) ?? []).toEqual([]);
    for (const file of ['navbar.json', 'footer.json']) {
      const translated = JSON.parse(text(`docs/i18n/es/docusaurus-theme-classic/${file}`)) as Record<string, { message: string }>;
      expect(Object.keys(translated).length).toBeGreaterThan(0);
    }
  });
});

describe('docs structure: the navigation and the footer are localised through the translation files (DOC-015)', () => {
  interface Label {
    label?: string;
    title?: string;
    type?: string;
    items?: Label[];
  }
  interface Config {
    themeConfig: { navbar: { title: string; logo: { alt: string }; items: Label[] }; footer: { copyright: string; links: Label[] } };
  }
  const messages = (file: string) =>
    JSON.parse(text(`docs/i18n/es/docusaurus-theme-classic/${file}.json`)) as Record<string, { message: string }>;

  it('has a Spanish message for every label, title and the copyright of the configuration, and none for a label that is gone', async () => {
    const { default: config } = (await import(join(ROOT, 'docs/docusaurus.config.js'))) as { default: Config };
    const { navbar, footer } = config.themeConfig;
    const navbarKeys = [
      'title',
      'logo.alt',
      ...navbar.items.filter((item) => item.type !== 'localeDropdown').map((item) => `item.label.${item.label}`),
    ];
    const footerKeys = [
      'copyright',
      ...footer.links.flatMap((group) => [
        `link.title.${group.title}`,
        ...(group.items ?? []).map((item) => `link.item.label.${item.label}`),
      ]),
    ];
    expect(Object.keys(messages('navbar')).sort()).toEqual([...navbarKeys].sort());
    expect(Object.keys(messages('footer')).sort()).toEqual([...footerKeys].sort());
    for (const file of ['navbar', 'footer']) {
      for (const [key, { message }] of Object.entries(messages(file)))
        expect({ file, key, translated: message.trim().length > 0 }).toEqual({ file, key, translated: true });
    }
  });
});

describe('docs structure: a page is published only when both languages are complete (DOC-016)', () => {
  const scratch: string[] = [];
  afterAll(() => {
    for (const directory of scratch) rmSync(directory, { recursive: true, force: true });
  });

  const GOOD = '# Title\n\nThis page is complete.\n';
  const SIDEBAR = "module.exports = { docsSidebar: ['guide/index'] };\n";

  /** The messages the validator prints for a repository holding these pages, and its exit code. */
  function validate(english: Record<string, string>, spanish: Record<string, string>): { code: number; output: string } {
    const root = mkdtempSync(join(tmpdir(), 'zplc-docs-structure-'));
    scratch.push(root);
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeFileSync(join(root, 'docs/sidebars.js'), SIDEBAR);
    for (const [base, pages] of [
      [EN_DIR, english],
      [ES_DIR, spanish],
    ] as const) {
      for (const [name, text] of Object.entries(pages)) {
        mkdirSync(dirname(join(root, base, name)), { recursive: true });
        writeFileSync(join(root, base, name), text);
      }
    }
    const result = Bun.spawnSync(['python3', '-B', 'tools/docs/validate_docs_pages.py', '--root', root], {
      cwd: ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    return { code: result.exitCode, output: result.stdout.toString() + result.stderr.toString() };
  }

  it('passes a page that has both languages with the same structure', () => {
    expect(validate({ 'guide/index.md': GOOD }, { 'guide/index.md': GOOD }).code).toBe(0);
  });

  it('fails an English page with no Spanish page, and a Spanish page with no English page', () => {
    const missingSpanish = validate({ 'guide/index.md': GOOD }, {});
    expect(missingSpanish.code).toBe(1);
    expect(missingSpanish.output).toContain('guide/index.md: has no Spanish page');
    const missingEnglish = validate({}, { 'guide/index.md': GOOD });
    expect(missingEnglish.code).toBe(1);
    expect(missingEnglish.output).toContain('es:guide/index.md: has no English page');
  });

  it('lets a draft, which the site does not publish, exist in one language', () => {
    expect(
      validate({ 'guide/index.md': GOOD, 'guide/later.md': '---\ndraft: true\n---\n\nNot published.\n' }, { 'guide/index.md': GOOD }).code,
    ).toBe(0);
  });

  it('fails a pair that differs in headings, code blocks, tables, admonitions or address', () => {
    const table = '| A | B |\n| - | - |\n| 1 | 2 |\n';
    const english = {
      'guide/index.md': `---\nslug: /guide\n---\n\n# A\n\n## B\n\n\`\`\`sh\nls\n\`\`\`\n\n${table}\n:::note\nRead this.\n:::\n\nDone.\n`,
    };
    const spanish = { 'guide/index.md': '---\nslug: /guia\n---\n\n# A\n\nHecho.\n' };
    const { code, output } = validate(english, spanish);
    expect(code).toBe(1);
    for (const fragment of [
      'heading structure differs',
      'number of code blocks differs',
      'number of tables differs',
      'number of admonitions differs',
      'front matter `slug` differs',
    ]) {
      expect(output).toContain(fragment);
    }
  });

  it('fails a Spanish page that repeats the English sentences instead of translating them', () => {
    const page = `# Title\n\n${Array.from({ length: 6 }, (_, number) => `This is the sentence number ${number} of the page.`).join(
      '\n\n',
    )}\n`;
    const { code, output } = validate({ 'guide/index.md': page }, { 'guide/index.md': page });
    expect(code).toBe(1);
    expect(output).toContain('translate it');
  });

  it('holds for the pages of this repository', () => {
    const result = Bun.spawnSync(['python3', '-B', 'tools/docs/validate_docs_pages.py'], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
    expect({ code: result.exitCode, output: result.stdout.toString() + result.stderr.toString() }).toMatchObject({ code: 0 });
  });
});

describe("docs site: admonitions in the generator's own syntax and no version selector for one version (DOC-018)", () => {
  it('uses `:::` admonitions in every page and generated page, and none of the GitHub alert syntax', () => {
    for (const base of [EN_DIR, ES_DIR]) {
      for (const file of markdownFiles(ROOT, base)) {
        const alerts = text(file)
          .split('\n')
          .filter((line) => /^>\s*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i.test(line));
        expect({ file, alerts }).toEqual({ file, alerts: [] });
      }
    }
  });

  it('shows no version dropdown while one version is published, and the first snapshot brings it back', () => {
    // the site has the current docs and one version per entry of versions.json: a selector needs two to choose from
    const versions = JSON.parse(text('docs/versions.json')) as string[];
    const config = text('docs/docusaurus.config.js');
    if (versions.length === 0) expect(config).not.toContain("'docsVersionDropdown'");
    else expect(config).toContain("'docsVersionDropdown'");
  });
});

// DOC-015 / decision D-10: the Spanish pages speak in one register, neutral with "usted". The voseo and tuteo forms that were
// found in the pages are the ones listed; a new one in a page fails here.
describe('the Spanish pages keep the neutral usted register (DOC-015, D-10)', () => {
  const voseo = new RegExp(
    String.raw`(?<![\w\`/.-])(?:[A-Za-zñ]{3,}(?:á|é|í)(?:lo|la|los|las)?|tu|tus|tienes|puedes|quieres|debes|necesitas|ingreses|` +
      String.raw`asumas|confíes)(?![\wáéíóú])`,
    'g',
  );
  const allowed = new Set([
    'allá',
    'está',
    'será',
    'esté',
    'aquí',
    'así',
    'allí',
    'relé',
    'también',
    'además',
    'según',
    'quizá',
    'ahí',
    'sí',
    'mí',
  ]);
  it('has no voseo imperative or tuteo form in a page', () => {
    const found: string[] = [];
    for (const page of markdownFiles(ROOT, ES_DIR)) {
      const body = text(page).replace(/^```[\s\S]*?^```/gm, '');
      for (const match of body.matchAll(voseo)) {
        const word = match[0].toLowerCase();
        if (allowed.has(word) || /(?:rá|ará|erá|irá)$/.test(word)) continue;
        found.push(`${page}: ${match[0]}`);
      }
    }
    expect(found).toEqual([]);
  });

  // The same deny-list of voseo forms as the application's Spanish catalogs (tools/ci/i18n-guard.ts), so that a short form
  // the pattern above cannot see ("usá", two letters before the accent) fails too, in any file of the Spanish site:
  // pages, partials and the translation files of the navigation. Code is not prose, so fenced blocks and code spans are left out,
  // and so is a single word in italics: that is how a page cites a word as a word (the glossary names the register it avoids, _vos_; a
  // formatter writes italics with underscores).
  it('DOC-015: no Spanish docs page or translation file uses a voseo form of the application deny-list', () => {
    const files: string[] = [];
    const walk = (directory: string) => {
      for (const entry of readdirSync(join(ROOT, directory), { withFileTypes: true })) {
        const path = `${directory}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (/\.(?:mdx?|json)$/.test(entry.name)) files.push(path);
      }
    };
    walk('docs/i18n/es');
    const found: string[] = [];
    for (const file of files) {
      const lines = text(file)
        .replace(/^```[\s\S]*?^```/gm, (block) => block.replace(/[^\n]/g, ''))
        .split('\n');
      lines.forEach((line, index) => {
        const match = VOSEO_MARKERS.exec(line.replace(/`[^`]*`/g, '').replace(/(?<![*_])[*_]\p{L}+[*_](?![*_])/gu, ''));
        if (match) found.push(`${file}:${index + 1}: ${match[0]}`);
      });
    }
    expect(found).toEqual([]);
  });
});

// DOC-015: the review of the Spanish pages found these wrong or non-standard variants. Each one is a word that the glossary
// (docs/docs/learn/glossary.md) or the review replaced by a standard Spanish term; a new use of one fails here, so the pages keep
// one term for one concept. The list is short and explicit on purpose: when a review finds a new wrong form, it is added.
describe('the Spanish pages keep one standard term for each concept (DOC-015)', () => {
  const DENIED: [RegExp, string][] = [
    [/\b[Ss]cans?\b/, 'ciclo (the glossary: a pass of the program is "un ciclo")'],
    [/\bfallos?\b/i, 'falla (the glossary)'],
    [/\bstarters?\b/i, 'proyecto inicial (the glossary)'],
    [/\bschedulers?\b/i, 'planificador'],
    [/\b[Tt]imers?\b/, 'temporizador'],
    [/\b[Pp]ayloads?\b/, 'contenido (the glossary)'],
    [/\bt[óo]picos?\b/i, 'tema (the glossary: an MQTT topic)'],
    [/\bsuscriptas?\b/i, 'suscrita'],
    [/\bpedidos?\b/i, 'solicitud (the glossary: a request)'],
    [/\bpresion(?:e|ar|a|an)\b/i, 'pulse, pulsar'],
    [/\bingrese\b/i, 'escriba'],
    [/\breportes?\b/i, 'informe'],
    [/\bissues?\b/i, 'incidencia'],
    [/\bchequeos?\b/i, 'comprobación'],
    [/\bsoporte de hardware\b/i, 'compatibilidad de hardware'],
    [/\bAWS IoT N[úu]cleo\b/, 'AWS IoT Core (a product name is not translated)'],
    [/\bdeje caer\b|\bdeja caer\b/i, 'deje que EN baje'],
    [/\b(?:Placas Soportadas|Modelo de Memoria|Biblioteca Est[áa]ndar)\b/, 'sentence case in a link or heading'],
    [
      new RegExp(
        String.raw`\b(?:Texto Estructurado|Lista de Instrucciones|Diagrama de Escalera|Diagrama de Bloques de Funci[óo]n|` +
          String.raw`Diagrama Funcional Secuencial)\b`,
      ),
      'the glossary names, in sentence case (texto estructurado, lista de instrucciones...)',
    ],
    [/\b(?:el|la|un|una) (?:build|checkout)s?\b/i, 'compilación, copia de trabajo'],
    [/\blayouts?\b/i, 'disposición'],
    [/\bflags\b/i, 'indicadores'],
    [/\bgr[áa]ficos? (?:de funciones? secuenciales?|funcional de secuencias?)\b/i, 'diagrama funcional secuencial (the glossary)'],
    // second person singular of the preterite (tuteo): the pages address the reader with "usted" or an impersonal form
    [/\b(?:instal|enlaz|marc|configur|cre|escrib|elegi|abri|conect|guard)(?:aste|iste)\b/i, 'usted or an impersonal form'],
  ];
  // These three pages carry text that the source keeps in English by design (the C headers, the Kconfig help and the notes of a board),
  // so a word of the list can appear in them as a quotation.
  const QUOTING = new Set([`${ES_DIR}/reference/runtime-api.md`, `${ES_DIR}/reference/kconfig.md`, `${ES_DIR}/reference/boards.md`]);

  it('has no denied variant in the prose of a page', () => {
    const found: string[] = [];
    for (const page of markdownFiles(ROOT, ES_DIR)) {
      if (QUOTING.has(page) || page.startsWith(`${ES_DIR}/learn/`)) continue;
      // a generated region quotes descriptions that the source keeps in English; the Spanish strings of its generator are reviewed there
      const prose = text(page)
        .replace(/\{\/\* >>> GENERATED[\s\S]*?<<< \*\/\}/g, '')
        .replace(/^````[\s\S]*?^````/gm, (block) => block.replace(/[^\n]/g, '')) // a four-backtick fence that shows a fence
        .replace(/^```[\s\S]*?^```/gm, (block) => block.replace(/[^\n]/g, ''))
        .replace(/`[^`\n]*`/g, '')
        .replace(/\]\([^)\n]*\)/g, ']()')
        .replace(/^(?:slug|id|tags):.*$/gm, '')
        .replace(/\w+(?:[-_/.]\w+)+/g, ''); // a kebab-case id, a path or an identifier is not prose
      prose.split('\n').forEach((line, index) => {
        for (const [pattern, use] of DENIED) {
          const match = pattern.exec(line);
          if (match) found.push(`${page}:${index + 1}: "${match[0]}", use ${use}`);
        }
      });
    }
    expect(found).toEqual([]);
  });
});
