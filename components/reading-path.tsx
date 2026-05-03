'use client';

import Link from 'next/link';
import { useReadState } from '@/components/use-read-state';
import { readingPath } from '@/lib/reading-path';
import { ArrowRight, Check, Lock, RotateCcw } from 'lucide-react';

export function ReadingPath() {
  const { mounted, isRead, toggle, reset, pathRead, pathTotal } = useReadState();
  const progress = mounted ? Math.round((pathRead / pathTotal) * 100) : 0;
  const nextStep = mounted ? readingPath.find((s) => !isRead(s.slug)) : null;

  return (
    <section className="flex flex-col gap-8">
      {/* Header + progress bar */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Recommended Reading Path
            </h2>
            <p className="mt-1 text-sm text-fd-muted-foreground">
              {pathTotal} hand-picked technologies in the order most useful for HLD
              interviews. Tick them off as you go — your progress saves automatically.
            </p>
          </div>
          {mounted && pathRead > 0 && (
            <button
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-md border border-fd-border bg-fd-card px-3 py-1.5 text-xs font-medium text-fd-muted-foreground transition hover:bg-fd-accent hover:text-fd-foreground"
            >
              <RotateCcw className="size-3.5" /> Reset progress
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="flex flex-col gap-2 rounded-lg border border-fd-border bg-fd-card p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {mounted ? `${pathRead} of ${pathTotal} read` : `0 of ${pathTotal} read`}
            </span>
            <span className="text-fd-muted-foreground">{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-fd-muted">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          {mounted && nextStep && (
            <Link
              href={nextStep.href}
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-fd-primary hover:underline"
            >
              Continue with <strong>{nextStep.title}</strong>
              <ArrowRight className="size-4" />
            </Link>
          )}
          {mounted && !nextStep && (
            <p className="mt-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              🎉 You&rsquo;ve completed the reading path. Great work!
            </p>
          )}
        </div>
      </div>

      {/* Timeline */}
      <ol className="relative flex flex-col gap-3">
        {/* The vertical connector line */}
        <div className="pointer-events-none absolute left-[15px] top-2 bottom-2 w-px bg-fd-border" />
        {readingPath.map((step, i) => {
          const read = mounted && isRead(step.slug);
          const isNext = mounted && nextStep?.slug === step.slug;
          return (
            <li key={step.slug} className="relative flex items-start gap-4 pl-0">
              {/* Step indicator */}
              <button
                type="button"
                onClick={() => toggle(step.slug)}
                aria-label={read ? 'Mark as unread' : 'Mark as read'}
                className={[
                  'relative z-10 mt-1 flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition',
                  read
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : isNext
                      ? 'border-fd-primary bg-fd-card text-fd-primary ring-4 ring-fd-primary/15'
                      : 'border-fd-border bg-fd-card text-fd-muted-foreground hover:border-fd-primary hover:text-fd-foreground',
                ].join(' ')}
              >
                {read ? <Check className="size-4" /> : <span>{i + 1}</span>}
              </button>

              {/* Card */}
              <Link
                href={step.href}
                className={[
                  'group flex flex-1 flex-col gap-1 rounded-lg border bg-fd-card p-4 transition',
                  read
                    ? 'border-emerald-500/30 hover:bg-fd-accent'
                    : isNext
                      ? 'border-fd-primary/40 bg-fd-primary/5 hover:bg-fd-primary/10'
                      : 'border-fd-border hover:border-fd-primary/40 hover:bg-fd-accent',
                ].join(' ')}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold tracking-tight">
                      {step.title}
                    </span>
                    <span className="rounded-full border border-fd-border bg-fd-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-fd-muted-foreground">
                      {step.category}
                    </span>
                    {isNext && (
                      <span className="rounded-full bg-fd-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fd-primary-foreground">
                        Up Next
                      </span>
                    )}
                  </div>
                  <ArrowRight className="size-4 text-fd-muted-foreground opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                </div>
                <p className="text-sm text-fd-muted-foreground">{step.why}</p>
              </Link>
            </li>
          );
        })}
      </ol>

      <p className="text-center text-xs text-fd-muted-foreground">
        <Lock className="mr-1 inline size-3" /> Your progress is stored in your
        browser&rsquo;s local storage — nothing leaves your device.
      </p>
    </section>
  );
}
