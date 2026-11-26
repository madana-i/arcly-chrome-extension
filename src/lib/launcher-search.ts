import type { BookmarkNode, ChangeScope } from '@/types';
import { assertOpenableUrl } from './bookmarks';
import { findBookmarkTab } from './bookmark-tabs';
import { ChromeAdapter } from './chrome-adapter';
import { browser } from './browser';

export interface LauncherTab {
  id: number;
  windowId: number;
  title: string;
  url: string;
  active: boolean;
}

export interface LauncherData {
  bookmarks: BookmarkNode[];
  tabs: LauncherTab[];
  sourceWindowId?: number;
}

export type LauncherResult = {
  key: string;
  title: string;
  url: string;
  detail: string;
} & ({ kind: 'tab'; tabId: number; windowId: number } | { kind: 'bookmark' });

export interface LauncherAdapter {
  load(): Promise<LauncherData>;
  open(result: LauncherResult): Promise<void>;
  subscribe(listener: (scope: ChangeScope) => void): () => void;
}

const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase();

export function searchLauncher(data: LauncherData, query: string): LauncherResult[] {
  const results: LauncherResult[] = [...data.tabs].sort((a, b) =>
    Number(b.windowId === data.sourceWindowId) - Number(a.windowId === data.sourceWindowId) || Number(b.active) - Number(a.active),
  ).map((tab) => ({
    kind: 'tab', key: `tab:${tab.id}`, tabId: tab.id, windowId: tab.windowId,
    title: tab.title || tab.url || '新しいタブ', url: tab.url,
    detail: tab.windowId === data.sourceWindowId ? tab.url : `別のウィンドウ · ${tab.url}`,
  }));
  const visit = (nodes: BookmarkNode[], path: string[]) => {
    for (const node of nodes) {
      if (node.url) {
        try { assertOpenableUrl(node.url); } catch { continue; }
        results.push({ kind: 'bookmark', key: `bookmark:${node.id}`, title: node.title || node.url, url: node.url, detail: [...path, node.url].join(' / ') });
      } else visit(node.children ?? [], [...path, node.title || '無題のフォルダ']);
    }
  };
  visit(data.bookmarks, []);
  const term = normalize(query.trim());
  const tokens = term.split(/\s+/).filter(Boolean);
  return results.flatMap((result) => {
    const title = normalize(result.title);
    const url = normalize(result.url);
    const text = `${title} ${url} ${normalize(result.detail)}`;
    if (!tokens.every((token) => text.includes(token))) return [];
    const rank = !term || title === term ? 0 : title.startsWith(term) ? 1 : title.includes(term) ? 2 : url.includes(term) ? 3 : 4;
    return [{ result, rank }];
  }).sort((a, b) => a.rank - b.rank).map(({ result }) => result);
}

export class ChromeLauncherAdapter implements LauncherAdapter {
  private readonly bookmarks: ChromeAdapter;

  constructor(private readonly sourceWindowId?: number, private readonly api: typeof chrome = chrome) {
    this.bookmarks = new ChromeAdapter(api);
  }

  async load(): Promise<LauncherData> {
    const [bookmarks, tabs] = await Promise.all([
      this.bookmarks.getBookmarks(), this.api.tabs.query({}),
    ]);
    return {
      bookmarks, sourceWindowId: this.sourceWindowId,
      tabs: tabs.filter((tab) => tab.id !== undefined && !tab.incognito && tab.url?.split('?')[0] !== this.api.runtime.getURL('launcher.html')).map((tab) => ({
        id: tab.id!, windowId: tab.windowId, title: tab.title || '新しいタブ',
        url: tab.pendingUrl || tab.url || '', active: tab.active,
      })),
    };
  }

  subscribe(listener: (scope: ChangeScope) => void) { return this.bookmarks.subscribe(listener); }

  private async focusTab(tab: chrome.tabs.Tab): Promise<void> {
    if (tab.id === undefined) throw new Error('タブが見つかりませんでした。検索し直してください。');
    if (!tab.active) await this.api.tabs.update(tab.id, { active: true });
    await this.api.windows.update(tab.windowId, { focused: true });
  }

  async open(result: LauncherResult): Promise<void> {
    if (result.kind === 'tab') {
      // Resolve again: the tab may have moved to another window since search.
      await this.focusTab(await this.api.tabs.get(result.tabId));
      return;
    }
    assertOpenableUrl(result.url);
    const tabs = (await this.api.tabs.query({})).filter((tab) => !tab.incognito && tab.url?.split('?')[0] !== this.api.runtime.getURL('launcher.html'));
    const existing = findBookmarkTab(tabs.filter((tab) => tab.windowId === this.sourceWindowId), result.url)
      ?? findBookmarkTab(tabs, result.url);
    if (existing) { await this.focusTab(existing); return; }
    const windows = (await this.api.windows.getAll({ windowTypes: ['normal'] })).filter((window) => !window.incognito);
    const source = windows.find((window) => window.id === this.sourceWindowId) ?? windows.find((window) => window.focused) ?? windows[0];
    if (source?.id === undefined) {
      await this.api.windows.create({ url: result.url, type: 'normal', focused: true });
    } else {
      await this.api.tabs.create({ url: result.url, windowId: source.id, active: true });
      await this.api.windows.update(source.id, { focused: true });
    }
  }
}

export function createLauncherAdapter(): LauncherAdapter {
  const value = new URLSearchParams(location.search).get('windowId');
  const sourceWindowId = value !== null && /^\d+$/.test(value) ? Number(value) : undefined;
  if (globalThis.chrome?.runtime?.id) return new ChromeLauncherAdapter(sourceWindowId);
  return {
    async load() {
      const [bookmarks, tabs] = await Promise.all([browser.getBookmarks(), browser.getTabs()]);
      return { bookmarks, tabs, sourceWindowId: tabs[0]?.windowId };
    },
    open: (result) => result.kind === 'tab' ? browser.activateTab(result.tabId) : browser.openBookmark(result.url),
    subscribe: (listener) => browser.subscribe(listener),
  };
}
