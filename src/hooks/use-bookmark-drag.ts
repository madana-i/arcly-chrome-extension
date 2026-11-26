import { useEffect, useRef, useState, type DragEvent } from 'react';
import type { BookmarkCreate, BookmarkMove, BookmarkNode, TabItem } from '@/types';
import { assertOpenableUrl, findBookmark } from '@/lib/bookmarks';
import { BOOKMARK_DRAG_TYPE, TAB_DRAG_TYPE, getBookmarkDropPosition, resolveBookmarkDrop, resolveBookmarkInsertion, type BookmarkDropPosition, type BookmarkDropTarget } from '@/lib/bookmark-drag';

type DragSource = { kind: 'bookmark'; id: string } | { kind: 'tab'; id: number };

interface Options {
  bookmarks: BookmarkNode[];
  tabs: TabItem[];
  expanded: string[];
  searching: boolean;
  onExpand: (id: string) => void;
  onMove: (id: string, destination: BookmarkMove) => Promise<void>;
  onCreate: (input: BookmarkCreate) => Promise<void>;
  onError: (reason: unknown) => void;
  onStart: () => void;
  onEnd?: () => void;
  disabled?: boolean;
}

export function useBookmarkDrag({ bookmarks, tabs, expanded, searching, onExpand, onMove, onCreate, onError, onStart, onEnd, disabled = false }: Options) {
  const [dragging, setDragging] = useState<DragSource | null>(null);
  const [target, setTarget] = useState<BookmarkDropTarget | null>(null);
  const [saving, setSaving] = useState<DragSource | null>(null);
  const source = useRef<DragSource | null>(null);
  const over = useRef<BookmarkDropTarget | null>(null);
  const pending = useRef(false);
  const frame = useRef<number | null>(null);
  const scrolling = useRef<{ element: HTMLElement; speed: number } | null>(null);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  useEffect(() => {
    if (!target || target.position !== 'inside' || searching || expanded.includes(target.id)) return;
    const timer = setTimeout(() => { onExpand(target.id); }, 550);
    return () => { clearTimeout(timer); };
  }, [target, expanded, searching, onExpand]);

  const showTarget = (next: BookmarkDropTarget | null) => {
    if (over.current?.id === next?.id && over.current?.position === next?.position) return;
    over.current = next;
    setTarget(next);
  };

  const stopScrolling = () => {
    scrolling.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };

  const end = () => {
    source.current = null;
    setDragging(null);
    showTarget(null);
    stopScrolling();
    onEnd?.();
  };

  const getTarget = (event: DragEvent<HTMLElement>, id: string, position?: BookmarkDropPosition): BookmarkDropTarget => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { id, position: position ?? getBookmarkDropPosition(!findBookmark(bookmarks, id)?.url, event.clientY - bounds.top, bounds.height) };
  };

  const start = (event: DragEvent<HTMLElement>, id: string) => {
    const node = findBookmark(bookmarks, id);
    if (disabled || pending.current || !node || node.readOnly || node.managed) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.clearData();
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.setData(BOOKMARK_DRAG_TYPE, id);
    const bounds = event.currentTarget.getBoundingClientRect();
    event.dataTransfer.setDragImage(event.currentTarget, event.clientX - bounds.left, event.clientY - bounds.top);
    source.current = { kind: 'bookmark', id };
    setDragging(source.current);
    showTarget(null);
    onStart();
  };

  const startTab = (id: number) => {
    if (disabled || pending.current || !tabs.some((tab) => tab.id === id)) return;
    source.current = { kind: 'tab', id };
    setDragging(source.current);
    showTarget(null);
    onStart();
  };

  const bookmarkableTab = (id: number) => {
    const tab = tabs.find((item) => item.id === id);
    if (!tab?.url) return null;
    try {
      assertOpenableUrl(tab.url);
      return tab;
    } catch { return null; }
  };

  const destinationFor = (current: DragSource, next: BookmarkDropTarget) => current.kind === 'bookmark'
    ? resolveBookmarkDrop(bookmarks, current.id, next)
    : bookmarkableTab(current.id) ? resolveBookmarkInsertion(bookmarks, next) : null;

  const enter = (event: DragEvent<HTMLElement>, id: string, position?: BookmarkDropPosition) => {
    if (!source.current) return;
    event.preventDefault();
    const next = getTarget(event, id, position);
    const valid = destinationFor(source.current, next);
    event.dataTransfer.dropEffect = valid ? source.current.kind === 'tab' ? 'copy' : 'move' : 'none';
    showTarget(valid ? next : null);
  };

  const leave = (event: DragEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) showTarget(null);
  };

  const drop = (event: DragEvent<HTMLElement>, id: string, position?: BookmarkDropPosition) => {
    if (!source.current) return;
    event.preventDefault();
    event.stopPropagation();
    const current = source.current;
    const mime = current.kind === 'bookmark' ? BOOKMARK_DRAG_TYPE : TAB_DRAG_TYPE;
    const destination = event.dataTransfer.getData(mime) === String(current.id)
      ? destinationFor(current, getTarget(event, id, position))
      : null;
    const tab = current.kind === 'tab' ? bookmarkableTab(current.id) : null;
    end();
    if (!destination || pending.current) return;
    pending.current = true;
    setSaving(current);
    void (async () => {
      try {
        if (current.kind === 'bookmark') await onMove(current.id, destination);
        else if (tab) await onCreate({ title: tab.title || tab.url, url: tab.url, ...destination });
        onExpand(destination.parentId);
      } catch (reason) {
        onError(reason);
      } finally {
        pending.current = false;
        setSaving(null);
      }
    })();
  };

  const scrollStep = () => {
    // The shared viewport uses overflow:hidden during a drag to suppress
    // Chrome's concurrent auto-scroll. Programmatic scrolling still works.
    if (!scrolling.current || !source.current) {
      frame.current = null;
      return;
    }
    scrolling.current.element.scrollTop += scrolling.current.speed;
    frame.current = requestAnimationFrame(scrollStep);
  };

  const scrollOver = (event: DragEvent<HTMLElement>) => {
    if (!source.current) return;
    const tabDrop = event.defaultPrevented
      && !!(event.target as Element).closest('[data-tab-id]');
    event.preventDefault();
    if (!(event.target as Element).closest('[data-bookmark-id], [data-bookmark-empty-folder], [data-bookmark-bar-drop-target]')) {
      showTarget(null);
      // A tab row may accept a reorder or a tab/bookmark split. Preserve its
      // cursor while allowing auto-scroll across the entire shared viewport.
      if (!tabDrop) event.dataTransfer.dropEffect = 'none';
    }
    const viewport = event.currentTarget.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport) return;
    const bounds = viewport.getBoundingClientRect();
    const edge = Math.min(32, bounds.height / 3);
    const distance = event.clientY < bounds.top + edge ? event.clientY - (bounds.top + edge)
      : event.clientY > bounds.bottom - edge ? event.clientY - (bounds.bottom - edge) : 0;
    if (!distance) {
      stopScrolling();
      return;
    }
    scrolling.current = { element: viewport, speed: Math.max(-10, Math.min(10, distance / 3)) };
    if (frame.current === null) frame.current = requestAnimationFrame(scrollStep);
  };

  const scrollLeave = (event: DragEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      showTarget(null);
      stopScrolling();
    }
  };

  return {
    active: !!dragging,
    draggingId: dragging?.kind === 'bookmark' ? dragging.id : null,
    isPending: !!saving || disabled,
    pendingId: saving?.kind === 'bookmark' ? saving.id : null,
    pendingTabId: saving?.kind === 'tab' ? saving.id : null,
    target, start, startTab, enter, leave, drop, end, scrollOver, scrollLeave,
  };
}

export type BookmarkDrag = ReturnType<typeof useBookmarkDrag>;
