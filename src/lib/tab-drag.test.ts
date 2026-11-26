import { describe, expect, it } from 'vitest';
import { canSplitTabs, getTabDropPosition, isSplitTab, tabMoveIndex } from './tab-drag';
import type { TabItem } from '@/types';

const tab: TabItem = { id: 1, windowId: 42, index: 0, title: 'Tab', url: 'https://example.com/', active: false, pinned: false, audible: false, muted: false };

describe('タブのドロップ位置', () => {
  it('上下の端は挿入、中央は分割に使い、未対応のChromeでは中央でも並び替える', () => {
    expect(getTabDropPosition(4, 48, true)).toBe('before');
    expect(getTabDropPosition(24, 48, true)).toBe('split');
    expect(getTabDropPosition(44, 48, true)).toBe('after');
    expect(getTabDropPosition(16, 48, false)).toBe('before');
    expect(getTabDropPosition(32, 48, false)).toBe('after');
  });
  it.each([
    [0, 3, 'before', 2], [0, 3, 'after', 3],
    [3, 0, 'before', 0], [3, 0, 'after', 1],
    [0, 1, 'before', 0], [1, 0, 'after', 1],
  ] as const)('移動元%d、移動先%dの%sの位置を正しく計算する', (source, target, position, expected) => {
    expect(tabMoveIndex({ ...tab, index: source }, { ...tab, id: 2, index: target }, position)).toBe(expected);
  });
  it('分割IDが0の場合も分割済みとして扱い、-1と未設定は未分割にする', () => {
    expect(isSplitTab({ splitViewId: 0 })).toBe(true);
    expect(isSplitTab({ splitViewId: -1 })).toBe(false);
    expect(isSplitTab({})).toBe(false);
  });
  it.each([
    { id: 1 }, { windowId: 43 }, { pinned: true }, { groupId: 3 }, { splitViewId: 0 },
  ])('分割の条件を満たさないタブを拒否する: %j', (overrides) => {
    expect(canSplitTabs(tab, { ...tab, id: 2, ...overrides })).toBe(false);
  });
  it('同じグループと固定状態なら分割でき、未所属のグループIDは-1と未設定を同じに扱う', () => {
    expect(canSplitTabs(tab, { ...tab, id: 2, groupId: -1, splitViewId: -1 })).toBe(true);
    expect(canSplitTabs({ ...tab, groupId: 5, pinned: true }, { ...tab, id: 2, groupId: 5, pinned: true })).toBe(true);
    expect(canSplitTabs({ ...tab, splitViewId: 9 }, { ...tab, id: 2 })).toBe(false);
  });
});
