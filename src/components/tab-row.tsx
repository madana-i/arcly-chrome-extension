import { Columns2, Pin, PinOff, Square, Volume2, VolumeX, X } from 'lucide-react';
import type { TabItem } from '@/types';
import { displayDomain } from '@/lib/bookmarks';
import { BOOKMARK_DRAG_TYPE, TAB_DRAG_TYPE } from '@/lib/bookmark-drag';
import { getTabDropPosition, isSplitTab, type TabDropPosition, type TabDropTarget } from '@/lib/tab-drag';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { IconButton } from './icon-button';
import { SiteIcon } from './site-icon';

interface Props {
  tab: TabItem;
  draggingId: number | null;
  draggingBookmarkId: string | null;
  dropTarget: TabDropTarget | null;
  bookmarking?: boolean;
  busy?: boolean;
  dragDisabled?: boolean;
  supportsSplitView: boolean;
  compact?: boolean;
  faviconRevision?: number;
  onDragStart: (id: number) => void;
  onDragEnd: () => void;
  onDragOver: (target: TabDropTarget | null) => void;
  canDrop: (tab: TabItem, position: TabDropPosition) => boolean;
  onDrop: (tab: TabItem, position: TabDropPosition) => void;
  onUnsplit: (id: number) => void;
  onActivate: (id: number) => void;
  onClose: (id: number) => void;
  onPin: (id: number, pinned: boolean) => void;
  onMute: (id: number, muted: boolean) => void;
  onMove: (tab: TabItem, direction: -1 | 1) => void;
}

const actionClass = 'pointer-events-none opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 [@media(pointer:coarse)]:pointer-events-auto [@media(pointer:coarse)]:opacity-100';

export function TabRow({ tab, draggingId, draggingBookmarkId, dropTarget, bookmarking = false, busy = false, dragDisabled = false, supportsSplitView, compact = false, faviconRevision, onDragStart, onDragEnd, onDragOver, canDrop, onDrop, onUnsplit, onActivate, onClose, onPin, onMute, onMove }: Props) {
  const dropPosition = dropTarget?.id === tab.id ? dropTarget.position : undefined;
  const split = isSplitTab(tab);
  const Row = compact ? 'div' : 'li';
  return <ContextMenu><ContextMenuTrigger asChild disabled={!split || !supportsSplitView || busy || dragDisabled || draggingId !== null || draggingBookmarkId !== null}>
  <Row
    data-tab-id={tab.id}
    data-split-view-id={split ? tab.splitViewId : undefined}
    data-tab-drop-position={dropPosition}
    aria-busy={bookmarking || busy ? true : undefined}
    className={cn('group/tab group relative flex h-12 min-w-0 items-center rounded-md border border-transparent pr-1 transition-colors hover:bg-accent/50 focus-within:bg-accent/50 data-[state=open]:bg-accent/50', compact && 'border-border/60 bg-background/60', tab.active && 'border-border bg-accent text-accent-foreground', draggingId === tab.id && 'opacity-40', (bookmarking || busy) && 'opacity-60', dropPosition === 'split' && 'bg-accent ring-1 ring-primary ring-inset')}
    draggable={!bookmarking && !busy && !dragDisabled}
    onDragStart={(event) => {
      if (bookmarking || busy || dragDisabled) { event.preventDefault(); return; }
      event.dataTransfer.clearData();
      event.dataTransfer.effectAllowed = 'copyMove';
      event.dataTransfer.setData(TAB_DRAG_TYPE, String(tab.id));
      onDragStart(tab.id);
    }}
    onDragOver={(event) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const position = getTabDropPosition(event.clientY - bounds.top, bounds.height, supportsSplitView);
      if (!canDrop(tab, position)) { onDragOver(null); return; }
      event.preventDefault();
      event.dataTransfer.dropEffect = draggingBookmarkId !== null ? 'copy' : 'move';
      onDragOver({ id: tab.id, position });
    }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onDragOver(null); }}
    onDrop={(event) => {
      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      const position = getTabDropPosition(event.clientY - bounds.top, bounds.height, supportsSplitView);
      const sourceId = draggingBookmarkId ?? draggingId;
      const mime = draggingBookmarkId !== null ? BOOKMARK_DRAG_TYPE : TAB_DRAG_TYPE;
      if (sourceId !== null && event.dataTransfer.getData(mime) === String(sourceId) && canDrop(tab, position)) onDrop(tab, position);
      onDragEnd();
    }}
    onDragEnd={onDragEnd}
  >
    {!compact && (dropPosition === 'before' || dropPosition === 'after') && <span aria-hidden="true" className={cn('pointer-events-none absolute right-1 left-1 z-10 h-0.5 rounded-full bg-primary', dropPosition === 'before' ? '-top-0.5' : '-bottom-0.5')} />}
    <Button type="button" variant="ghost" className={cn('h-full min-w-0 flex-1 justify-start gap-2 px-2 py-1 text-left font-normal hover:bg-transparent dark:hover:bg-transparent', compact && 'gap-1.5 px-1.5')}
      data-tab-activate
      aria-current={tab.active ? 'page' : undefined}
      title={`${tab.title}\n${tab.url}${split ? '\nSplit View・右クリックで解除' : ''}\nAlt + ↑ / ↓ で並び替え`}
      disabled={busy}
      onClick={() => { onActivate(tab.id); }}
      onKeyDown={(event) => {
        if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
          event.preventDefault();
          onMove(tab, event.key === 'ArrowUp' ? -1 : 1);
        }
      }}
    >
      <SiteIcon url={tab.url} revision={faviconRevision} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className={cn('truncate text-xs', tab.active && 'font-medium')}>{tab.title}</span><span className="truncate text-[10px] text-muted-foreground">{dropPosition === 'split' ? '離してSplit Viewで表示' : displayDomain(tab.url)}</span></span>
    </Button>
    <div className="flex shrink-0 items-center">
      {split && !compact && <span className="flex size-6 items-center justify-center text-muted-foreground" title="Split View・右クリックで解除" aria-label="Split View"><Columns2 className="size-3.5" aria-hidden="true" /></span>}
      {(tab.audible || tab.muted) && <IconButton disabled={busy} title={tab.muted ? `${tab.title}のミュートを解除` : `${tab.title}をミュート`} onClick={() => { onMute(tab.id, !tab.muted); }}>{tab.muted ? <VolumeX /> : <Volume2 />}</IconButton>}
      {!compact && <IconButton disabled={busy} className={actionClass} title={tab.pinned ? `${tab.title}の固定を解除` : `${tab.title}を固定`} onClick={() => { onPin(tab.id, !tab.pinned); }}>{tab.pinned ? <PinOff /> : <Pin />}</IconButton>}
      <IconButton disabled={busy} className={cn(actionClass, 'hover:bg-destructive/10 hover:text-destructive', compact && 'w-0 overflow-hidden group-focus-within/tab:w-6 group-hover/tab:w-6 [@media(pointer:coarse)]:w-6')} title={`${tab.title}を閉じる`} onClick={() => { onClose(tab.id); }}><X /></IconButton>
    </div>
  </Row></ContextMenuTrigger>
    {split && supportsSplitView && <ContextMenuContent className="w-48" aria-label={`${tab.title}の操作`}>
      <ContextMenuItem disabled={busy || dragDisabled} onSelect={() => { onUnsplit(tab.id); }}><Square />Split Viewを解除</ContextMenuItem>
      {compact && <>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={busy} onSelect={() => { onPin(tab.id, !tab.pinned); }}>{tab.pinned ? <PinOff /> : <Pin />}{tab.pinned ? 'タブの固定を解除' : 'タブを固定'}</ContextMenuItem>
        <ContextMenuItem disabled={busy} variant="destructive" onSelect={() => { onClose(tab.id); }}><X />タブを閉じる</ContextMenuItem>
      </>}
    </ContextMenuContent>}
  </ContextMenu>;
}
