/**
 * What the main process takes from the command registry to build the application menu (UX-014, UX-015). `electron:compile`
 * bundles this module into `electron-dist/commandMenu.js`, the way it bundles the tool API: the registry stays in the
 * renderer's source tree, and the main process holds no second list of commands. It exports data and the translator only;
 * nothing here runs a command.
 */
import { COMMAND_CATEGORIES, COMMAND_LIST, MENU_TITLE_KEYS, isCommandId } from './registry';
import { toAccelerator } from './shortcuts';
import { translate } from '../i18n/translate';
import type { Locale } from '../i18n/locale';

export const menuCommands = COMMAND_LIST.map((command) => ({
  id: command.id as string,
  titleKey: command.titleKey as string,
  category: command.category as string,
  accelerator: command.shortcut ? toAccelerator(command.shortcut) : null,
}));

export const menuCategories = COMMAND_CATEGORIES.map((category) => ({
  id: category as string,
  titleKey: MENU_TITLE_KEYS[category] as string,
}));

/** The closed list of command ids: a menu click for any other id is not sent. */
export const isRegisteredCommandId = (value: unknown): boolean => isCommandId(value);

export const menuTranslator =
  (locale: Locale) =>
  (key: string): string =>
    translate(locale, key);
