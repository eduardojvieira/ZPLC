/**
 * The project navigator organised by PLC objects (UX-012): groups that open, each object opens its file at its line or its configuration
 * editor.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useT, type MessageKey } from '../i18n';
import { useProjectSources } from '../store/projectSources';
import { useIDEStore } from '../store/useIDEStore';
import { useNavigatorReveal } from '../store/useNavigationHistory';
import { projectGlobalVariables } from '../project/globalVariables';
import { Button, Dialog, MenuButton, Select, TextField, type MenuItem } from '../ui';
import { loadPlantEngine } from '../plant/ui/loadPlantEngine';
import { useProjectSceneTexts, useProjectScenes } from '../plant/ui/usePlantSession';
import { runCommand } from '../commands/bus';
import type { CommandId } from '../commands/registry';
import {
  buildNavigatorGroups,
  type NavigatorGroup,
  type NavigatorGroupId,
  type NavigatorItem,
  type NavigatorTarget,
} from './navigatorGroups';
import { navigatorWords } from './navigatorWords';
import { NewObjectButton } from './NewObjectMenu';
import { GROUP_NEW_KIND, selectItem } from './navigatorRequests';
import { openConfigEditorFromNavigator } from './openConfigEditor';
import { addPlant, defaultPlantName, openPlant, plantItems, plantTemplates, type PlantGroupModel } from './plantGroup';

interface ObjectNavigatorViewProps {
  groups: readonly NavigatorGroup[];
  collapsed: ReadonlySet<NavigatorGroupId>;
  onToggle: (id: NavigatorGroupId) => void;
  onOpen: (target: NavigatorTarget) => void;
  /** The Plant group (PLS-011); absent while the project is not read. */
  plant?: PlantGroupModel;
}

const ITEM_COMMANDS: ReadonlyArray<{ id: string; command: CommandId; key: MessageKey; destructive?: boolean }> = [
  { id: 'rename', command: 'project.rename', key: 'command.project.rename' },
  { id: 'move', command: 'project.moveFile', key: 'command.project.moveFile' },
  { id: 'duplicate', command: 'project.duplicate', key: 'command.project.duplicate' },
  { id: 'delete', command: 'project.delete', key: 'command.project.delete', destructive: true },
];

/** The item menu of the object view: the commands of the tree menu, run on the item's file (a task is only renamed, in place). */
function ItemMenu({ item }: { item: NavigatorItem }) {
  const { t } = useT();
  if (!item.subject) return null;
  const subject = item.subject;
  const items: MenuItem[] = ITEM_COMMANDS.filter((entry) => subject.kind === 'path' || entry.id === 'rename').map((entry) => ({
    id: entry.id,
    label: t(entry.key),
    destructive: entry.destructive,
    onSelect: () => {
      selectItem(subject);
      runCommand(entry.command);
    },
  }));
  return (
    <MenuButton label={t('newObject.itemActions', { name: item.label })} items={items} variant="ghost" size="sm" placement="bottom-end">
      <span className="sr-only">{t('newObject.itemMenu')}</span>
    </MenuButton>
  );
}

/** "Add a plant": the templates and a name, then the plant is saved into the project and opened (SCN-016). */
function AddPlant({ plant }: { plant: PlantGroupModel }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState(plant.templates[0]?.value ?? '');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const field = useRef<HTMLInputElement>(null);
  const close = () => setOpen(false);
  const submit = async () => {
    if (plant.existing.includes(name)) return setError(t('plant.panel.saveExists', { name }));
    try {
      await plant.onAdd(template, name);
      close();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };
  const choose = (value: string) => {
    setTemplate(value);
    setName(defaultPlantName(value, plant.existing));
    setError(undefined);
  };
  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          choose(template);
          setOpen(true);
        }}
      >
        {t('plant.activity.add')}
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title={t('plant.activity.add')}
        description={t('navigator.plant.hint')}
        initialFocus={field}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              {t('plant.panel.saveCancel')}
            </Button>
            <Button onClick={() => void submit()}>{t('navigator.plant.create')}</Button>
          </>
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Select label={t('navigator.plant.template')} value={template} onChange={(event) => choose(event.target.value)}>
            {plant.templates.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </Select>
          <TextField
            ref={field}
            label={t('plant.panel.saveName')}
            value={name}
            error={error}
            onChange={(event) => {
              setName(event.target.value);
              setError(undefined);
            }}
          />
        </form>
      </Dialog>
    </>
  );
}

/** The Plant group: the scene and the plant map when the project has a plant, else the action that adds one. */
function PlantSection({ plant }: { plant: PlantGroupModel }) {
  const { t } = useT();
  return (
    <section data-navigator-group="plant">
      <div className="px-2 py-1 font-medium">{t('navigator.group.plant')}</div>
      {plant.items.length === 0 ? (
        <div className="py-1 pl-8">
          <AddPlant plant={plant} />
        </div>
      ) : (
        <ul>
          {plant.items.map((item) => (
            <li key={item.key} className="flex items-center pr-1">
              <Button
                variant="ghost"
                size="sm"
                data-navigator-item={item.key}
                onClick={() => plant.onOpen(item.ref)}
                className="h-auto min-w-0 flex-1 justify-start py-1 pl-8 pr-2 text-left"
              >
                <span className="truncate">{item.label ?? t('navigator.plant.map')}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ObjectNavigatorView({ groups, collapsed, onToggle, onOpen, plant }: ObjectNavigatorViewProps) {
  const { t } = useT();
  return (
    <nav aria-label={t('navigator.region.label')} data-object-navigator className="h-full overflow-y-auto py-1 font-sans text-sm">
      {groups.map((group) => {
        const open = !collapsed.has(group.id);
        const title = t(group.titleKey);
        const kind = GROUP_NEW_KIND[group.id];
        return (
          <section key={group.id} data-navigator-group={group.id}>
            <div className="flex items-center pr-1">
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={open}
                onClick={() => onToggle(group.id)}
                className="min-w-0 flex-1 justify-start gap-1 px-2"
              >
                {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                <span className="font-medium">{title}</span>
                <span className="ml-auto text-[var(--color-surface-300)] tabular-nums">{group.items.length}</span>
              </Button>
              {kind && <NewObjectButton kind={kind} groupTitle={title} />}
            </div>
            {open &&
              (group.items.length === 0 ? (
                kind ? (
                  <div className="py-1 pl-8">
                    <NewObjectButton kind={kind} groupTitle={title} words />
                  </div>
                ) : (
                  <p className="px-8 py-1 text-[var(--color-surface-400)]">{t('navigator.empty')}</p>
                )
              ) : (
                <ul>
                  {group.items.map((item) => {
                    // The label and detail are cut with an ellipsis in a narrow sidebar: the tooltip reads them whole (UXV-004).
                    const full = item.detail ? `${item.label} — ${item.detail}` : item.label;
                    return (
                      <li key={item.key} className="flex items-center pr-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          tooltip={full}
                          data-tooltip={full}
                          data-navigator-item={item.key}
                          onClick={() => onOpen(item.target)}
                          className="h-auto min-w-0 flex-1 justify-start gap-2 py-1 pl-8 pr-2 text-left whitespace-normal"
                        >
                          <span className="truncate">{item.label}</span>
                          {item.detail && <span className="ml-auto truncate text-[var(--color-surface-400)]">{item.detail}</span>}
                        </Button>
                        <ItemMenu item={item} />
                      </li>
                    );
                  })}
                </ul>
              ))}
          </section>
        );
      })}
      {plant && <PlantSection plant={plant} />}
    </nav>
  );
}

export function ObjectNavigator() {
  const translator = useT();
  const sources = useProjectSources((state) => state.sources);
  const declarations = useProjectSources((state) => state.declarations);
  const fileTree = useIDEStore((state) => state.fileTree);
  const config = useIDEStore((state) => state.projectConfig);
  const open = useIDEStore((state) => state.navigateToCompilerDiagnostic);
  const [collapsed, setCollapsed] = useState<ReadonlySet<NavigatorGroupId>>(new Set());
  const globals = useMemo(() => projectGlobalVariables(sources), [sources]);
  const groups = useMemo(
    () => buildNavigatorGroups({ declarations, globals, fileTree, config }, navigatorWords(translator)),
    [declarations, globals, fileTree, config, translator],
  );
  // A step of the place bar asks for its group to be open and its item shown (FND-007).
  const nonce = useNavigatorReveal((state) => state.nonce);
  const revealGroup = useNavigatorReveal((state) => state.group);
  const revealItem = useNavigatorReveal((state) => state.item);
  const [seen, setSeen] = useState(nonce);
  if (nonce !== seen) {
    setSeen(nonce);
    if (revealGroup !== null && collapsed.has(revealGroup as NavigatorGroupId)) {
      const next = new Set(collapsed);
      next.delete(revealGroup as NavigatorGroupId);
      setCollapsed(next);
    }
  }
  useEffect(() => {
    if (nonce === 0 || revealItem === null) return;
    const frame = requestAnimationFrame(() => {
      const row = [...document.querySelectorAll<HTMLElement>('[data-navigator-item]')].find(
        (element) => element.dataset.navigatorItem === revealItem,
      );
      row?.scrollIntoView?.({ block: 'nearest' });
      row?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [nonce, revealItem]);
  const toggle = (id: NavigatorGroupId): void =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const onOpen = (target: NavigatorTarget): void => {
    if (target.kind === 'source') void open(target.path, target.line, target.column);
    else openConfigEditorFromNavigator(target.editor);
  };
  const handle = useIDEStore((state) => state.directoryHandle);
  const rootScene = useProjectSceneTexts().scene !== undefined;
  const scenes = useProjectScenes();
  const plant = useMemo<PlantGroupModel | undefined>(
    () =>
      handle
        ? {
            items: plantItems(rootScene, scenes.names),
            templates: plantTemplates(translator.t('plant.panel.emptyFloor'), translator.locale),
            existing: scenes.names,
            onOpen: openPlant,
            onAdd: async (template, name) => {
              await addPlant(handle, template, name, {
                shippedScene: async (id) => (await loadPlantEngine()).shippedScene(id),
                open: openPlant,
              });
              scenes.refresh();
            },
          }
        : undefined,
    [handle, rootScene, scenes, translator],
  );
  return <ObjectNavigatorView groups={groups} collapsed={collapsed} onToggle={toggle} onOpen={onOpen} plant={plant} />;
}
