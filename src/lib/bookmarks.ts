import type { BookmarkNode, Preferences } from '../types';

export const DEFAULT_PREFERENCES: Preferences = {
  expandedFolders: ['1'],
  bookmarksCollapsed: false,
  tabsCollapsed: false,
};

export function sanitizePreferences(value: unknown): Preferences {
  const input = value && typeof value === 'object' ? (value as Partial<Preferences>) : {};
  return {
    expandedFolders: Array.isArray(input.expandedFolders)
      ? input.expandedFolders.filter((id): id is string => typeof id === 'string')
      : DEFAULT_PREFERENCES.expandedFolders,
    bookmarksCollapsed: input.bookmarksCollapsed === true,
    tabsCollapsed: input.tabsCollapsed === true,
  };
}

export function findBookmark(nodes: BookmarkNode[], id: string): BookmarkNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = node.children && findBookmark(node.children, id);
    if (found) return found;
  }
}

export function getBookmarkBarRoots(nodes: BookmarkNode[]): BookmarkNode[] {
  // folderType supports account/local bars and localized folder names.
  // Chrome 116–133 does not expose it; its bookmark bar has the fixed ID 1.
  return nodes.filter((node) => !node.url && (node.folderType ? node.folderType === 'bookmarks-bar' : node.id === '1'));
}

export function countBookmarks(nodes: BookmarkNode[]): number {
  return nodes.reduce((count, node) => count + (node.url ? 1 : countBookmarks(node.children ?? [])), 0);
}

export function filterBookmarks(nodes: BookmarkNode[], query: string): BookmarkNode[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return nodes;
  return nodes.flatMap((node) => {
    if (`${node.title} ${node.url ?? ''}`.toLocaleLowerCase().includes(term)) return [node];
    const children = filterBookmarks(node.children ?? [], term);
    return children.length ? [{ ...node, children }] : [];
  });
}

export interface FolderOption {
  id: string;
  label: string;
}

// Excluding an edited folder's whole subtree prevents moving it into itself.
export function getFolderOptions(nodes: BookmarkNode[], excludeId?: string, prefix = ''): FolderOption[] {
  return nodes.flatMap((node) => {
    if (node.url || node.managed || node.id === excludeId) return [];
    const label = prefix ? `${prefix} / ${node.title}` : node.title;
    return [
      { id: node.id, label },
      ...getFolderOptions(node.children ?? [], excludeId, label),
    ];
  });
}

export function normalizeWebUrl(input: string): string {
  const value = input.trim();
  if (!value) throw new Error('URLを入力してください。');
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('有効なURLを入力してください。');
  }
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error('http:// または https:// のURLを入力してください。');
  }
  return url.href;
}

export function assertOpenableUrl(input: string): void {
  let protocol: string;
  try {
    protocol = new URL(input).protocol;
  } catch {
    throw new Error('このブックマークのURLを開けません。');
  }
  if (!['http:', 'https:', 'chrome:', 'chrome-extension:', 'file:', 'about:'].includes(protocol)) {
    throw new Error('この種類のURLはサイドバーから開けません。');
  }
}

export function displayDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '') || parsed.protocol.replace(':', '');
  } catch {
    return '';
  }
}
