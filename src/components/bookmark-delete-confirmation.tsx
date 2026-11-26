import { useEffect, useId, useRef, useState } from 'react';
import { LoaderCircle, Trash2 } from 'lucide-react';
import type { BookmarkNode } from '@/types';
import { countBookmarks } from '@/lib/bookmarks';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export interface BookmarkDeletion {
  node: BookmarkNode;
  onCancel: () => void;
  onDelete: (id: string) => Promise<void>;
}

export function BookmarkDeleteConfirmation({ node, onCancel, onDelete }: BookmarkDeletion) {
  const cancel = useRef<HTMLButtonElement>(null);
  const confirmation = useRef<HTMLElement>(null);
  const headingId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const descendants = countBookmarks(node.children ?? []);

  useEffect(() => {
    confirmation.current?.scrollIntoView({ block: 'nearest' });
    cancel.current?.focus({ preventScroll: true });
  }, []);

  return <section ref={confirmation} data-bookmark-delete-confirmation="" aria-labelledby={headingId} aria-busy={busy} className="my-1 space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-3" onKeyDown={(event) => {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault();
      onCancel();
    }
  }}>
    <h3 id={headingId} className="flex items-start gap-2 text-xs font-medium leading-relaxed"><Trash2 className="mt-0.5 size-3.5 shrink-0 text-destructive" /><span className="min-w-0 break-all">「{node.title || (node.url ? '無題のブックマーク' : '無題のフォルダ')}」を削除しますか？</span></h3>
    <p className="text-xs leading-relaxed text-muted-foreground">
      {!node.url ? `中にある${descendants}件のブックマークとサブフォルダも削除されます。` : 'Chromeのブックマークからも削除されます。'}この操作は取り消せません。
    </p>
    {error && <Alert variant="destructive" className="p-3"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}
    <div className="grid grid-cols-2 gap-2"><Button ref={cancel} type="button" variant="outline" size="sm" disabled={busy} onClick={onCancel}>キャンセル</Button><Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => {
      if (busy) return;
      setError('');
      setBusy(true);
      void onDelete(node.id).catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : '削除できませんでした。');
        setBusy(false);
      });
    }}>{busy && <LoaderCircle className="size-3.5 animate-spin" />}{busy ? '削除中…' : '削除する'}</Button></div>
  </section>;
}
