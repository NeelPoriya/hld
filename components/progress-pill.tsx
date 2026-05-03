'use client';

import { useReadState } from '@/components/use-read-state';
import { CheckCircle2 } from 'lucide-react';

/** Compact "X of Y read" pill — used in homepage hero. */
export function ProgressPill() {
  const { mounted, totalRead, overallTotal } = useReadState();
  const percent = mounted ? Math.round((totalRead / overallTotal) * 100) : 0;

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-card px-3 py-1 text-xs font-medium text-fd-muted-foreground">
      <CheckCircle2 className="size-3.5 text-emerald-500" />
      <span>
        {mounted ? totalRead : 0} of {overallTotal} docs read
      </span>
      <span className="text-fd-muted-foreground/60">·</span>
      <span className="font-semibold text-fd-foreground">{percent}%</span>
    </div>
  );
}
