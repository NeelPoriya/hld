'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { allDocSlugs, readingPath } from '@/lib/reading-path';

const STORAGE_KEY = 'hld:read-state:v1';
const EVENT = 'hld:read-state:change';

type ReadState = Record<string, true>;

function readFromStorage(): ReadState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeToStorage(state: ReadState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
  return {};
}

/**
 * Subscribe to the read-state map. Components re-render when any slug
 * is marked / unmarked anywhere in the app.
 */
export function useReadState() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // useSyncExternalStore returns the SSR snapshot on the very first client
  // render too; flip a flag once we are mounted so consumers can render
  // skeleton placeholders before hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isRead = useCallback((slug: string) => Boolean(state[slug]), [state]);

  const setRead = useCallback((slug: string, read: boolean) => {
    const current = readFromStorage();
    if (read) current[slug] = true;
    else delete current[slug];
    writeToStorage(current);
  }, []);

  const toggle = useCallback((slug: string) => {
    const current = readFromStorage();
    if (current[slug]) delete current[slug];
    else current[slug] = true;
    writeToStorage(current);
  }, []);

  const reset = useCallback(() => writeToStorage({}), []);

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
