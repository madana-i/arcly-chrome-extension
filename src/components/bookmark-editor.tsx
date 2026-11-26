import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, LoaderCircle } from 'lucide-react';
import type { BookmarkInput, BookmarkNode, TabItem } from '@/types';
import { getFolderOptions, normalizeWebUrl } from '@/lib/bookmarks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface BookmarkEditorState {
  kind: 'bookmark' | 'folder';
  node?: BookmarkNode;
  parentId?: string;
}

interface Props {
  editor: BookmarkEditorState;
  bookmarks: BookmarkNode[];
  activeTab?: TabItem;
  onClose: () => void;
  onSave: (input: BookmarkInput, id?: string) => Promise<void>;
}

export function BookmarkEditor({ editor, bookmarks, activeTab, onClose, onSave }: Props) {
  const nameInput = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const fieldId = useId();
  const folder = editor.kind === 'folder';
  const options = getFolderOptions(bookmarks, folder ? editor.node?.id : undefined);
  const [title, setTitle] = useState(editor.node?.title ?? (!folder ? activeTab?.title ?? '' : ''));
  const [url, setUrl] = useState(editor.node?.url ?? (!folder && /^https?:/.test(activeTab?.url ?? '') ? activeTab!.url : ''));
  const [parentId, setParentId] = useState(editor.parentId ?? editor.node?.parentId ?? options[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const heading = `${folder ? 'フォルダ' : 'ブックマーク'}を${editor.node ? '編集' : '追加'}`;

  useEffect(() => {
    nameInput.current?.focus();
    nameInput.current?.select();
  }, []);

  return <section className="col-start-1 row-start-1 flex min-h-0 min-w-0 flex-col" aria-labelledby={`${fieldId}-heading`} onKeyDown={(event) => {
    if (event.defaultPrevented || busy || (event.target as HTMLElement).closest('[role="listbox"]')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      form.current?.requestSubmit();
    }
  }}>
    <header className="flex shrink-0 items-center gap-2 border-b pb-3">
      <Button type="button" variant="ghost" size="icon-sm" aria-label="一覧に戻る" disabled={busy} onClick={onClose}><ArrowLeft className="size-4" /></Button>
      <h1 id={`${fieldId}-heading`} className="min-w-0 truncate text-sm font-semibold">{heading}</h1>
    </header>
    <form ref={form} className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={heading} aria-busy={busy} onSubmit={(event) => {
      event.preventDefault();
      if (busy) return;
      setError('');
      void (async () => {
        try {
          if (!title.trim()) throw new Error('名前を入力してください。');
          if (!options.some((option) => option.id === parentId)) throw new Error('保存先フォルダを選択してください。');
          const normalized = folder ? undefined : editor.node?.url === url.trim() ? url.trim() : normalizeWebUrl(url);
          setBusy(true);
          await onSave({ title: title.trim(), url: normalized, parentId }, editor.node?.id);
          onClose();
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : '保存できませんでした。');
          setBusy(false);
        }
      })();
    }}>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid min-w-0 gap-5 px-1 py-5 pr-3">
          <div className="grid gap-2"><Label htmlFor={`${fieldId}-title`} className="text-xs">名前</Label><Input ref={nameInput} id={`${fieldId}-title`} name="title" value={title} maxLength={500} autoComplete="off" required disabled={busy} onChange={(event) => { setTitle(event.target.value); }} /></div>
          {!folder && <div className="grid gap-2"><Label htmlFor={`${fieldId}-url`} className="text-xs">URL</Label><Input id={`${fieldId}-url`} name="url" value={url} placeholder="https://example.com" inputMode="url" autoComplete="off" required disabled={busy} aria-invalid={!!error} aria-describedby={error ? `${fieldId}-error` : undefined} onChange={(event) => { setUrl(event.target.value); }} /></div>}
          <div className="grid min-w-0 gap-2"><Label htmlFor={`${fieldId}-parent`} className="text-xs">保存先</Label><Select value={parentId} onValueChange={setParentId} disabled={busy || !options.length}>
            <SelectTrigger id={`${fieldId}-parent`} className="w-full min-w-0" title={options.find((option) => option.id === parentId)?.label}><SelectValue className="min-w-0 flex-1 text-left" placeholder="保存先を選択" /></SelectTrigger>
            <SelectContent position="popper" className="max-w-[calc(100vw-3rem)]" onEscapeKeyDown={(event) => { event.stopPropagation(); }}>{options.map((option) => <SelectItem key={option.id} value={option.id} className="text-xs" title={option.label}>{option.label}</SelectItem>)}</SelectContent>
          </Select></div>
          {error && <Alert variant="destructive" id={`${fieldId}-error`} className="p-3"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}
          <footer className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>キャンセル</Button>
            <Button type="submit" disabled={busy || !options.length}>{busy && <LoaderCircle className="size-3.5 animate-spin" />}{busy ? '保存中…' : editor.node ? '保存する' : '追加する'}</Button>
          </footer>
        </div>
      </ScrollArea>
    </form>
  </section>;
}
