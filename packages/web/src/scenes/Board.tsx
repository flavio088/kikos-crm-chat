import { type CrmOpportunityId, Opportunity, type OpportunityCard } from "@crm-chat/domain";
import { AsyncResult } from "effect/unstable/reactivity";
import { InfoIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { BoardColumn, BoardFailed, Skeleton, Typography } from "../components";
import { OpportunityCard as Card } from "../compounds/OpportunityCard";
import {
  emptyColumnMessages,
  stageColumnHints,
  stageColumnLabels,
  useCollapsedColumns,
  useOpportunityBoard,
  useSetOpportunityStage,
} from "../lib";

const isTerminal = (stage: Opportunity.Stage) => stage === "ganho" || stage === "perdido";

const toneOf = (stage: Opportunity.Stage) =>
  stage === "ganho" ? "won" : stage === "perdido" ? "lost" : "default";

const Columns = ({
  cards,
  onOpen,
}: {
  cards: ReadonlyArray<OpportunityCard>;
  onOpen: (id: CrmOpportunityId.Id) => void;
}) => {
  const [moves, setMoves] = useState<ReadonlyMap<CrmOpportunityId.Id, Opportunity.Stage>>(new Map());
  const [dragging, setDragging] = useState<CrmOpportunityId.Id | undefined>(undefined);
  const { setStage, pending } = useSetOpportunityStage();
  const { ref, collapsed, toggle } = useCollapsedColumns("oportunidades", Opportunity.STAGES, isTerminal);

  useEffect(() => setMoves(new Map()), [cards]);

  const columnOf = (card: OpportunityCard) => moves.get(card.opportunity.id) ?? card.opportunity.stage;

  const drop = (stage: Opportunity.Stage) => {
    const id = dragging;
    setDragging(undefined);
    if (id === undefined || pending) return;
    const card = cards.find((one) => one.opportunity.id === id);
    if (card === undefined || columnOf(card) === stage) return;
    setMoves((held) => new Map(held).set(id, stage));
    setStage({ id, stage });
  };

  return (
    <div ref={ref} className="scroll-fade-x flex min-h-0 flex-1 gap-4 overflow-x-auto">
      {Opportunity.STAGES.map((stage) => (
        <BoardColumn
          key={stage}
          label={stageColumnLabels[stage]}
          hint={stageColumnHints[stage]}
          tone={toneOf(stage)}
          empty={emptyColumnMessages[stage]}
          items={cards.filter((card) => columnOf(card) === stage)}
          collapsed={collapsed(stage)}
          onToggle={() => toggle(stage)}
          onDrop={() => drop(stage)}
          renderItem={(card) => (
            <Card
              key={card.opportunity.id}
              card={card}
              draggable
              dimmed={dragging === card.opportunity.id}
              onOpen={() => onOpen(card.opportunity.id)}
              onDragStart={() => setDragging(card.opportunity.id)}
              onDragEnd={() => setDragging(undefined)}
            />
          )}
        />
      ))}
    </div>
  );
};

const ColumnsSkeleton = () => (
  <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto">
    {Opportunity.STAGES.map((stage) => (
      <div key={stage} className="flex min-w-54 flex-1 flex-col gap-2 rounded-lg bg-neutral-800/40 p-2">
        <div className="flex items-center gap-2 px-1 pt-1 pb-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="ml-auto h-4 w-8 rounded-full" />
        </div>
        <Skeleton className="h-24 w-full rounded-md" />
        <Skeleton className="h-24 w-full rounded-md" />
      </div>
    ))}
  </div>
);

export const Board = ({ onOpen }: { onOpen: (id: CrmOpportunityId.Id) => void }) => {
  const { result } = useOpportunityBoard();

  return (
    <main className="flex h-svh w-full flex-col p-6 md:p-10">
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-700 pb-6">
          <div className="flex flex-col gap-1">
            <Typography as="h1" size="large">
              Oportunidades
            </Typography>
            <Typography color="muted" size="small">
              Todas as lojas
            </Typography>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex min-h-4 items-center gap-1.5 text-neutral-500">
            <InfoIcon aria-hidden className="size-3.5 shrink-0" />
            <Typography color="muted" size="small" className="text-xs">
              Arraste um card para mudar a etapa. Ganhas e Perdidas acumulam o histórico.
            </Typography>
          </div>
          {AsyncResult.builder(result)
            .onSuccess((cards) => <Columns cards={cards} onOpen={onOpen} />)
            .onError((error) => (
              <BoardFailed message={error.message} onRetry={() => window.location.reload()} />
            ))
            .orElse(() => (
              <ColumnsSkeleton />
            ))}
        </div>
      </div>
    </main>
  );
};
