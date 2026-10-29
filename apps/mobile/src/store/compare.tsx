import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export interface CompareItem {
  key: string; // barcode or product id
  name: string;
}

interface CompareState {
  items: CompareItem[];
  has(key: string): boolean;
  toggle(item: CompareItem): void;
  clear(): void;
}

export const MAX_COMPARE = 4;
const CompareContext = createContext<CompareState | null>(null);

export function CompareProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CompareItem[]>([]);
  const value = useMemo<CompareState>(
    () => ({
      items,
      has: (key) => items.some((i) => i.key === key),
      toggle: (item) =>
        setItems((cur) =>
          cur.some((i) => i.key === item.key) ? cur.filter((i) => i.key !== item.key) : cur.length >= MAX_COMPARE ? cur : [...cur, item],
        ),
      clear: () => setItems([]),
    }),
    [items],
  );
  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export function useCompare(): CompareState {
  const ctx = useContext(CompareContext);
  if (!ctx) throw new Error('useCompare must be used inside CompareProvider');
  return ctx;
}
