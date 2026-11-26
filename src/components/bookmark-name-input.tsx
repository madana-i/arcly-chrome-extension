import { useEffect, useId, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface Props {
  title: string;
  onSave: (title: string) => Promise<void>;
  onClose: (restoreFocus: boolean) => void;
}

export function BookmarkNameInput({ title, onSave, onClose }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  const errorId = useId();
  const [value, setValue] = useState(title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    input.current?.focus({ preventScroll: true });
    input.current?.select();
  }, []);

  const save = async () => {
    if (saving.current) return;
    const next = value.trim();
    if (!next) {
      setError('名前を入力してください。');
      return;
    }
    if (next === title) {
      onClose(true);
      return;
    }
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      await onSave(next);
      onClose(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '名前を変更できませんでした。');
      setBusy(false);
      input.current?.focus({ preventScroll: true });
    } finally {
      saving.current = false;
    }
  };

  return <div className="min-w-0 flex-1 py-0.5">
    <div className="relative">
      <Input ref={input} aria-label="名前を変更" value={value} maxLength={500} autoComplete="off" spellCheck={false} readOnly={busy} aria-busy={busy} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} className="h-7 rounded-sm px-1 pr-6 text-xs md:text-xs" onChange={(event) => { setValue(event.target.value); setError(''); }} onBlur={() => { if (!saving.current) onClose(false); }} onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          void save();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          if (!saving.current) onClose(true);
        }
      }} />
      {busy && <LoaderCircle className="pointer-events-none absolute top-1/2 right-1.5 size-3 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />}
    </div>
    {error && <p id={errorId} role="alert" className="mt-1 text-xs break-words text-destructive">{error}</p>}
  </div>;
}
