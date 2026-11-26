export interface BookmarkNode {
  id: string;
  title: string;
  parentId?: string;
  url?: string;
  children?: BookmarkNode[];
  folderType?: 'bookmarks-bar' | 'other' | 'mobile' | 'managed';
  readOnly?: boolean;
  managed?: boolean;
}

export interface TabItem {
  id: number;
  windowId: number;
  index: number;
  title: string;
  url: string;
  active: boolean;
  pinned: boolean;
  audible: boolean;
  muted: boolean;
  groupId?: number;
  splitViewId?: number;
}

export interface Preferences {
  expandedFolders: string[];
  bookmarksCollapsed: boolean;
  tabsCollapsed: boolean;
}

export type ChangeScope = 'bookmarks' | 'tabs' | 'favicons';

export interface BookmarkInput {
  title: string;
  url?: string;
  parentId: string;
}

export interface BookmarkCreate extends BookmarkInput {
  index?: number;
}

export interface BookmarkMove {
  parentId: string;
  /** Insertion boundary in the destination's children before removing the source. */
  index: number;
}

export interface BrowserAdapter {
  readonly isDemo: boolean;
  readonly supportsSplitView: boolean;
  getBookmarks(): Promise<BookmarkNode[]>;
  getTabs(): Promise<TabItem[]>;
  getPreferences(): Promise<Preferences>;
  savePreferences(preferences: Preferences): Promise<void>;
  subscribe(listener: (scope: ChangeScope) => void): () => void;
  createBookmark(input: BookmarkCreate): Promise<void>;
  updateBookmark(id: string, input: BookmarkInput): Promise<void>;
  renameBookmark(id: string, title: string): Promise<void>;
  moveBookmark(id: string, destination: BookmarkMove): Promise<void>;
  deleteBookmark(id: string): Promise<void>;
  openUrl(url: string, active?: boolean): Promise<void>;
  openBookmark(url: string, active?: boolean): Promise<void>;
  openBookmarkInSplit(url: string, targetId: number): Promise<void>;
  activateTab(id: number): Promise<void>;
  closeTab(id: number): Promise<void>;
  closeOtherTabs(): Promise<void>;
  pinTab(id: number, pinned: boolean): Promise<void>;
  muteTab(id: number, muted: boolean): Promise<void>;
  moveTab(id: number, index: number): Promise<void>;
  splitTabs(sourceId: number, targetId: number): Promise<void>;
  unsplitTab(id: number): Promise<void>;
}
