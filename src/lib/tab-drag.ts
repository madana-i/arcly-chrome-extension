import type { TabItem } from '@/types';

export type TabDropPosition = 'before' | 'split' | 'after';
export interface TabDropTarget { id: number; position: TabDropPosition }

export function isSplitTab(tab: Pick<TabItem, 'splitViewId'>): boolean {
  return tab.splitViewId !== undefined && tab.splitViewId >= 0;
}

export function canSplitTabs(source: TabItem, target: TabItem): boolean {
  return source.id !== target.id && source.windowId === target.windowId
    && source.pinned === target.pinned && (source.groupId ?? -1) === (target.groupId ?? -1)
    && !isSplitTab(source) && !isSplitTab(target);
}

export function getTabDropPosition(offset: number, height: number, supportsSplitView: boolean): TabDropPosition {
  if (supportsSplitView && height > 0 && offset >= height * 0.25 && offset <= height * 0.75) return 'split';
  return offset < height / 2 ? 'before' : 'after';
}

export function tabMoveIndex(source: TabItem, target: TabItem, position: 'before' | 'after'): number {
  return target.index + (position === 'after' ? 1 : 0) - (source.index < target.index ? 1 : 0);
}
