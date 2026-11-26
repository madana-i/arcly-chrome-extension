import type { TabItem } from '@/types';
import { isSplitTab } from './tab-drag';

export interface TabDisplayGroup {
  key: string;
  tabs: TabItem[];
}

export function groupTabsForDisplay(tabs: TabItem[]): TabDisplayGroup[] {
  const groups = new Map<string, TabDisplayGroup>();
  for (const tab of tabs) {
    const key = isSplitTab(tab) ? `split:${tab.windowId}:${tab.splitViewId}:${tab.pinned}` : `tab:${tab.id}`;
    const group = groups.get(key);
    if (group) group.tabs.push(tab);
    else groups.set(key, { key, tabs: [tab] });
  }
  return Array.from(groups.values(), (group) => ({ ...group, tabs: group.tabs.sort((a, b) => a.index - b.index) }));
}
