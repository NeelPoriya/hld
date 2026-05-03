'use client';

import { useReadState } from '@/components/use-read-state';
import { Check, Circle } from 'lucide-react';

export function MarkAsReadButton({ slug }: { slug: string }) {
  const { mounted, isRead, toggle } = useReadState();
  const read = mounted && isRead(slug);

  return (
    <button
      type="button"
      onClick={() => toggle(slug)}
      aria-pressed={read}
      title={read ? 'Marked as read — click to undo' : 'Mark this page as read'}
      className={[
        'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition',
        read
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
          : 'border-fd-border bg-fd-card text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-foreground',
      ].join(' ')}
    >
      {read ? (
        <>
          <Check className="size-3.5" /> Read
        </>
      ) : (
        <>
          <Circle className="size-3.5" /> Mark as read
        </>
      )}
    </button>
  );
}
