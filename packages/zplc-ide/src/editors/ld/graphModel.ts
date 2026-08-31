import { isContact, isFunctionBlock, type LDElement, type LDModel, type LDRung, type LDVariable } from '../../models/ld';
import { transpileLDToST } from '../../transpiler/ldToST';

export interface LDClipboardFragment {
  rung: LDRung;
  localVariables: LDVariable[];
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function key(value: string): string {
  return value.toLowerCase();
}

function uniqueCaseInsensitive(base: string, existing: Iterable<string>): string {
  const names = new Set([...existing].map(key));
  if (!names.has(key(base))) return base;
  let suffix = 2;
  while (names.has(key(`${base}_${suffix}`))) suffix += 1;
  return `${base}_${suffix}`;
}

function rungElements(rung: LDRung): LDElement[] | undefined {
  if (rung.grid !== undefined) {
    if (!Array.isArray(rung.grid)) return undefined;
    const elements: LDElement[] = [];
    for (const row of rung.grid) {
      if (!Array.isArray(row)) return undefined;
      for (const cell of row) {
        if (!cell || typeof cell !== 'object' || !('element' in cell)) return undefined;
        if (cell.element !== null) elements.push(cell.element);
      }
    }
    return elements;
  }
  return Array.isArray(rung.elements) ? rung.elements : undefined;
}

function functionBlockInstances(rung: LDRung): Array<{ instance: string; type: string }> | undefined {
  const elements = rungElements(rung);
  if (!elements) return undefined;
  const instances = new Map<string, { instance: string; type: string }>();
  for (const element of elements) {
    if (!isFunctionBlock(element.type)) continue;
    if (typeof element.instance !== 'string' || typeof element.fbType !== 'string') return undefined;
    const current = instances.get(key(element.instance));
    if (current && key(current.type) !== key(element.fbType)) return undefined;
    instances.set(key(element.instance), { instance: element.instance, type: element.fbType });
  }
  return [...instances.values()];
}

function allVariableNames(model: LDModel): string[] {
  return [...model.variables.local, ...(model.variables.inputs ?? []), ...model.variables.outputs].map((variable) => variable.name);
}

function rewriteContactMemberReference(element: LDElement, instances: Map<string, string>): LDElement {
  if (!isContact(element.type) || typeof element.variable !== 'string') return element;
  const match = element.variable.match(/^([A-Za-z_][A-Za-z0-9_]*)\.(.+)$/);
  const replacement = match && instances.get(key(match[1]));
  return replacement ? { ...element, variable: `${replacement}.${match![2]}` } : element;
}

function cloneRungWithIds(rung: LDRung, model: LDModel, fragmentLocals: LDVariable[]): LDRung | undefined {
  const copied = clone(rung);
  const sourceInstances = functionBlockInstances(copied);
  if (!sourceInstances) return undefined;
  const sourceLocals = new Map(fragmentLocals.map((variable) => [key(variable.name), variable]));
  if (sourceLocals.size !== fragmentLocals.length || sourceLocals.size !== sourceInstances.length) return undefined;

  const localNames = allVariableNames(model);
  const instances = new Map<string, string>();
  for (const source of sourceInstances) {
    const local = sourceLocals.get(key(source.instance));
    if (!local || key(local.type) !== key(source.type)) return undefined;
    const name = uniqueCaseInsensitive(`${source.instance}_copy`, localNames);
    localNames.push(name);
    instances.set(key(source.instance), name);
  }

  const rungIds = model.rungs.map((candidate) => candidate.id);
  copied.id = uniqueCaseInsensitive(`${copied.id}_copy`, rungIds);
  const elementIds = model.rungs.flatMap((candidate) => rungElements(candidate) ?? []).map((element) => element.id);
  const updateElement = (element: LDElement): LDElement => {
    const id = uniqueCaseInsensitive(`${element.id}_copy`, elementIds);
    elementIds.push(id);
    const withId = { ...element, id };
    const instance = isFunctionBlock(withId.type) && typeof withId.instance === 'string'
      ? instances.get(key(withId.instance))
      : undefined;
    return rewriteContactMemberReference(instance ? { ...withId, instance } : withId, instances);
  };
  if (copied.grid !== undefined) {
    if (!Array.isArray(copied.grid)) return undefined;
    copied.grid = copied.grid.map((row) => Array.isArray(row) ? row.map((cell) => cell.element === null ? { ...cell } : { ...cell, element: updateElement(cell.element) }) : row);
  } else if (copied.elements !== undefined) {
    if (!Array.isArray(copied.elements)) return undefined;
    copied.elements = copied.elements.map(updateElement);
  } else return undefined;

  if (copied.branches !== undefined) {
    if (!Array.isArray(copied.branches)) return undefined;
    const branchIds = model.rungs.flatMap((candidate) => candidate.branches ?? []).map((branch) => branch.id);
    const remapped = new Map<string, string>();
    copied.branches.forEach((branch) => {
      const id = uniqueCaseInsensitive(`${branch.id}_copy`, branchIds);
      branchIds.push(id);
      remapped.set(key(branch.id), id);
      branch.id = id;
    });
    copied.branches.forEach((branch) => {
      if (branch.parentBranchId) branch.parentBranchId = remapped.get(key(branch.parentBranchId)) ?? branch.parentBranchId;
    });
  }
  return copied;
}

/** Copies one canonical rung and the local FB declarations it owns. */
export function copyLDRungFragment(model: LDModel, rungId: string): LDClipboardFragment | undefined {
  const rung = model.rungs.find((candidate) => candidate.id === rungId);
  if (!rung) return undefined;
  try {
    const instances = functionBlockInstances(rung);
    if (!instances) return undefined;
    const locals = instances.map(({ instance, type }) => {
      const local = model.variables.local.find((variable) => key(variable.name) === key(instance));
      return local && key(local.type) === key(type) ? clone(local) : undefined;
    });
    if (locals.some((local) => !local)) return undefined;
    return { rung: clone(rung), localVariables: locals as LDVariable[] };
  } catch {
    return undefined;
  }
}

/** Returns one fully validated model snapshot or nothing; no partial paste is exposed. */
export function pasteLDRungFragment(model: LDModel, fragment: LDClipboardFragment, afterRungId: string): LDModel | undefined {
  try {
    if (!fragment || typeof fragment !== 'object' || !fragment.rung || !Array.isArray(fragment.localVariables)) return undefined;
    const after = model.rungs.findIndex((rung) => rung.id === afterRungId);
    if (after < 0) return undefined;
    const copied = cloneRungWithIds(fragment.rung, model, fragment.localVariables);
    if (!copied) return undefined;
    const sourceInstances = functionBlockInstances(fragment.rung);
    if (!sourceInstances) return undefined;
    const localNames = allVariableNames(model);
    const localVariables = sourceInstances.map(({ instance }) => {
      const source = fragment.localVariables.find((variable) => key(variable.name) === key(instance));
      if (!source) return undefined;
      const name = uniqueCaseInsensitive(`${instance}_copy`, localNames);
      localNames.push(name);
      return { ...clone(source), name };
    });
    if (localVariables.some((variable) => !variable)) return undefined;
    const rungs = [...model.rungs.slice(0, after + 1), copied, ...model.rungs.slice(after + 1)].map((rung, index) => ({ ...rung, number: index + 1 }));
    const candidate: LDModel = { ...model, variables: { ...model.variables, local: [...model.variables.local, ...(localVariables as LDVariable[])] }, rungs };
    return transpileLDToST(candidate).success ? candidate : undefined;
  } catch {
    return undefined;
  }
}
