import { useCallback, useEffect, useRef, useState } from 'react';
import type { BookmarkNode, ChangeScope, Preferences, TabItem } from '../types';
import { browser } from '../lib/browser';
import { DEFAULT_PREFERENCES } from '../lib/bookmarks';

export function useBrowser() {
  const [bookmarks, setBookmarks] = useState<BookmarkNode[]>([]);
  const [tabs, setTabs] = useState<TabItem[]>([]);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [faviconRevision, setFaviconRevision] = useState(0);
  const ready = useRef(false);

  useEffect(() => {
    let alive = true;
    let bookmarkRevision = 0;
    let tabRevision = 0;
    const timers: Partial<Record<ChangeScope, ReturnType<typeof setTimeout>>> = {};
    const refreshFavicons = (delay: number) => {
      clearTimeout(timers.favicons);
      timers.favicons = setTimeout(() => { if (alive) setFaviconRevision((value) => value + 1); }, delay);
    };
    const report = (reason: unknown) => {
      if (alive) setError(reason instanceof Error ? reason.message : 'Chromeのデータを読み込めませんでした。');
    };
    const refresh = async (scope: Exclude<ChangeScope, 'favicons'>) => {
      try {
        if (scope === 'bookmarks') {
          const current = ++bookmarkRevision;
          const data = await browser.getBookmarks();
          if (alive && current === bookmarkRevision) setBookmarks(data);
        } else {
          const current = ++tabRevision;
          const data = await browser.getTabs();
          if (alive && current === tabRevision) setTabs(data);
        }
      } catch (reason) { report(reason); }
    };
    const unsubscribe = browser.subscribe((scope) => {
      clearTimeout(timers[scope]);
      if (scope === 'favicons') {
        // Coalesce icon/load events and let Chrome finish updating its cache.
        // Refresh bookmarks too: redirects can associate an icon with a URL
        // other than the final tab URL.
        refreshFavicons(250);
        return;
      }
      timers[scope] = setTimeout(() => { void refresh(scope); }, 40);
    });

    void Promise.all([
      refresh('bookmarks'), refresh('tabs'),
      browser.getPreferences().then((data) => {
        if (alive) {
          setPreferences(data);
          ready.current = true;
        }
      }).catch(report),
    ]).finally(() => {
      if (alive) {
        setLoading(false);
        // The panel can open after the tab's update event. Retry once after
        // the initial render so a transient default image does not stay stuck.
        refreshFavicons(1000);
      }
    });

    return () => {
      alive = false;
      unsubscribe();
      Object.values(timers).forEach(clearTimeout);
    };
  }, [revision]);

  useEffect(() => {
    if (!ready.current) return;
    const timer = setTimeout(() => {
      void browser.savePreferences(preferences).catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : '設定を保存できませんでした。');
      });
    }, 220);
    return () => { clearTimeout(timer); };
  }, [preferences]);

  const updatePreferences = useCallback((update: Partial<Preferences>) => {
    setPreferences((current) => ({ ...current, ...update }));
  }, []);

  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    setRevision((value) => value + 1);
  }, []);

  return { bookmarks, tabs, preferences, updatePreferences, loading, error, retry, faviconRevision };
}
