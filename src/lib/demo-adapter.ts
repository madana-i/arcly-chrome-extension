import type { BookmarkCreate, BookmarkInput, BookmarkMove, BookmarkNode, BrowserAdapter, ChangeScope, Preferences, TabItem } from '../types';
import { assertOpenableUrl, findBookmark, sanitizePreferences } from './bookmarks';
import { findBookmarkTab } from './bookmark-tabs';
import { canSplitTabs, isSplitTab, tabMoveIndex } from './tab-drag';

// Preserve existing demo data across the arcly rename.
const STORAGE_KEY = 'arc-like-sidebar.demo.v1';

interface DemoState {
  bookmarks: BookmarkNode[];
  tabs: TabItem[];
  preferences: Preferences;
}

function seed(): DemoState {
  const urls = [
    ['GitHub', 'https://github.com/'],
    ['Notion', 'https://www.notion.so/'],
    ['Design systems — Figma', 'https://www.figma.com/'],
    ['React ドキュメント', 'https://react.dev/'],
    ['心地よいインターフェースの作り方', 'https://developer.chrome.com/'],
    ['今日のプレイリスト', 'https://music.youtube.com/'],
  ];
  return {
    bookmarks: [
      {
        id: '1', title: 'ブックマーク バー', parentId: '0', readOnly: true,
        children: [
          { id: '11', title: 'GitHub', url: urls[0][1], parentId: '1' },
          { id: '12', title: 'Notion', url: urls[1][1], parentId: '1' },
          { id: '13', title: 'Figma', url: urls[2][1], parentId: '1' },
          { id: '14', title: 'インスピレーション', parentId: '1', children: [
            { id: '141', title: 'Awwwards', url: 'https://www.awwwards.com/', parentId: '14' },
            { id: '142', title: 'Are.na', url: 'https://www.are.na/', parentId: '14' },
          ] },
        ],
      },
      { id: '2', title: 'その他のブックマーク', parentId: '0', readOnly: true, children: [] },
    ],
    tabs: urls.map(([title, url], index) => ({
      id: 100 + index, index, windowId: 1, title, url,
      active: index === 2, pinned: index < 2, audible: index === 5, muted: false,
    })),
    preferences: sanitizePreferences(undefined),
  };
}

export class DemoAdapter implements BrowserAdapter {
  readonly isDemo = true;
  readonly supportsSplitView = true;
  private state: DemoState;
  private listeners = new Set<(scope: ChangeScope) => void>();

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
    try {
      const raw = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null') as DemoState | null;
      this.state = raw && Array.isArray(raw.bookmarks) && Array.isArray(raw.tabs)
        ? { ...raw, preferences: sanitizePreferences(raw.preferences) }
        : seed();
    } catch {
      this.state = seed();
    }
  }

  private persist(scope?: ChangeScope) {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    if (scope) this.listeners.forEach((listener) => listener(scope));
  }

  async getBookmarks() { return structuredClone(this.state.bookmarks); }
  async getTabs() { return structuredClone(this.state.tabs); }
  async getPreferences() { return structuredClone(this.state.preferences); }

  async savePreferences(preferences: Preferences) {
    this.state.preferences = sanitizePreferences(preferences);
    this.persist();
  }

  subscribe(listener: (scope: ChangeScope) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private folder(id: string): BookmarkNode {
    const folder = findBookmark(this.state.bookmarks, id);
    if (!folder || folder.url || folder.managed) throw new Error('保存先フォルダが見つかりません。');
    folder.children ??= [];
    return folder;
  }

  async createBookmark(input: BookmarkCreate) {
    if (input.url) assertOpenableUrl(input.url);
    const children = this.folder(input.parentId).children!;
    const { index = children.length, ...details } = input;
    if (!Number.isInteger(index) || index < 0 || index > children.length) throw new Error('追加先の位置が無効です。');
    children.splice(index, 0, { ...details, id: crypto.randomUUID(), ...(!input.url ? { children: [] } : {}) });
    this.persist('bookmarks');
  }

  async updateBookmark(id: string, input: BookmarkInput) {
    if (input.url) assertOpenableUrl(input.url);
    const node = findBookmark(this.state.bookmarks, id);
    if (!node || node.readOnly) throw new Error('この項目は編集できません。');
    if (findBookmark([node], input.parentId)) throw new Error('フォルダを自身の中へ移動することはできません。');
    const destination = this.folder(input.parentId);
    if (node.parentId !== input.parentId) {
      const previous = this.folder(node.parentId!);
      previous.children = previous.children!.filter((child) => child.id !== id);
      destination.children!.push(node);
    }
    Object.assign(node, input);
    this.persist('bookmarks');
  }

  async renameBookmark(id: string, title: string) {
    const node = findBookmark(this.state.bookmarks, id);
    if (!node || node.readOnly) throw new Error('この項目は編集できません。');
    node.title = title;
    this.persist('bookmarks');
  }

  async moveBookmark(id: string, destination: BookmarkMove) {
    const node = findBookmark(this.state.bookmarks, id);
    if (!node || node.readOnly || node.managed) throw new Error('この項目は移動できません。');
    if (findBookmark([node], destination.parentId)) throw new Error('フォルダを自身や子フォルダの中へ移動することはできません。');
    const parent = this.folder(destination.parentId);
    const previous = this.folder(node.parentId!);
    let index = destination.index;
    if (!Number.isInteger(index) || index < 0 || index > parent.children!.length) throw new Error('移動先の位置が無効です。');
    const oldIndex = previous.children!.findIndex((child) => child.id === id);
    if (previous === parent && index > oldIndex) index--;
    if (previous === parent && index === oldIndex) return;
    previous.children!.splice(oldIndex, 1);
    parent.children!.splice(index, 0, node);
    node.parentId = parent.id;
    this.persist('bookmarks');
  }

  async deleteBookmark(id: string) {
    const node = findBookmark(this.state.bookmarks, id);
    if (!node || node.readOnly) throw new Error('この項目は削除できません。');
    const parent = this.folder(node.parentId!);
    parent.children = parent.children!.filter((child) => child.id !== id);
    this.persist('bookmarks');
  }

  private reindexTabs() {
    this.state.tabs.forEach((tab, index) => { tab.index = index; });
  }

  async openUrl(url: string, active = true) {
    assertOpenableUrl(url);
    if (active) this.state.tabs.forEach((tab) => { tab.active = false; });
    this.state.tabs.push({
      id: Math.max(100, ...this.state.tabs.map((tab) => tab.id)) + 1,
      index: this.state.tabs.length, windowId: 1, url,
      title: url === 'chrome://newtab/' ? '新しいタブ' : new URL(url).hostname,
      active, pinned: false, audible: false, muted: false,
    });
    this.persist('tabs');
  }

  async activateTab(id: number) {
    this.state.tabs.forEach((tab) => { tab.active = tab.id === id; });
    this.persist('tabs');
  }

  async openBookmark(url: string, active = true) {
    assertOpenableUrl(url);
    const existing = findBookmarkTab(this.state.tabs, url);
    if (existing) {
      if (active && !existing.active) await this.activateTab(existing.id);
      return;
    }
    await this.openUrl(url, active);
  }

  async openBookmarkInSplit(url: string, targetId: number) {
    assertOpenableUrl(url);
    const target = this.state.tabs.find((tab) => tab.id === targetId);
    if (!target || isSplitTab(target)) throw new Error('このタブには分割して開けません。未分割のタブにドロップしてください。');
    const existing = findBookmarkTab(this.state.tabs.filter((tab) => canSplitTabs(tab, target)), url);
    if (existing) {
      await this.splitTabs(existing.id, targetId);
      await this.activateTab(existing.id);
      return;
    }
    const source: TabItem = {
      id: Math.max(100, ...this.state.tabs.map((tab) => tab.id)) + 1,
      index: target.index + 1, windowId: target.windowId, url,
      title: new URL(url).hostname || '新しいタブ',
      active: true, pinned: target.pinned, groupId: target.groupId, audible: false, muted: false,
    };
    this.state.tabs.splice(target.index + 1, 0, source);
    const splitViewId = Math.max(0, ...this.state.tabs.map((tab) => tab.splitViewId ?? -1)) + 1;
    source.splitViewId = target.splitViewId = splitViewId;
    this.state.tabs.forEach((tab) => { tab.active = tab === source; });
    this.reindexTabs();
    this.persist('tabs');
  }

  async closeTab(id: number) {
    this.clearSplit(id);
    const index = this.state.tabs.findIndex((tab) => tab.id === id);
    const wasActive = this.state.tabs[index]?.active;
    this.state.tabs = this.state.tabs.filter((tab) => tab.id !== id);
    if (wasActive && this.state.tabs.length) {
      this.state.tabs[Math.min(index, this.state.tabs.length - 1)].active = true;
    }
    this.reindexTabs();
    this.persist('tabs');
  }

  async closeOtherTabs() {
    const remaining = this.state.tabs.filter((tab) => tab.active);
    if (remaining.length !== 1) throw new Error('現在のアクティブなタブを確認できませんでした。もう一度お試しください。');
    if (this.state.tabs.length === 1) return;
    remaining.forEach((tab) => { delete tab.splitViewId; });
    this.state.tabs = remaining;
    this.reindexTabs();
    this.persist('tabs');
  }

  async pinTab(id: number, pinned: boolean) {
    const tab = this.state.tabs.find((item) => item.id === id);
    if (!tab) return;
    this.clearSplit(id);
    tab.pinned = pinned;
    this.state.tabs = this.state.tabs.filter((item) => item.id !== id);
    const boundary = this.state.tabs.filter((item) => item.pinned).length;
    this.state.tabs.splice(boundary, 0, tab);
    this.reindexTabs();
    this.persist('tabs');
  }

  async muteTab(id: number, muted: boolean) {
    const tab = this.state.tabs.find((item) => item.id === id);
    if (tab) tab.muted = muted;
    this.persist('tabs');
  }

  async moveTab(id: number, index: number) {
    const tab = this.state.tabs.find((item) => item.id === id);
    if (!tab) return;
    this.state.tabs = this.state.tabs.filter((item) => item.id !== id);
    this.state.tabs.splice(index, 0, tab);
    this.reindexTabs();
    this.persist('tabs');
  }

  private clearSplit(id: number) {
    const tab = this.state.tabs.find((item) => item.id === id);
    if (!tab || !isSplitTab(tab)) return;
    const splitViewId = tab.splitViewId;
    this.state.tabs.forEach((item) => { if (item.splitViewId === splitViewId) delete item.splitViewId; });
  }

  async splitTabs(sourceId: number, targetId: number) {
    const source = this.state.tabs.find((tab) => tab.id === sourceId);
    const target = this.state.tabs.find((tab) => tab.id === targetId);
    if (!source || !target || !canSplitTabs(source, target)) throw new Error('この2つのタブは分割できません。');
    const index = tabMoveIndex(source, target, 'after');
    this.state.tabs.splice(this.state.tabs.indexOf(source), 1);
    this.state.tabs.splice(index, 0, source);
    const splitViewId = Math.max(0, ...this.state.tabs.map((tab) => tab.splitViewId ?? -1)) + 1;
    source.splitViewId = target.splitViewId = splitViewId;
    this.state.tabs.forEach((tab) => { tab.active = tab.id === targetId; });
    this.reindexTabs();
    this.persist('tabs');
  }

  async unsplitTab(id: number) {
    this.clearSplit(id);
    this.persist('tabs');
  }
}
