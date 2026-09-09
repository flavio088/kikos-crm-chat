import type { OpportunityCard as Card } from "@crm-chat/domain";
import { GripVerticalIcon } from "lucide-react";
import { WhatsAppLink, cn } from "../components";
import { formatTimeAgo } from "../lib";

const focusRing =
  "rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500";

export const OpportunityCard = ({
  card,
  draggable = false,
  dimmed = false,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  card: Card;
  draggable?: boolean;
  dimmed?: boolean;
  onOpen?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) => (
  <article
    draggable={draggable}
    onClick={onOpen}
    onDragStart={(event) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", card.opportunity.id);
      onDragStart?.();
    }}
    onDragEnd={onDragEnd}
    className={cn(
      "group flex flex-col gap-2 rounded-md border border-neutral-700/80 bg-neutral-800 p-3 shadow-sm transition-colors duration-150 motion-reduce:transition-none",
      onOpen !== undefined && "cursor-pointer hover:border-neutral-500",
      draggable && "cursor-grab active:cursor-grabbing",
      dimmed && "opacity-40",
    )}
  >
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 flex-col">
        <button
          type="button"
          title={card.contact.name}
          className={cn("truncate text-left text-sm font-medium text-white", focusRing)}
          onClick={(event) => {
            event.stopPropagation();
            onOpen?.();
          }}
        >
          {card.contact.name}
        </button>
        {card.contact.company === undefined ? null : (
          <span className="truncate text-xs text-neutral-400">{card.contact.company}</span>
        )}
      </div>
      {draggable ? (
        <span
          aria-hidden
          className="-m-1 rounded-sm p-1 text-neutral-600 transition-colors duration-150 group-hover:text-neutral-400 motion-reduce:transition-none"
        >
          <GripVerticalIcon className="size-4" />
        </span>
      ) : null}
    </div>
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-neutral-400">
      <span className="inline-flex shrink-0 items-center rounded-sm bg-neutral-700/50 px-1.5 py-0.5 text-[11px] text-neutral-300">
        {card.opportunity.title}
      </span>
    </div>
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1">
        <span className="truncate text-xs text-neutral-400">Vendedor Kikos</span>
        {card.contact.phone === undefined ? null : (
          <WhatsAppLink phone={card.contact.phone} name={card.contact.name} />
        )}
      </div>
      <span className="shrink-0 text-xs text-neutral-400">
        {formatTimeAgo(card.opportunity.updatedAt)}
      </span>
    </div>
  </article>
);
