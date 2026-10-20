/**
 * The recorder of the screen-reader check (UX-028, LRN-037). It drives the real Electron app with key presses only and, at every
 * stop, writes what a screen reader is given by the browser: the role, the accessible name, the description, the state and the
 * value of the focused element, read from Chromium's own accessibility tree over the DevTools protocol, plus the text of the two
 * live regions. It is not a screen reader: the words a person hears depend on the product (NVDA, JAWS, VoiceOver) that turns
 * this tree into speech. Pure helpers that need no app (`spoken`, `judgeStops`) are exported so they can be tested.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { App } from './journeyApp';

/** The roles a person operates: a stop on one of them without an accessible name is an unnamed control. */
export const OPERABLE_ROLES = new Set([
  'button', 'link', 'textbox', 'searchbox', 'checkbox', 'switch', 'radio', 'combobox', 'listbox', 'option', 'tab', 'menuitem',
  'menuitemcheckbox', 'menuitemradio', 'treeitem', 'DisclosureTriangle', 'slider', 'spinbutton', 'textarea', 'gridcell', 'row', 'cell', 'columnheader',
]);

/** What the accessibility tree says about one node. */
export interface Node {
  role: string; name: string; description: string; value: string;
  /** Booleans of the tree that matter to a listener: checked, pressed, expanded, selected, disabled, required, invalid, busy. */
  states: string[];
}
export interface Focus extends Node {
  /** The landmarks and containers the node sits in, outermost first: where a listener would say they are. */
  within: Array<{ role: string; name: string }>;
  /** The words a screen reader typically builds from the node: name, role, state, description. A reading of the tree, not a recording. */
  spoken: string;
  /** The element, for the record of a person reading the screenshot: tag and id or data attribute. */
  element: string;
}
export interface Announcement { region: 'polite' | 'assertive'; source?: string; text: string }
/** `optional` marks a stop where no focus is expected (a window that has only just opened). */
export interface Stop { how: string; focus: Focus | null; announced: Announcement[]; optional?: boolean }
export interface Check { description: string; ok: boolean; detail: string }
export type Result = 'pass' | 'fail' | 'not-run';
export interface StepRecord {
  id: string; title: string; criterion: string; actions: string[]; stops: Stop[]; announced: Announcement[]; facts: Record<string, string>;
  checks: Check[]; result: Result; notRunReason?: string; screenshot?: string;
}

/** The words a listener gets from a node: name first, then the role, the state, the value and the description. */
export function spoken(node: Node): string {
  const parts = [node.name || '(no name)', node.role, ...node.states];
  if (node.value && node.value !== node.name) parts.push(`value ${node.value}`);
  let text = parts.join(', ');
  if (node.description) text += `. ${node.description}`;
  return text;
}

/** The checks every stop must pass whatever the step: an operable control has a name, and the focus is on something. */
export function judgeStops(stops: Stop[]): Check[] {
  const checks: Check[] = [];
  const lost = stops.filter((stop) => stop.focus === null && !stop.optional);
  checks.push({ description: 'the focus is never lost to the page body', ok: lost.length === 0, detail: lost.map((stop) => stop.how).join('; ') });
  const unnamed = stops.filter((stop) => stop.focus !== null && OPERABLE_ROLES.has(stop.focus.role) && stop.focus.name.trim() === '');
  checks.push({ description: 'every control reached has an accessible name', ok: unnamed.length === 0, detail: unnamed.map((stop) => `${stop.how}: ${stop.focus!.role} ${stop.focus!.element}`).join('; ') });
  return checks;
}

type Cdp = App['cdp'];
interface AxValue { value?: unknown }
interface AxNode { nodeId: string; parentId?: string; ignored?: boolean; backendDOMNodeId?: number; role?: AxValue; name?: AxValue; description?: AxValue; value?: AxValue; properties?: Array<{ name: string; value: AxValue }> }
const text = (value: AxValue | undefined): string => (value?.value === undefined || value.value === null ? '' : String(value.value));
const STATE_NAMES = ['checked', 'pressed', 'expanded', 'selected', 'disabled', 'required', 'invalid', 'busy', 'readonly', 'modal', 'multiline'];
const CONTAINERS = new Set(['dialog', 'alertdialog', 'region', 'navigation', 'main', 'complementary', 'toolbar', 'tablist', 'tabpanel', 'form', 'banner', 'contentinfo', 'status', 'alert', 'tree', 'list', 'table', 'grid', 'menu', 'group', 'radiogroup', 'search']);

function nodeOf(ax: AxNode): Node {
  const states: string[] = [];
  for (const property of ax.properties ?? []) {
    if (!STATE_NAMES.includes(property.name)) continue;
    const value = text(property.value);
    // "false" is worth saying for the states a person toggles: a closed disclosure is "collapsed", an off switch "not checked".
    if (value === 'false' && property.name === 'expanded') { states.push('collapsed'); continue; }
    if (value === 'false' && (property.name === 'checked' || property.name === 'pressed')) { states.push(`not ${property.name}`); continue; }
    if (value === 'false' || value === 'undefined' || value === '') continue;
    states.push(value === 'true' ? property.name : `${property.name} ${value}`);
  }
  return { role: text(ax.role), name: text(ax.name), description: text(ax.description), value: text(ax.value), states };
}

/** The accessibility record of the DOM node behind a remote object. */
export async function axOfObject(cdp: Cdp, objectId: string): Promise<Focus | null> {
  const described = await cdp.command('DOM.describeNode', { objectId }) as { node: { backendNodeId: number; nodeName: string; attributes?: string[] } };
  const { nodes } = await cdp.command('Accessibility.getPartialAXTree', { backendNodeId: described.node.backendNodeId, fetchRelatives: true }) as { nodes: AxNode[] };
  const own = nodes.find((node) => node.backendDOMNodeId === described.node.backendNodeId && !node.ignored) ?? nodes.find((node) => node.backendDOMNodeId === described.node.backendNodeId);
  if (!own) return null;
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const within: Focus['within'] = [];
  for (let parent = own.parentId ? byId.get(own.parentId) : undefined; parent; parent = parent.parentId ? byId.get(parent.parentId) : undefined) {
    const role = text(parent.role);
    if (CONTAINERS.has(role) && (text(parent.name) !== '' || role === 'dialog' || role === 'alertdialog')) within.unshift({ role, name: text(parent.name) });
  }
  const attributes = described.node.attributes ?? [];
  const pick = (name: string) => { const at = attributes.indexOf(name); return at >= 0 ? attributes[at + 1] : undefined; };
  const dataAttribute = attributes.find((name, index) => index % 2 === 0 && name.startsWith('data-'));
  const element = `${described.node.nodeName.toLowerCase()}${pick('id') ? `#${pick('id')}` : ''}${dataAttribute ? `[${dataAttribute}]` : ''}`;
  const node = nodeOf(own);
  return { ...node, within, spoken: spoken(node), element };
}

/**
 * Every live region the page has now or mounts later: the two of the shared announcer (`data-live-region`) and any other element a
 * screen reader treats as live (`role` status, alert or log, or `aria-live` other than off). The log records each text they are
 * given, with the region's politeness and a label of where it came from.
 */
const LIVE = '[data-live-region], [role="status"], [role="alert"], [role="log"], [aria-live]:not([aria-live="off"])';
const INSTALL_LOG = `(() => {
  if (window.__srLog) return true;
  window.__srLog = [];
  const politeness = (el) => { const live = el.getAttribute('aria-live'); if (live === 'assertive' || el.getAttribute('role') === 'alert') return 'assertive'; return 'polite'; };
  const label = (el) => el.getAttribute('data-live-region') ? 'announcer' : (el.getAttribute('aria-label') || el.getAttribute('role') || el.className?.toString().slice(0, 30) || el.tagName.toLowerCase());
  const watch = () => { for (const region of document.querySelectorAll(${JSON.stringify(LIVE)})) { if (region.__srWatched) continue; region.__srWatched = true;
    let previous = region.textContent || '';
    new MutationObserver(() => { const raw = region.textContent || ''; const said = raw.replace(/\\u00a0/g, ' ').replace(/\\s+/g, ' ').trim(); if (said && raw !== previous) window.__srLog.push({ region: politeness(region), source: label(region), text: said.slice(0, 200) }); previous = raw; }).observe(region, { childList: true, characterData: true, subtree: true }); } };
  watch(); new MutationObserver(watch).observe(document.body, { childList: true, subtree: true });
  return true; })()`;

export class Recorder {
  readonly steps: StepRecord[] = [];
  private current: StepRecord | undefined;
  readonly images: Array<{ file: string; step: string; sha256: string; bytes: number; width: number; height: number }> = [];

  /** `onDemand` keeps the accessibility domain off between reads: while it is on, Chromium rebuilds the tree at every change, which a live animation makes too slow. */
  constructor(private readonly app: App, private readonly directory: string, private readonly prefix: string, private readonly scale = 0.75, private readonly onDemand = false) {
    mkdirSync(directory, { recursive: true });
  }

  /** Installs the announcement log and the accessibility domain; call again after a page reload. */
  async prepare(): Promise<void> {
    if (!this.onDemand) await this.app.cdp.command('Accessibility.enable');
    await this.app.eval(INSTALL_LOG);
  }

  begin(id: string, title: string, criterion: string): void {
    this.current = { id, title, criterion, actions: [], stops: [], announced: [], facts: {}, checks: [], result: 'pass' };
    this.steps.push(this.current);
  }
  private get step(): StepRecord { if (!this.current) throw new Error('begin a step first'); return this.current; }

  /** The announcements since the last call, in order, with consecutive repeats of the same text kept (a re-announcement is an event). */
  async drain(): Promise<Announcement[]> {
    const said = await this.app.eval<Announcement[]>('(window.__srLog || []).splice(0)');
    this.step.announced.push(...said);
    return said;
  }

  /** Runs a protocol call again when the page was too busy to answer it (the machine runs other work at the same time). */
  private async patient<T>(call: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try { return await call(); } catch (error) {
        if (attempt >= 8 || !/timed out|collected/i.test(error instanceof Error ? error.message : String(error))) throw error;
        await Bun.sleep(1_000);
      }
    }
  }

  /** The accessibility record of whatever has the focus now, or null when nothing but the page does. */
  async focus(): Promise<Focus | null> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const found = await this.patient(() => this.focusOnce());
      if (found !== undefined && (found !== null || attempt >= 1)) return found;
      await Bun.sleep(300);
    }
    return null;
  }

  /** `undefined` when the element has focus but the tree has no node for it yet; `null` when only the page has the focus. */
  private async focusOnce(): Promise<Focus | null | undefined> {
    const { result } = await this.app.cdp.command('Runtime.evaluate', { expression: '(() => { const el = document.activeElement; return el && el !== document.body && el !== document.documentElement ? el : null; })()' }) as { result: { objectId?: string; subtype?: string } };
    if (!result.objectId || result.subtype === 'null') return null;
    if (this.onDemand) await this.app.cdp.command('Accessibility.enable');
    try { return (await axOfObject(this.app.cdp, result.objectId)) ?? undefined; } finally { if (this.onDemand) await this.app.cdp.command('Accessibility.disable'); }
  }

  /** Records a stop where the focus is now, after whatever the action was. */
  async stop(how: string, optional = false): Promise<Stop> {
    // two frames and a moment: a loaded machine handles the key press late, and the focus is read after it has been handled
    await this.patient(() => this.app.eval('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 80))))'));
    const stop: Stop = { how, focus: await this.focus(), announced: await this.drain(), ...(optional ? { optional } : {}) };
    this.step.stops.push(stop);
    return stop;
  }

  /** A real key press, then a stop. */
  async key(chord: string, how = `press ${chord}`, optional = false): Promise<Stop> {
    this.step.actions.push(chord);
    await this.app.press(chord);
    return this.stop(how, optional);
  }

  /** Text inserted as typed, with no stop of its own (the next key records the result). */
  async type(value: string): Promise<void> {
    this.step.actions.push(`type "${value}"`);
    await this.app.type(value);
  }

  /** Presses `key` until the focus satisfies `condition` (an expression on `el`); every stop on the way is recorded. */
  async reach(what: string, condition: string, key = 'Tab', max = 60, record = true): Promise<Stop> {
    const matches = () => this.app.eval<boolean>(`(() => { const el = document.activeElement; return Boolean(el) && el !== document.body && (${condition}); })()`);
    for (let presses = 0; presses <= max; presses++) {
      if (await matches()) { const last = this.step.stops.at(-1); if (last && presses > 0) return last; return this.stop(`already on ${what}`); }
      await this.key(key, `${key} toward ${what}`);
    }
    if (record) this.check(`${what} is reached with ${key}`, false, `not reached in ${max} presses`);
    throw new Error(`${what} was not reached with ${key} in ${max} presses`);
  }

  fact(name: string, value: string): void { this.step.facts[name] = value; }
  check(description: string, ok: boolean, detail = ''): void { this.step.checks.push({ description, ok, detail }); }

  /** The announcements so far in this step that satisfy `pattern`. */
  said(pattern: RegExp): Announcement[] { return this.step.announced.filter((entry) => pattern.test(entry.text)); }
  /** Waits for an announcement and records the check. */
  async expectAnnounced(description: string, pattern: RegExp, timeoutMs = 8_000): Promise<boolean> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      await this.drain();
      if (this.said(pattern).length > 0) { this.check(description, true, this.said(pattern)[0]!.text); return true; }
      await Bun.sleep(150);
    }
    this.check(description, false, `no announcement matched ${pattern}; heard ${JSON.stringify(this.step.announced.map((entry) => `${entry.region}: ${entry.text}`))}`);
    return false;
  }

  /** A screenshot of the window as the step ends, scaled down so the folder stays small. */
  async shot(name: string): Promise<string> {
    const { data } = await this.app.cdp.command('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1440, height: 900, scale: this.scale } }) as { data: string };
    const bytes = Buffer.from(data, 'base64');
    const file = `${this.prefix}-${name}.png`;
    writeFileSync(join(this.directory, file), bytes);
    this.images.push({ file, step: `${this.step.id} ${this.step.title}`, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });
    this.step.screenshot = file;
    return file;
  }

  /** The text of the two live regions and their accessibility roles, for the record. */
  async liveRegions(): Promise<Array<{ region: string; role: string; live: string; text: string }>> {
    const out: Array<{ region: string; role: string; live: string; text: string }> = [];
    for (const region of ['polite', 'assertive']) {
      const { result } = await this.app.cdp.command('Runtime.evaluate', { expression: `document.querySelector('[data-live-region="${region}"]')` }) as { result: { objectId?: string; subtype?: string } };
      if (!result.objectId || result.subtype === 'null') { out.push({ region, role: '(missing)', live: '', text: '' }); continue; }
      const described = await this.app.cdp.command('DOM.describeNode', { objectId: result.objectId }) as { node: { backendNodeId: number } };
      const { nodes } = await this.app.cdp.command('Accessibility.getPartialAXTree', { backendNodeId: described.node.backendNodeId, fetchRelatives: false }) as { nodes: AxNode[] };
      const own = nodes.find((node) => node.backendDOMNodeId === described.node.backendNodeId) ?? nodes[0]!;
      const live = text(own.properties?.find((property) => property.name === 'live')?.value);
      const content = await this.app.eval<string>(`(document.querySelector('[data-live-region="${region}"]')?.textContent ?? '').replace(/\\u00a0/g, '').trim()`);
      out.push({ region, role: text(own.role), live, text: content });
    }
    return out;
  }

  /** Closes the step: the generic checks over its stops plus the ones the step added decide the result. */
  end(notRun?: string): StepRecord {
    const step = this.step;
    if (notRun) { step.result = 'not-run'; step.notRunReason = notRun; return step; }
    step.checks.unshift(...judgeStops(step.stops));
    step.result = step.checks.every((check) => check.ok) ? 'pass' : 'fail';
    this.current = undefined;
    return step;
  }
}
