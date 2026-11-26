import { useEffect, useId, useRef, useState } from 'react';
import { BrushCleaning, LoaderCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface Props {
  count: number;
  hasActiveTab: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

export function TabCleanupConfirmation({ count, hasActiveTab, onCancel, onConfirm }: Props) {
  const cancel = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    cancel.current?.focus({ preventScroll: true });
    cancel.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  return <section id="tab-cleanup-confirmation" aria-labelledby={headingId} aria-busy={busy} className="mb-3 space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-3" onKeyDown={(event) => {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault();
      onCancel();
    }
  }}>
    <h3 id={headingId} className="flex items-start gap-2 text-xs font-medium leading-relaxed"><BrushCleaning className="mt-0.5 size-3.5 shrink-0 text-destructive" />ほかのタブを閉じますか？</h3>
    <p className="text-xs leading-relaxed text-muted-foreground">現在のタブを残し、このウィンドウのほかの{count}件を閉じます。固定済みタブも対象です。</p>
    {error && <Alert variant="destructive" className="p-3"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}
    <div className="grid grid-cols-2 gap-2">
      <Button ref={cancel} type="button" variant="outline" size="sm" className="text-xs" disabled={busy} onClick={onCancel}>キャンセル</Button>
      <Button type="button" variant="destructive" size="sm" className="text-xs" disabled={busy || !hasActiveTab || count === 0} onClick={() => {
        if (busy || !hasActiveTab || count === 0) return;
        setError('');
        setBusy(true);
        void onConfirm().catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : 'タブを閉じられませんでした。');
          setBusy(false);
        });
      }}>{busy && <LoaderCircle className="size-3.5 animate-spin" />}{busy ? '閉じています…' : '閉じる'}</Button>
    </div>
  </section>;
}
