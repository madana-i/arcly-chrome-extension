interface BookmarkTab {
  id?: number;
  url?: string;
  pendingUrl?: string;
  active?: boolean;
}

export function findBookmarkTab<T extends BookmarkTab>(tabs: T[], url: string): T | undefined {
  const target = new URL(url).href;
  const matches = (tab: T) => {
    if (tab.id === undefined) return false;
    try {
      // Prefer the navigation in progress over the previously committed page.
      return new URL(tab.pendingUrl || tab.url || '').href === target;
    } catch { return false; }
  };
  return tabs.find((tab) => tab.active && matches(tab)) ?? tabs.find(matches);
}
