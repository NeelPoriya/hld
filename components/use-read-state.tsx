'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { allDocSlugs, readingPath } from '@/lib/reading-path';

const STORAGE_KEY = 'hld:read-state:v1';
const EVENT = 'hld:read-state:change';

type ReadState = Record<string, true>;

const EMPTY: ReadState = Object.freeze({}) as ReadState;

// `useSyncExternalStore` requires getSnapshot to return a STABLE reference
// when the underlying data hasn't changed. We cache the parsed object and
// only allocate a new one when the raw localStorage string differs.
let cachedRaw: string | null = null;
let cachedState: ReadState = EMPTY;

function readFromStorage(): ReadState {
  if (typeof window === 'undefined') return EMPTY;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return cachedState;
  }
  if (raw === cachedRaw) return cachedState;
  cachedRaw = raw;
  if (!raw) {
    cachedState = EMPTY;
    return cachedState;
  }
  try {
    const parsed = JSON.parse(raw);
    cachedState =
      parsed && typeof parsed === 'object' ? (parsed as ReadState) : EMPTY;
  } catch {
    cachedState = EMPTY;
  }
  return cachedState;
}

function writeToStorage(state: ReadState) {
  if (typeof window === 'undefined') return;
  try {
    const raw = JSON.stringify(state);
    window.localStorage.setItem(STORAGE_KEY, raw);
    cachedRaw = raw;
    cachedState = state;
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* quota / private mode — ignore */
  }
}

function subscribe(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

function getSnapshot(): ReadState {
  return readFromStorage();
}

function getServerSnapshot(): ReadState {
  return EMPTY;
}

/**
 * Subscribe to the read-state map. Components re-render when any slug
 * is marked / unmarked anywhere in the app (or in another tab).
 */
export function useReadState() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Avoid hydration mismatch — render the SSR snapshot until mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isRead = useCallback((slug: string) => Boolean(state[slug]), [state]);

  const setRead = useCallback((slug: string, read: boolean) => {
    const current = { ...readFromStorage() };
    if (read) current[slug] = true;
    else delete current[slug];
    writeToStorage(current);
  }, []);

  const toggle = useCallback((slug: string) => {
    const current = { ...readFromStorage() };
    if (current[slug]) delete current[slug];
    else current[slug] = true;
    writeToStorage(current);
  }, []);

  const reset = useCallback(() => writeToStorage(EMPTY), []);

  const totalRead = Object.keys(state).length;
  const pathRead = readingPath.filter((s) => state[s.slug]).length;

  return {
    mounted,
    isRead,
    setRead,
    toggle,
    reset,
    totalRead,
    pathRead,
    pathTotal: readingPath.length,
    overallTotal: allDocSlugs.length,
  };
}
