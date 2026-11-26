import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Bookmark, CornerDownLeft, Layers2, LoaderCircle, Search, X } from 'lucide-react';
import { searchLauncher, type LauncherAdapter, type LauncherData, type LauncherResult } from '@/lib/launcher-search';
import { cn } from '@/lib/utils';
import { SiteIcon } from '@/components/site-icon';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

export default function Launcher({ adapter, onClose = () => { window.close(); } }: { adapter: LauncherAdapter; onClose?: () => void }) {
  const [data, setData] = useState<LauncherData>({ bookmarks: [], tabs: [] });
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [faviconRevision, setFaviconRevision] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const currentOption = useRef<HTMLButtonElement>(null);
  const pending = useRef(false);
  const allResults = useMemo(() => searchLauncher(data, query), [data, query]);
  const results = allResults.slice(0, 80);
  const index = Math.min(selected, Math.max(0, results.length - 1));

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { currentOption.current?.scrollIntoView({ block: 'nearest' }); }, [index, query]);
  useEffect(() => {
    let alive = true;
    let request = 0;
    let timer: ReturnType<typeof setTimeout>;
    let iconTimer = setTimeout(() => { if (alive) setFaviconRevision((value) => value + 1); }, 1000);
    const load = async () => {
      const current = ++request;
      try {
        const next = await adapter.load();
        if (alive && current === request) { setData(next); setError(''); }
      } catch (reason) {
        if (alive && current === request) setError(reason instanceof Error ? reason.message : '検索データを読み込めませんでした。');
      } finally { if (alive && current === request) setLoading(false); }
    };
    const unsubscribe = adapter.subscribe((scope) => {
      if (scope === 'favicons') {
        clearTimeout(iconTimer);
        iconTimer = setTimeout(() => { if (alive) setFaviconRevision((value) => value + 1); }, 250);
      } else {
        clearTimeout(timer);
        timer = setTimeout(() => { void load(); }, 80);
      }
    });
    void load();
    return () => { alive = false; unsubscribe(); clearTimeout(timer); clearTimeout(iconTimer); };
  }, [adapter, revision]);

  const open = (result: LauncherResult) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    void adapter.open(result).then(onClose).catch((reason: unknown) => {
      pending.current = false;
      setBusy(false);
      setError(reason instanceof Error ? reason.message : '開けませんでした。もう一度お試しください。');
      input.current?.focus();
    });
  };

  return <main aria-label="arcly 検索" className="flex h-full min-w-0 flex-col bg-background text-foreground" onKeyDown={(event) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === 'Escape') { event.preventDefault(); if (!busy) onClose(); }
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault(); input.current?.focus(); input.current?.select();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected(Math.min(Math.max(0, results.length - 1), Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1))));
    } else if (event.key === 'Enter' && event.target === input.current) {
      event.preventDefault();
      if (!loading && results[index]) open(results[index]);
    }
  }}>
    <header className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
      <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <Input ref={input} role="combobox" aria-label="ブックマークとすべてのタブを検索" aria-autocomplete="list" aria-expanded="true" aria-controls="launcher-results" aria-activedescendant={results[index] ? `launcher-option-${index}` : undefined} autoComplete="off" value={query} disabled={busy} placeholder="ブックマークとすべてのタブを検索…" className="h-10 min-w-0 flex-1 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent [&::-webkit-search-cancel-button]:hidden" onChange={(event) => { setQuery(event.target.value); setSelected(0); }} />
      <Button type="button" variant="ghost" size="icon-sm" aria-label="検索を閉じる" disabled={busy} onClick={onClose}><X className="size-4" /></Button>
    </header>
    {error && <Alert variant="destructive" className="m-3 w-auto shrink-0 p-3"><AlertDescription className="flex items-center gap-2 text-xs"><span className="min-w-0 flex-1 break-words">{error}</span><Button type="button" variant="ghost" size="xs" disabled={busy} onClick={() => { setLoading(true); setRevision((value) => value + 1); }}>再読み込み</Button></AlertDescription></Alert>}
    <ScrollArea className="min-h-0 flex-1 px-2 py-2">
      <div id="launcher-results" role="listbox" aria-label="検索結果" aria-busy={loading || busy}>
        {loading ? <p role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />読み込み中…</p>
          : results.length ? results.map((result, position) => <button key={result.key} ref={position === index ? currentOption : undefined} type="button" id={`launcher-option-${position}`} role="option" aria-selected={position === index} disabled={busy} tabIndex={-1} className={cn('flex min-h-14 w-full min-w-0 items-center gap-3 rounded-md px-3 py-2 text-left outline-none', position === index ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50', busy && 'opacity-60')} onMouseMove={() => { if (!busy) setSelected(position); }} onMouseDown={(event) => { event.preventDefault(); }} onClick={() => { open(result); }}>
            <SiteIcon url={result.url} revision={faviconRevision} className="size-8" />
            <span className="flex min-w-0 flex-1 flex-col gap-1"><span className="truncate text-sm font-medium">{result.title}</span><span className="truncate text-xs text-muted-foreground">{result.detail}</span></span>
            <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">{result.kind === 'tab' ? <Layers2 className="size-3" /> : <Bookmark className="size-3" />}{result.kind === 'tab' ? 'タブ' : 'ブックマーク'}</Badge>
          </button>) : <p className="px-4 py-12 text-center text-sm text-muted-foreground">{query.trim() ? '一致する項目がありません' : 'ブックマークやタブがありません'}</p>}
      </div>
    </ScrollArea>
    <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2.5 text-[10px] text-muted-foreground">
      <span className="flex items-center gap-1"><ArrowUp className="size-3" /><ArrowDown className="size-3" />選択</span><span className="flex items-center gap-1"><CornerDownLeft className="size-3" />開く</span><span>esc 閉じる</span><span className="ml-auto">{busy ? '開いています…' : loading ? 'arcly' : allResults.length > results.length ? `上位${results.length}件 / ${allResults.length}件` : `${allResults.length}件`}</span>
    </footer>
  </main>;
}
