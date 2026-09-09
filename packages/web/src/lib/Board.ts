import { useLayoutEffect, useRef, useState } from "react";

export const COLUMN_MIN_WIDTH = 216;
export const COLUMN_GAP = 16;

type Overrides = Readonly<Record<string, boolean>>;

const storageKey = (board: string) => `crm.board.${board}.collapsed`;

const readOverrides = (board: string): Overrides => {
  try {
    const raw = window.localStorage.getItem(storageKey(board));
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
      ),
    );
  } catch {
    return {};
  }
};

const writeOverrides = (board: string, overrides: Overrides) => {
  try {
    window.localStorage.setItem(storageKey(board), JSON.stringify(overrides));
  } catch {
    return;
  }
};

export const fitsColumns = (width: number, count: number) =>
  width >= count * COLUMN_MIN_WIDTH + (count - 1) * COLUMN_GAP;

export const useCollapsedColumns = <Column extends string>(
  board: string,
  columns: ReadonlyArray<Column>,
  terminal: (column: Column) => boolean,
) => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | undefined>(undefined);
  const [overrides, setOverrides] = useState<Overrides>(() => readOverrides(board));

  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null) return;
    setWidth(node.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry !== undefined) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fits = width === undefined ? true : fitsColumns(width, columns.length);

  const defaultOf = (column: Column) => !fits && terminal(column);

  const collapsed = (column: Column) => overrides[column] ?? defaultOf(column);

  const toggle = (column: Column) =>
    setOverrides((held) => {
      const next = { ...held, [column]: !(held[column] ?? defaultOf(column)) };
      writeOverrides(board, next);
      return next;
    });

  return { ref, collapsed, toggle };
};
