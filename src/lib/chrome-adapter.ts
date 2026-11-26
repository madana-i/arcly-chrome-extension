import type { BookmarkCreate, BookmarkInput, BookmarkMove, BookmarkNode, BrowserAdapter, ChangeScope, Preferences, TabItem } from '../types';
import { assertOpenableUrl, sanitizePreferences } from './bookmarks';
import { findBookmarkTab } from './bookmark-tabs';
import { canSplitTabs, isSplitTab, tabMoveIndex } from './tab-drag';

function mapBookmark(node: chrome.bookmarks.BookmarkTreeNode, inheritedManaged = false): BookmarkNode {
  const managed = inheritedManaged || node.unmodifiable === 'managed';
  return {
    id: node.id,
    title: node.title,
    parentId: node.parentId,
    url: node.url,
    folderType: node.folderType,
    readOnly: managed || node.parentId === '0' || node.id === '0',
    managed,
    children: node.children?.map((child) => mapBookmark(child, managed)),
  };
}

export class ChromeAdapter implements BrowserAdapter {
  readonly isDemo = false;
  private windowId?: number;

  constructor(private readonly api: typeof chrome = chrome) {}

  get supportsSplitView(): boolean {
    return typeof this.api.tabs.createSplit === 'function' && typeof this.api.tabs.unsplit === 'function';
  }

  private async getWindowId(): Promise<number> {
    if (this.windowId === undefined) {
      const window = await this.api.windows.getCurrent();
      if (window.id === undefined) throw new Error('現在のウィンドウを取得できませんでした。');
      this.windowId = window.id;
    }
    return this.windowId;
  }

  async getBookmarks(): Promise<BookmarkNode[]> {
    const roots = await this.api.bookmarks.getTree();
    return (roots[0]?.children ?? []).map((node) => mapBookmark(node));
  }

  async getTabs(): Promise<TabItem[]> {
    const tabs = await this.api.tabs.query({ windowId: await this.getWindowId() });
    return tabs.filter((tab) => tab.id !== undefined).map((tab) => ({
      id: tab.id!,
      windowId: tab.windowId,
      index: tab.index,
      title: tab.title || '新しいタブ',
      url: tab.url || tab.pendingUrl || '',
      active: tab.active,
      pinned: tab.pinned,
      audible: tab.audible ?? false,
      muted: tab.mutedInfo?.muted ?? false,
      groupId: tab.groupId,
      splitViewId: tab.splitViewId,
    })).sort((a, b) => a.index - b.index);
  }

  async getPreferences(): Promise<Preferences> {
    const data = await this.api.storage.local.get('preferences');
    return sanitizePreferences(data.preferences);
  }

  async savePreferences(preferences: Preferences): Promise<void> {
    await this.api.storage.local.set({ preferences: sanitizePreferences(preferences) });
  }

  subscribe(listener: (scope: ChangeScope) => void): () => void {
    const bookmarks = () => listener('bookmarks');
    const tabs = () => listener('tabs');
    const tabUpdated = (_id: number, change: chrome.tabs.OnUpdatedInfo) => {
      tabs();
      // A default favicon is a successful image response, so img.onError
      // cannot tell us when Chrome later has the real icon available.
      if (change.favIconUrl || change.status === 'complete') listener('favicons');
    };
    const bookmarkEvents = [
      this.api.bookmarks.onCreated, this.api.bookmarks.onRemoved,
      this.api.bookmarks.onChanged, this.api.bookmarks.onMoved,
      this.api.bookmarks.onChildrenReordered, this.api.bookmarks.onImportEnded,
    ];
    const tabEvents = [
      this.api.tabs.onCreated, this.api.tabs.onRemoved,
      this.api.tabs.onMoved, this.api.tabs.onActivated, this.api.tabs.onAttached,
      this.api.tabs.onDetached, this.api.tabs.onReplaced,
    ];
    bookmarkEvents.forEach((event) => event.addListener(bookmarks));
    tabEvents.forEach((event) => event.addListener(tabs));
    this.api.tabs.onUpdated.addListener(tabUpdated);
    return () => {
      bookmarkEvents.forEach((event) => event.removeListener(bookmarks));
      tabEvents.forEach((event) => event.removeListener(tabs));
      this.api.tabs.onUpdated.removeListener(tabUpdated);
    };
  }

  async createBookmark(input: BookmarkCreate): Promise<void> {
    if (input.url) assertOpenableUrl(input.url);
    await this.api.bookmarks.create(input);
  }

  async updateBookmark(id: string, input: BookmarkInput): Promise<void> {
    if (input.url) assertOpenableUrl(input.url);
    const [existing] = await this.api.bookmarks.get(id);
    await this.api.bookmarks.update(id, { title: input.title, ...(input.url ? { url: input.url } : {}) });
    if (existing.parentId !== input.parentId) {
      await this.api.bookmarks.move(id, { parentId: input.parentId });
    }
  }

  async renameBookmark(id: string, title: string): Promise<void> {
    await this.api.bookmarks.update(id, { title });
  }

  async moveBookmark(id: string, destination: BookmarkMove): Promise<void> {
    await this.api.bookmarks.move(id, destination);
  }

  async deleteBookmark(id: string): Promise<void> {
    const [node] = await this.api.bookmarks.get(id);
    if (node.url) await this.api.bookmarks.remove(id);
    else await this.api.bookmarks.removeTree(id);
  }

  async openUrl(url: string, active = true): Promise<void> {
    assertOpenableUrl(url);
    await this.api.tabs.create({ url, active, windowId: await this.getWindowId() });
  }

  async openBookmark(url: string, active = true): Promise<void> {
    assertOpenableUrl(url);
    const windowId = await this.getWindowId();
    const tabs = await this.api.tabs.query({ windowId });
    const existing = findBookmarkTab(tabs, url);
    if (existing?.id !== undefined) {
      if (active && !existing.active) await this.api.tabs.update(existing.id, { active: true });
      return;
    }
    await this.api.tabs.create({ url, active, windowId });
  }

  async activateTab(id: number): Promise<void> {
    await this.api.tabs.update(id, { active: true });
  }

  async openBookmarkInSplit(url: string, targetId: number): Promise<void> {
    assertOpenableUrl(url);
    if (!this.supportsSplitView) throw new Error('Split Viewの操作にはChrome 155以降が必要です。');
    const windowId = await this.getWindowId();
    const tabs = await this.api.tabs.query({ windowId });
    const target = tabs.find((tab) => tab.id === targetId);
    if (!target || isSplitTab(target)) throw new Error('このタブには分割して開けません。未分割のタブにドロップしてください。');
    const existing = findBookmarkTab(tabs.filter((tab) => tab.id !== targetId && tab.windowId === target.windowId
      && tab.pinned === target.pinned && tab.groupId === target.groupId && !isSplitTab(tab)), url);
    if (existing?.id !== undefined) {
      await this.splitTabs(existing.id, targetId);
      await this.activateTab(existing.id);
      return;
    }
    // Open directly in a Split View; Chrome inherits the target's group.
    await this.api.tabs.create({ url, windowId, index: target.index + 1, pinned: target.pinned, active: true, splitWithTabId: targetId });
  }

  async closeTab(id: number): Promise<void> {
    await this.api.tabs.remove(id);
  }

  async closeOtherTabs(): Promise<void> {
    // Read again at confirmation time instead of using the sidebar's snapshot.
    const tabs = await this.getTabs();
    if (tabs.filter((tab) => tab.active).length !== 1) {
      throw new Error('現在のアクティブなタブを確認できませんでした。もう一度お試しください。');
    }
    const ids = tabs.filter((tab) => !tab.active).map((tab) => tab.id);
    if (ids.length) await this.api.tabs.remove(ids);
  }

  async pinTab(id: number, pinned: boolean): Promise<void> {
    await this.api.tabs.update(id, { pinned });
  }

  async muteTab(id: number, muted: boolean): Promise<void> {
    await this.api.tabs.update(id, { muted });
  }

  async moveTab(id: number, index: number): Promise<void> {
    await this.api.tabs.move(id, { index, windowId: await this.getWindowId() });
  }

  async splitTabs(sourceId: number, targetId: number): Promise<void> {
    if (!this.supportsSplitView) throw new Error('Split Viewの操作にはChrome 155以降が必要です。');
    const validate = (tabs: TabItem[]) => {
      const source = tabs.find((tab) => tab.id === sourceId);
      const target = tabs.find((tab) => tab.id === targetId);
      if (!source || !target || !canSplitTabs(source, target)) {
        throw new Error('この2つのタブは分割できません。分割状態・固定状態・タブグループを確認してください。');
      }
      return { source, target };
    };
    let pair = validate(await this.getTabs());
    // Keep the destination on the left and put the dragged tab on its right.
    // Never change pinning or group membership just to make a split possible.
    if (pair.source.index !== pair.target.index + 1) {
      await this.moveTab(sourceId, tabMoveIndex(pair.source, pair.target, 'after'));
      pair = validate(await this.getTabs());
    }
    if (pair.source.index !== pair.target.index + 1) {
      throw new Error('タブの位置が変わりました。もう一度ドラッグしてください。');
    }
    await this.api.tabs.createSplit([targetId, sourceId]);
    await this.api.tabs.update(targetId, { active: true });
  }

  async unsplitTab(id: number): Promise<void> {
    if (!this.supportsSplitView) throw new Error('Split Viewの操作にはChrome 155以降が必要です。');
    const tab = (await this.getTabs()).find((item) => item.id === id);
    if (tab && isSplitTab(tab)) await this.api.tabs.unsplit(tab.splitViewId!);
  }
}
