import { ChevronRight, Folder, FolderOpen, FolderPlus, Pencil, Plus, TextCursorInput, Trash2 } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import type { BookmarkNode } from '@/types';
import type { BookmarkDrag } from '@/hooks/use-bookmark-drag';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { BookmarkDeleteConfirmation, type BookmarkDeletion } from './bookmark-delete-confirmation';
import { BookmarkNameInput } from './bookmark-name-input';
import { SiteIcon } from './site-icon';

const INDENT = 20;
const LABEL_OFFSET = 48;

interface Props {
  nodes: BookmarkNode[];
  expanded: string[];
  searching: boolean;
  onToggle: (id: string) => void;
  onOpen: (url: string, background: boolean) => void;
  onEdit: (node: BookmarkNode) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (node: BookmarkNode) => void;
  onAdd: (parentId: string, kind: 'bookmark' | 'folder') => void;
  deletion?: BookmarkDeletion;
  drag?: BookmarkDrag;
  faviconRevision?: number;
  depth?: number;
}

export function BookmarkTree({ nodes, depth = 0, ...props }: Props) {
  return <ul className="space-y-0.5" aria-label={depth === 0 ? 'ブックマーク一覧' : undefined}>
    {nodes.map((node) => <BookmarkTreeItem key={node.id} node={node} depth={depth} {...props} />)}
  </ul>;
}

function BookmarkTreeItem({ node, expanded, searching, onToggle, onOpen, onEdit, onRename, onDelete, onAdd, deletion, drag, faviconRevision, depth = 0 }: Omit<Props, 'nodes'> & { node: BookmarkNode }) {
  const row = useRef<HTMLDivElement>(null);
  const menuAction = useRef<(() => void) | null>(null);
  const returnFocus = useRef(false);
  const [renaming, setRenaming] = useState(false);
  const isFolder = !node.url;
  const isExpanded = searching || expanded.includes(node.id);
  const canAdd = isFolder && !node.managed;
  const canEdit = !node.readOnly;
  const canDrag = !!drag && canEdit && !node.managed && !renaming && !drag.isPending && deletion?.node.id !== node.id;
  const dropPosition = drag?.target?.id === node.id ? drag.target.position : undefined;
  const icons = <>
    {isFolder ? <ChevronRight className={cn('size-3 shrink-0 text-muted-foreground transition-transform duration-200 ease-out', isExpanded && 'rotate-90')} /> : <span className="size-3 shrink-0" aria-hidden="true" />}
    {isFolder ? <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">{isExpanded ? <FolderOpen className="size-4" /> : <Folder className="size-4" />}</span> : <SiteIcon url={node.url!} className="size-5 text-[10px]" revision={faviconRevision} />}
  </>;

  useLayoutEffect(() => {
    if (renaming || !returnFocus.current) return;
    returnFocus.current = false;
    row.current?.querySelector<HTMLElement>('button, a')?.focus({ preventScroll: true });
  }, [renaming]);
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.type === 'auxclick' && event.button !== 1) return;
    event.preventDefault();
    onOpen(node.url!, event.metaKey || event.ctrlKey || event.button === 1);
  };

  return <Collapsible asChild open={isExpanded} onOpenChange={() => { if (!searching) onToggle(node.id); }}>
    <li className={cn('relative', drag?.draggingId === node.id && 'opacity-40', drag?.pendingId === node.id && 'opacity-60')} aria-busy={drag?.pendingId === node.id ? true : undefined}>
      {(dropPosition === 'before' || dropPosition === 'after') && <span aria-hidden="true" data-bookmark-drop-indicator={dropPosition} className={cn('pointer-events-none absolute right-1 z-10 h-0.5 rounded-full bg-primary', dropPosition === 'before' ? 'top-0' : 'bottom-0')} style={{ left: depth * INDENT + 22 }} />}
      <ContextMenu>
        <ContextMenuTrigger asChild disabled={renaming || !!drag?.active || (!canAdd && !canEdit)}>
          <div ref={row} data-bookmark-id={node.id} data-bookmark-drop-position={dropPosition} className={cn('flex min-h-8 items-center rounded-md pr-1 hover:bg-accent/50 focus-within:bg-accent/50 data-[state=open]:bg-accent/50', dropPosition === 'inside' && 'bg-accent ring-1 ring-primary ring-inset', canDrag && '[&_a]:cursor-grab [&_button]:cursor-grab')} style={{ paddingLeft: depth * INDENT }}
            draggable={canDrag}
            onDragStart={(event) => { if (canDrag) drag?.start(event, node.id); }}
            onDragOver={(event) => { drag?.enter(event, node.id); }}
            onDragLeave={(event) => { drag?.leave(event); }}
            onDrop={(event) => { drag?.drop(event, node.id); }}
            onDragEnd={() => { drag?.end(); }}>
            {renaming ? <div className="flex min-h-8 min-w-0 flex-1 items-center gap-1.5 px-1">
                {icons}
                <BookmarkNameInput title={node.title} onSave={(title) => onRename(node.id, title)} onClose={(restoreFocus) => {
                  returnFocus.current = restoreFocus;
                  setRenaming(false);
                }} />
              </div> : isFolder
              ? <CollapsibleTrigger asChild><Button type="button" variant="ghost" className="h-8 min-w-0 flex-1 justify-start gap-1.5 px-1 text-xs font-normal" title={node.title}>
                  {icons}
                  <span className="truncate">{node.title || '無題のフォルダ'}</span>
                </Button></CollapsibleTrigger>
              : <Button variant="ghost" asChild className="h-8 min-w-0 flex-1 justify-start gap-1.5 px-1 text-xs font-normal"><a href={node.url} draggable={false} title={`${node.title}\n${node.url}`} onClick={open} onAuxClick={open}>
                  {icons}
                  <span className="truncate">{node.title || node.url}</span>
                </a></Button>}
          </div>
        </ContextMenuTrigger>
        {(canAdd || canEdit) && <ContextMenuContent className="w-44" aria-label={`${node.title || (isFolder ? '無題のフォルダ' : node.url)}の操作`} onCloseAutoFocus={(event) => {
          const action = menuAction.current;
          if (!action) return;
          event.preventDefault();
          menuAction.current = null;
          // Finish closing the menu before moving focus into the next view.
          row.current?.querySelector<HTMLElement>('button, a')?.focus();
          action();
        }}>
          {canAdd && <>
            <ContextMenuItem onSelect={() => { menuAction.current = () => { onAdd(node.id, 'bookmark'); }; }}><Plus />ブックマークを追加</ContextMenuItem>
            <ContextMenuItem onSelect={() => { menuAction.current = () => { onAdd(node.id, 'folder'); }; }}><FolderPlus />サブフォルダを追加</ContextMenuItem>
            {canEdit && <ContextMenuSeparator />}
          </>}
          {canEdit && <>
            <ContextMenuItem onSelect={() => { menuAction.current = () => { deletion?.onCancel(); setRenaming(true); }; }}><TextCursorInput />名前を変更</ContextMenuItem>
            <ContextMenuItem onSelect={() => { menuAction.current = () => { onEdit(node); }; }}><Pencil />編集</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onSelect={() => { menuAction.current = () => { onDelete(node); }; }}><Trash2 />削除</ContextMenuItem>
          </>}
        </ContextMenuContent>}
      </ContextMenu>
      {deletion?.node.id === node.id && <BookmarkDeleteConfirmation {...deletion} onCancel={() => {
        deletion.onCancel();
        row.current?.querySelector<HTMLElement>('button, a')?.focus({ preventScroll: true });
      }} />}
      {isFolder && <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        {node.children?.length
          ? <BookmarkTree nodes={node.children} expanded={expanded} searching={searching} onToggle={onToggle} onOpen={onOpen} onEdit={onEdit} onRename={onRename} onDelete={onDelete} onAdd={onAdd} deletion={deletion} drag={drag} faviconRevision={faviconRevision} depth={depth + 1} />
          : <p data-bookmark-empty-folder={node.id} className="py-2 text-xs text-muted-foreground" style={{ paddingLeft: LABEL_OFFSET + (depth + 1) * INDENT }} onDragOver={(event) => { drag?.enter(event, node.id, 'inside'); }} onDragLeave={(event) => { drag?.leave(event); }} onDrop={(event) => { drag?.drop(event, node.id, 'inside'); }}>まだ空です</p>}
      </CollapsibleContent>}
    </li>
  </Collapsible>;
}
