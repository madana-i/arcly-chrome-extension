import { useState } from 'react';
import { Globe2 } from 'lucide-react';
import { displayDomain } from '@/lib/bookmarks';
import { cn } from '@/lib/utils';

export function SiteIcon({ url, className, revision = 0 }: { url: string; className?: string; revision?: number }) {
  const [failedSrc, setFailedSrc] = useState('');
  const domain = displayDomain(url);
  const src = globalThis.chrome?.runtime?.id && /^https?:/i.test(url)
    ? `${chrome.runtime.getURL('_favicon/')}?${new URLSearchParams({ pageUrl: url, size: '32', ...(revision ? { v: String(revision) } : {}) })}`
    : '';

  return <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground', className)} aria-hidden="true">
    {src && failedSrc !== src
      ? <img src={src} alt="" width="16" height="16" className="size-4 object-contain" draggable={false} onError={() => { setFailedSrc(src); }} />
      : domain && !url.startsWith('chrome:') ? domain[0].toUpperCase() : <Globe2 className="size-3.5" />}
  </span>;
}
