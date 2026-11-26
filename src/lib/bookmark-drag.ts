import type { BookmarkMove, BookmarkNode } from '@/types';

export const BOOKMARK_DRAG_TYPE = 'application/x-arcly-bookmark';
export const TAB_DRAG_TYPE = 'application/x-arcly-tab';

export type BookmarkDropPosition = 'before' | 'inside' | 'after';

export interface BookmarkDropTarget {
  id: string;
  position: BookmarkDropPosition;
}

function findPath(nodes: BookmarkNode[], id: string): BookmarkNode[] | null {
  for (const node of nodes) {
    if (node.id === id) return [node];
    const descendants = node.children && findPath(node.children, id);
    if (descendants) return [node, ...descendants];
  }
  return null;
}

export function getBookmarkDropPosition(isFolder: boolean, offset: number, height: number): BookmarkDropPosition {
  const ratio = offset / Math.max(height, 1);
  if (!isFolder) return ratio < 0.5 ? 'before' : 'after';
  return ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside';
}

export function resolveBookmarkInsertion(nodes: BookmarkNode[], target: BookmarkDropTarget): BookmarkMove | null {
  const targetPath = findPath(nodes, target.id);
  if (!targetPath) return null;
  const parentPath = target.position === 'inside' ? targetPath : targetPath.slice(0, -1);
  const parent = parentPath.at(-1);
  if (!parent || parent.url || parentPath.some((node) => node.managed)) return null;

  const siblings = parent.children ?? [];
  const targetIndex = siblings.findIndex((node) => node.id === target.id);
  if (target.position !== 'inside' && targetIndex < 0) return null;
  const index = target.position === 'inside' ? siblings.length : targetIndex + (target.position === 'after' ? 1 : 0);
  return { parentId: parent.id, index };
}

export function resolveBookmarkDrop(nodes: BookmarkNode[], sourceId: string, target: BookmarkDropTarget): BookmarkMove | null {
  if (sourceId === target.id) return null;
  const sourcePath = findPath(nodes, sourceId);
  if (!sourcePath || sourcePath.length < 2) return null;
  const source = sourcePath.at(-1)!;
  if (source.readOnly || sourcePath.some((node) => node.managed)) return null;
  const destination = resolveBookmarkInsertion(nodes, target);
  if (!destination || findPath([source], destination.parentId)) return null;
  const sourceParent = sourcePath.at(-2)!;
  const sourceIndex = sourceParent.children!.findIndex((node) => node.id === sourceId);
  // Chrome interprets the index before removal and adjusts forward moves itself.
  if (sourceParent.id === destination.parentId && (destination.index === sourceIndex || destination.index === sourceIndex + 1)) return null;
  return destination;
}
