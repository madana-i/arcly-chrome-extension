import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Bookmark, BrushCleaning, ChevronDown, CircleAlert, FolderPlus, Layers2, Pin, Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import type { BookmarkInput, BookmarkNode, TabItem } from '@/types';
import { browser } from '@/lib/browser';
import { requestLauncher } from '@/lib/launcher-window';
import { canSplitTabs, isSplitTab, tabMoveIndex, type TabDropPosition, type TabDropTarget } from '@/lib/tab-drag';
import { groupTabsForDisplay, type TabDisplayGroup } from '@/lib/tab-groups';
import { assertOpenableUrl, filterBookmarks, findBookmark, getBookmarkBarRoots } from '@/lib/bookmarks';
import { cn } from '@/lib/utils';
import { useBrowser } from '@/hooks/use-browser';
import { useBookmarkDrag } from '@/hooks/use-bookmark-drag';
import { BookmarkEditor, type BookmarkEditorState } from '@/components/bookmark-editor';
import { BookmarkTree } from '@/components/bookmark-tree';
import { IconButton } from '@/components/icon-button';
import { TabRow } from '@/components/tab-row';
import { TabCleanupConfirmation } from '@/components/tab-cleanup-confirmation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

function LoadingList() {
  return <div className="space-y-3 px-2 py-3" role="status" aria-label="読み込み中">{[1, 2, 3].map((key) => <div key={key} className="flex items-center gap-2"><Skeleton className="size-6 rounded-md" /><Skeleton className="h-3 flex-1" /></div>)}</div>;
}

export default function App() {
  const { bookmarks, tabs, preferences, updatePreferences, loading, error, retry, faviconRevision } = useBrowser();
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<BookmarkEditorState | null>(null);
  const [deleting, setDeleting] = useState<BookmarkNode | null>(null);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [tabDropTarget, setTabDropTarget] = useState<TabDropTarget | null>(null);
  const [pendingTabIds, setPendingTabIds] = useState<number[]>([]);
  const tabOperationPending = useRef(false);
  const search = useRef<HTMLInputElement>(null);
  const editorReturnFocus = useRef<HTMLElement | null>(null);
  const cleanupTrigger = useRef<HTMLButtonElement | null>(null);
  const cleanupReturnFocus = useRef<'trigger' | 'heading' | null>(null);
  const isMac = navigator.userAgent.includes('Mac');
  const activeTab = tabs.find((tab) => tab.active);
  const bookmarkBarRoots = useMemo(() => getBookmarkBarRoots(bookmarks), [bookmarks]);
  const bookmarkBar = bookmarkBarRoots.find((node) => !node.managed);
  const filteredBookmarks = useMemo(() => filterBookmarks(bookmarkBarRoots.flatMap((node) => node.children ?? []), query), [bookmarkBarRoots, query]);
  const filteredTabGroups = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return groupTabsForDisplay(tabs).filter((group) => group.tabs.some((tab) => `${tab.title} ${tab.url}`.toLocaleLowerCase().includes(term)));
  }, [tabs, query]);
  const filteredTabs = filteredTabGroups.flatMap((group) => group.tabs);
  const pinnedTabGroups = filteredTabGroups.filter((group) => group.tabs[0].pinned);
  const regularTabGroups = filteredTabGroups.filter((group) => !group.tabs[0].pinned);
  const pinnedTabs = filteredTabs.filter((tab) => tab.pinned);
  const regularTabs = filteredTabs.filter((tab) => !tab.pinned);
  const openSearch = useCallback(() => {
    void requestLauncher().catch((reason: unknown) => { toast.error(reason instanceof Error ? reason.message : '検索を開けませんでした。'); });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !editor && !deleting && !cleanupOpen) {
        event.preventDefault();
        openSearch();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); };
  }, [editor, deleting, cleanupOpen, openSearch]);

  useLayoutEffect(() => {
    if (cleanupOpen || !cleanupReturnFocus.current) return;
    const target = cleanupReturnFocus.current === 'trigger' ? cleanupTrigger.current : document.querySelector<HTMLButtonElement>('#tabs-heading button');
    cleanupReturnFocus.current = null;
    (target?.disabled ? search.current : target)?.focus({ preventScroll: true });
  }, [cleanupOpen]);

  useLayoutEffect(() => {
    if (editor || !editorReturnFocus.current) return;
    const target = editorReturnFocus.current;
    editorReturnFocus.current = null;
    (target.isConnected ? target : search.current)?.focus({ preventScroll: true });
  }, [editor]);

  const run = useCallback((action: () => Promise<void>) => {
    void action().catch((reason: unknown) => { toast.error(reason instanceof Error ? reason.message : '操作を完了できませんでした。'); });
  }, []);

  const openEditor = (next: BookmarkEditorState) => {
    editorReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDeleting(null);
    setEditor(next);
  };

  const deleteBookmark = async (id: string) => {
    await browser.deleteBookmark(id);
    setDeleting((current) => current?.id === id ? null : current);
    if (document.activeElement === document.body || document.activeElement?.closest('[data-bookmark-delete-confirmation]')) {
      search.current?.focus({ preventScroll: true });
    }
    toast.success('削除しました');
  };

  const toggleFolder = (id: string) => {
    const expanded = preferences.expandedFolders;
    updatePreferences({ expandedFolders: expanded.includes(id) ? expanded.filter((item) => item !== id) : [...expanded, id] });
  };

  const renameBookmark = async (id: string, title: string) => {
    await browser.renameBookmark(id, title);
    toast.success('名前を変更しました');
  };

  const closeCleanup = (focus: 'trigger' | 'heading') => {
    cleanupReturnFocus.current = focus;
    setCleanupOpen(false);
  };

  const cleanupTabs = async () => {
    await browser.closeOtherTabs();
    closeCleanup('heading');
    toast.success('ほかのタブを閉じました');
  };

  const saveBookmark = async (input: BookmarkInput, id?: string) => {
    if (id) await browser.updateBookmark(id, input);
    else await browser.createBookmark(input);
    if (!preferences.expandedFolders.includes(input.parentId)) {
      updatePreferences({ expandedFolders: [...preferences.expandedFolders, input.parentId] });
    }
    toast.success(id ? '変更を保存しました' : '追加しました');
  };

  const expandFolder = useCallback((id: string) => {
    if (!preferences.expandedFolders.includes(id)) {
      updatePreferences({ expandedFolders: [...preferences.expandedFolders, id] });
    }
  }, [preferences.expandedFolders, updatePreferences]);

  const bookmarkDrag = useBookmarkDrag({
    bookmarks: bookmarkBarRoots, tabs, expanded: preferences.expandedFolders, searching: !!query.trim(),
    disabled: pendingTabIds.length > 0,
    onExpand: expandFolder,
    onMove: (id, destination) => browser.moveBookmark(id, destination),
    onCreate: async (input) => {
      await browser.createBookmark(input);
      toast.success('ブックマークに追加しました');
    },
    onStart: () => { setDeleting(null); },
    onEnd: () => { setDraggingId(null); setTabDropTarget(null); },
    onError: (reason) => { toast.error(reason instanceof Error ? reason.message : '操作を完了できませんでした。'); },
  });

  const overBookmarkBar = (event: DragEvent<HTMLElement>, drop = false) => {
    if (!bookmarkBar || (event.target as Element).closest('[data-bookmark-id], [data-bookmark-empty-folder]')) return;
    if (drop) bookmarkDrag.drop(event, bookmarkBar.id, 'inside');
    else bookmarkDrag.enter(event, bookmarkBar.id, 'inside');
  };

  const endDrag = () => { bookmarkDrag.end(); };
  const canDrop = (tab: TabItem, position: TabDropPosition) => {
    if (tabOperationPending.current || bookmarkDrag.isPending || cleanupOpen) return false;
    if (bookmarkDrag.draggingId !== null) {
      const node = findBookmark(bookmarkBarRoots, bookmarkDrag.draggingId);
      if (position !== 'split' || !browser.supportsSplitView || isSplitTab(tab) || !node?.url) return false;
      try { assertOpenableUrl(node.url); return true; } catch { return false; }
    }
    return draggingId !== null && draggingId !== tab.id
      && tabs.some((source) => source.id === draggingId && source.windowId === tab.windowId && source.pinned === tab.pinned
        && (position !== 'split' || (browser.supportsSplitView && canSplitTabs(source, tab))));
  };
  const runTabOperation = (ids: number[], action: () => Promise<void>, message: string) => {
    if (tabOperationPending.current) return;
    tabOperationPending.current = true;
    setPendingTabIds(ids);
    run(async () => {
      try {
        await action();
        toast.success(message);
      } finally {
        tabOperationPending.current = false;
        setPendingTabIds([]);
      }
    });
  };
  const moveWithKeys = (tab: TabItem, direction: -1 | 1) => {
    if (tabOperationPending.current) return;
    const siblings = tabs.filter((item) => item.pinned === tab.pinned);
    const target = siblings[siblings.findIndex((item) => item.id === tab.id) + direction];
    if (target) run(() => browser.moveTab(tab.id, target.index));
  };
  const renderTab = (tab: TabItem, compact = false) => <TabRow key={tab.id} tab={tab} draggingId={draggingId} dropTarget={tabDropTarget} compact={compact}
    draggingBookmarkId={bookmarkDrag.draggingId}
    bookmarking={bookmarkDrag.pendingTabId === tab.id} faviconRevision={faviconRevision}
    busy={pendingTabIds.includes(tab.id)} dragDisabled={bookmarkDrag.isPending || pendingTabIds.length > 0 || cleanupOpen} supportsSplitView={browser.supportsSplitView}
    onDragStart={(id) => { setDraggingId(id); bookmarkDrag.startTab(id); }} onDragEnd={endDrag} onDragOver={setTabDropTarget} canDrop={canDrop}
    onDrop={(target, position) => {
      if (bookmarkDrag.draggingId !== null) {
        const node = findBookmark(bookmarkBarRoots, bookmarkDrag.draggingId);
        if (node?.url && position === 'split') runTabOperation([target.id], () => browser.openBookmarkInSplit(node.url!, target.id), 'Split Viewにしました');
        return;
      }
      const source = tabs.find((item) => item.id === draggingId);
      if (!source) return;
      if (position === 'split') runTabOperation([source.id, target.id], () => browser.splitTabs(source.id, target.id), 'Split Viewにしました');
      else {
        const group = groupTabsForDisplay(tabs).find((item) => item.tabs.some((tab) => tab.id === target.id));
        const boundary = position === 'before' ? group?.tabs[0] : group?.tabs.at(-1);
        run(() => browser.moveTab(source.id, tabMoveIndex(source, boundary ?? target, position)));
      }
    }}
    onUnsplit={(id) => { runTabOperation(tabs.filter((item) => item.splitViewId === tab.splitViewId).map((item) => item.id), () => browser.unsplitTab(id), 'Split Viewを解除しました'); }}
    onActivate={(id) => { run(() => browser.activateTab(id)); }} onClose={(id) => { run(() => browser.closeTab(id)); }}
    onPin={(id, pinned) => { run(() => browser.pinTab(id, pinned)); }} onMute={(id, muted) => { run(() => browser.muteTab(id, muted)); }} onMove={moveWithKeys}
  />;
  const renderTabGroup = (group: TabDisplayGroup) => {
    if (group.tabs.length < 2) return renderTab(group.tabs[0]);
    const dropPosition = group.tabs.some((tab) => tab.id === tabDropTarget?.id) ? tabDropTarget?.position : undefined;
    return <li key={group.key} data-split-view-group={group.tabs[0].splitViewId} className="relative rounded-lg border border-border bg-muted/30 p-1">
      {(dropPosition === 'before' || dropPosition === 'after') && <span aria-hidden="true" className={cn('pointer-events-none absolute right-1 left-1 z-10 h-0.5 rounded-full bg-primary', dropPosition === 'before' ? '-top-0.5' : '-bottom-0.5')} />}
      <div role="group" aria-label={`Split View: ${group.tabs.map((tab) => tab.title).join(' / ')}`} className="grid min-w-0 grid-cols-2 gap-1">
        {group.tabs.map((tab) => renderTab(tab, true))}
      </div>
    </li>;
  };

  return <main aria-label="arcly" className={cn('grid h-full min-w-0 grid-cols-1 grid-rows-1 bg-background p-3 text-foreground', browser.isDemo && 'mx-auto max-w-sm border-x')}>
    <div className={cn('col-start-1 row-start-1 flex min-h-0 min-w-0 flex-col gap-3', editor && 'opacity-0')} inert={!!editor} aria-hidden={editor ? true : undefined}>
    <div className="relative shrink-0">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input ref={search} type="search" className="h-9 pr-12 pl-9 text-xs [&::-webkit-search-cancel-button]:hidden" aria-label="ブックマークとタブを検索" placeholder="ブックマークとタブを検索" value={query} onChange={(event) => { setQuery(event.target.value); }} onKeyDown={(event) => { if (event.key === 'Escape') setQuery(''); }} />
      <div className="absolute top-1/2 right-2 -translate-y-1/2">{query ? <IconButton title="検索をクリア" onClick={() => { setQuery(''); search.current?.focus(); }}><X /></IconButton> : <Button type="button" variant="ghost" size="xs" className="h-6 px-1 text-[10px] text-muted-foreground" aria-label="すべてのブックマークとタブを検索" onClick={openSearch}><kbd className="rounded border bg-muted px-1 py-0.5 font-sans">{isMac ? '⌘' : 'Ctrl'} K</kbd></Button>}</div>
    </div>

    {error && <Alert variant="destructive" className="flex shrink-0 items-center gap-2 p-3"><CircleAlert className="size-4" /><AlertDescription className="min-w-0 flex-1 break-all text-xs">{error}</AlertDescription><Button type="button" variant="link" size="xs" className="text-destructive" onClick={retry}>再試行</Button></Alert>}

    <ScrollArea role="region" aria-label="ブックマークとタブ一覧" className={cn('min-h-0 flex-1 pr-2', bookmarkDrag.active && '[&_[data-slot=scroll-area-viewport]]:overflow-y-hidden!')} onDragOver={bookmarkDrag.scrollOver} onDragLeave={bookmarkDrag.scrollLeave}>
      <Collapsible asChild open={!preferences.bookmarksCollapsed} onOpenChange={(open) => { updatePreferences({ bookmarksCollapsed: !open }); }}>
        <section className={cn('min-h-10 overflow-hidden rounded-md', bookmarkBar && bookmarkDrag.target?.id === bookmarkBar.id && 'ring-1 ring-primary ring-inset')} aria-labelledby="bookmarks-heading"
          data-bookmark-bar-drop-target={bookmarkBar?.id} onDragOver={(event) => { overBookmarkBar(event); }} onDragLeave={bookmarkDrag.leave} onDrop={(event) => { overBookmarkBar(event, true); }}>
          <div className="flex h-10 shrink-0 items-center gap-1">
            <h2 id="bookmarks-heading" className="min-w-0"><CollapsibleTrigger asChild><Button type="button" variant="ghost" size="sm" className="gap-1.5 px-1 text-xs"><ChevronDown className={cn('size-3 text-muted-foreground transition-transform', preferences.bookmarksCollapsed && '-rotate-90')} /><Bookmark className="size-3.5 text-muted-foreground" />ブックマーク</Button></CollapsibleTrigger></h2>
            <div className="ml-auto flex items-center gap-0.5"><IconButton title="フォルダを追加" disabled={loading || !bookmarkBar} onClick={() => { openEditor({ kind: 'folder', parentId: bookmarkBar?.id }); }}><FolderPlus /></IconButton><IconButton title="ブックマークを追加" disabled={loading || !bookmarkBar} onClick={() => { openEditor({ kind: 'bookmark', parentId: bookmarkBar?.id }); }}><Plus /></IconButton></div>
          </div>
          <CollapsibleContent>
              {loading ? <LoadingList /> : filteredBookmarks.length
                ? <BookmarkTree nodes={filteredBookmarks} expanded={preferences.expandedFolders} searching={!!query.trim()} onToggle={toggleFolder} onOpen={(url, background) => { run(() => browser.openBookmark(url, !background)); }} onEdit={(node) => { openEditor({ node, kind: node.url ? 'bookmark' : 'folder' }); }} onRename={renameBookmark} onDelete={(node) => { setDeleting(findBookmark(bookmarks, node.id) ?? node); }} onAdd={(parentId, kind) => { openEditor({ kind, parentId }); }} deletion={deleting ? { node: deleting, onCancel: () => { setDeleting(null); }, onDelete: deleteBookmark } : undefined} drag={bookmarkDrag} faviconRevision={faviconRevision} />
                : <div className="flex flex-col items-center gap-3 px-2 py-8 text-center text-xs text-muted-foreground"><Bookmark className="size-6" /><p>{query.trim() ? '一致するブックマークがありません' : 'ブックマークがありません'}</p>{!query.trim() && <Button type="button" variant="outline" size="sm" disabled={!bookmarkBar} onClick={() => { openEditor({ kind: 'bookmark', parentId: bookmarkBar?.id }); }}>ブックマークを追加</Button>}</div>}
          </CollapsibleContent>
        </section>
      </Collapsible>

      <Separator className="my-3" />

      <Collapsible asChild open={!preferences.tabsCollapsed} onOpenChange={(open) => { updatePreferences({ tabsCollapsed: !open }); }}>
        <section className="min-h-10" aria-labelledby="tabs-heading">
          <div className="flex h-10 shrink-0 items-center gap-1">
            <h2 id="tabs-heading"><CollapsibleTrigger asChild><Button type="button" variant="ghost" size="sm" className="gap-1.5 px-1 text-xs" disabled={cleanupOpen}><ChevronDown className={cn('size-3 text-muted-foreground transition-transform', preferences.tabsCollapsed && '-rotate-90')} /><Layers2 className="size-3.5 text-muted-foreground" />タブ<Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] tabular-nums">{tabs.length}</Badge></Button></CollapsibleTrigger></h2>
            <div className="ml-auto flex items-center gap-0.5">
              <IconButton title="タブをクリーンアップ" aria-expanded={cleanupOpen} aria-controls={cleanupOpen ? 'tab-cleanup-confirmation' : undefined} disabled={loading || !activeTab || tabs.length < 2 || cleanupOpen || bookmarkDrag.active || bookmarkDrag.isPending || pendingTabIds.length > 0} onClick={(event) => {
                cleanupTrigger.current = event.currentTarget;
                setDeleting(null);
                if (preferences.tabsCollapsed) updatePreferences({ tabsCollapsed: false });
                setCleanupOpen(true);
              }}><BrushCleaning /></IconButton>
              <IconButton title="新しいタブを開く" onClick={() => { run(() => browser.openUrl('chrome://newtab/')); }} disabled={loading}><Plus /></IconButton>
            </div>
          </div>
          <CollapsibleContent>
              {cleanupOpen && <TabCleanupConfirmation count={tabs.filter((tab) => !tab.active).length} hasActiveTab={!!activeTab} onCancel={() => { closeCleanup('trigger'); }} onConfirm={cleanupTabs} />}
              {loading ? <LoadingList /> : filteredTabs.length ? <>
                {pinnedTabs.length > 0 && <><div className="flex items-center gap-1.5 px-2 pt-1 pb-2 text-[10px] text-muted-foreground"><Pin className="size-3" />固定済み<span className="ml-auto tabular-nums">{pinnedTabs.length}</span></div><ul className="space-y-1" aria-label="固定済みのタブ">{pinnedTabGroups.map(renderTabGroup)}</ul></>}
                {regularTabs.length > 0 && <>{pinnedTabs.length > 0 && <><Separator className="my-3" /><div className="flex items-center px-2 pb-2 text-[10px] text-muted-foreground">開いているタブ<span className="ml-auto tabular-nums">{regularTabs.length}</span></div></>}<ul className="space-y-1" aria-label="開いているタブ">{regularTabGroups.map(renderTabGroup)}</ul></>}
              </> : <div className="flex flex-col items-center gap-3 px-2 py-8 text-center text-xs text-muted-foreground"><Layers2 className="size-6" /><p>{query.trim() ? '一致するタブがありません' : '開いているタブがありません'}</p>{!query.trim() && <Button type="button" variant="outline" size="sm" onClick={() => { run(() => browser.openUrl('chrome://newtab/')); }}>新しいタブを開く</Button>}</div>}
              {!query.trim() && !loading && regularTabs.length > 0 && <Button type="button" variant="ghost" className="mt-2 w-full justify-start gap-2 px-2 text-xs font-normal text-muted-foreground" onClick={() => { run(() => browser.openUrl('chrome://newtab/')); }}><Plus className="size-4" />新しいタブ</Button>}
          </CollapsibleContent>
        </section>
      </Collapsible>
    </ScrollArea>

    </div>
    {editor && <BookmarkEditor editor={editor} bookmarks={bookmarkBarRoots} activeTab={activeTab} onClose={() => { setEditor(null); }} onSave={saveBookmark} />}
  </main>;
}
