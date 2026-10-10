/**
 * The notification surface of the window (IDE-021): the result of a build, a save, a deploy and a connection change, and the
 * progress of a long operation with its cancel action, each one click from the panel that holds its details. The model and
 * its policy are in `store/notifications.ts`, the drawing in `NotificationsList.tsx`; this file wires them to the workbench.
 */
import { useEffect } from 'react';

import { useIDEStore } from '../store/useIDEStore';
import { useNotifications } from '../store/notifications';
import type { ConsoleTab } from '../types';
import { NotificationList } from './NotificationsList';

/** The notification list of the window: successes go by themselves, and Details opens the panel in the lower workbench. */
export function Notifications() {
  const items = useNotifications((state) => state.items);
  const dismiss = useNotifications((state) => state.dismiss);
  const expire = useNotifications((state) => state.expire);
  useEffect(() => {
    if (!items.some((entry) => entry.status === 'success')) return undefined;
    const timer = window.setInterval(expire, 1_000);
    return () => window.clearInterval(timer);
  }, [items, expire]);
  const openDetails = (tab: ConsoleTab) => {
    const workbench = useIDEStore.getState();
    if (workbench.isConsoleCollapsed) workbench.toggleConsole();
    workbench.setActiveConsoleTab(tab);
  };
  return <NotificationList items={items} onOpenDetails={openDetails} onDismiss={dismiss} />;
}
