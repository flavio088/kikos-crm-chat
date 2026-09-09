import { ChevronsLeftIcon, ChevronsRightIcon, InfoIcon } from "lucide-react";
import { useState } from "react";
import { Typography } from "./Typography";
import { cn } from "./cn";

export type BoardColumnTone = "default" | "won" | "lost";

const labelTones: Record<BoardColumnTone, string> = {
  default: "text-white",
  won: "text-emerald-300",
  lost: "text-neutral-400",
};

const iconButton =
  "rounded-sm p-0.5 text-neutral-500 transition-colors duration-150 hover:text-white focus-visible:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 motion-reduce:transition-none";

const dropZone = "bg-red-600/5 outline-2 -outline-offset-2 outline-dashed outline-red-600/50";

const Counter = ({ total }: { total: number }) => (
  <span className="rounded-full bg-neutral-700/50 px-2 py-0.5 text-[11px] font-medium tabular-nums text-neutral-300">
    {total}
  </span>
);

const useDropTarget = (onDrop: () => void) => {
  const [isOver, setOver] = useState(false);
  return {
    isOver,
    handlers: {
      onDragOver: (event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (!isOver) setOver(true);
      },
      onDragLeave: (event: React.DragEvent) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      },
      onDrop: (event: React.DragEvent) => {
        event.preventDefault();
        setOver(false);
        onDrop();
      },
    },
  };
};

type BoardColumnProps<Item> = {
  label: string;
  hint: string;
  tone?: BoardColumnTone;
  empty: string;
  items: ReadonlyArray<Item>;
  renderItem: (item: Item) => React.ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
  onDrop: () => void;
};

const Rail = <Item,>({ label, tone = "default", items, onToggle, onDrop }: BoardColumnProps<Item>) => {
  const { isOver, handlers } = useDropTarget(onDrop);
  return (
    <section
      aria-label={label}
      className="flex w-11 shrink-0 flex-col items-center rounded-lg bg-neutral-800/40 pt-2 pb-2"
    >
      <button
        type="button"
        aria-expanded={false}
        aria-label={`Expandir ${label}`}
        className={iconButton}
        onClick={onToggle}
      >
        <ChevronsLeftIcon aria-hidden className="size-4" />
      </button>
      <div
        {...handlers}
        className={cn(
          "mt-2 flex min-h-0 flex-1 flex-col items-center gap-3 rounded-md px-1 py-2 transition-colors duration-150 motion-reduce:transition-none",
          isOver && dropZone,
        )}
      >
        <Typography
          as="h2"
          size="small"
          weight="medium"
          className={cn("[writing-mode:vertical-rl] whitespace-nowrap", labelTones[tone])}
        >
          {label}
        </Typography>
        <Counter total={items.length} />
      </div>
    </section>
  );
};

const Expanded = <Item,>({
  label,
  hint,
  tone = "default",
  empty,
  items,
  renderItem,
  onToggle,
  onDrop,
}: BoardColumnProps<Item>) => {
  const { isOver, handlers } = useDropTarget(onDrop);
  return (
    <section aria-label={label} className="flex min-w-54 flex-1 flex-col rounded-lg bg-neutral-800/40">
      <header className="flex items-center gap-2 px-3 pt-3 pb-1">
        <Typography as="h2" size="small" weight="medium" className={cn("truncate", labelTones[tone])}>
          {label}
        </Typography>
        <span aria-label={hint} title={hint} className={iconButton}>
          <InfoIcon aria-hidden className="size-3.5" />
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Counter total={items.length} />
          {onToggle === undefined ? null : (
            <button
              type="button"
              aria-expanded
              aria-label={`Recolher ${label}`}
              className={iconButton}
              onClick={onToggle}
            >
              <ChevronsRightIcon aria-hidden className="size-4" />
            </button>
          )}
        </div>
      </header>

      <div
        {...handlers}
        className={cn(
          "no-scrollbar scroll-fade-y flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-md p-2 transition-colors duration-150 motion-reduce:transition-none",
          isOver && dropZone,
        )}
      >
        {items.length === 0 ? (
          <p className="m-auto max-w-[85%] text-center text-xs text-neutral-400">{empty}</p>
        ) : (
          items.map(renderItem)
        )}
      </div>
    </section>
  );
};

export const BoardColumn = <Item,>(props: BoardColumnProps<Item>) =>
  props.collapsed === true ? <Rail {...props} /> : <Expanded {...props} />;

export const BoardFailed = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div className="m-auto flex max-w-sm flex-col items-center gap-3 px-4 py-16 text-center">
    <Typography color="danger">Não foi possível carregar o quadro.</Typography>
    {onRetry === undefined ? null : (
      <button
        type="button"
        className="rounded-sm border border-neutral-700 px-4 py-2 text-sm hover:border-red-600 hover:text-red-500"
        onClick={onRetry}
      >
        Tentar de novo
      </button>
    )}
    <details className="text-xs text-neutral-400">
      <summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500">
        Detalhes técnicos
      </summary>
      <p className="mt-1 break-words">{message}</p>
    </details>
  </div>
);
