import type { OpportunityDetail } from "@kikos/crm-contracts";
import type { Opportunity as OpportunityRecord } from "@kikos/crm-core";
import type { CrmContactId, CrmQuotationId, CrmOpportunityId } from "@kikos/effect-identity";
import { Button, Card, Separator, Skeleton, Typography } from "@kikos/ui-backoffice";
import { AsyncResult } from "effect/unstable/reactivity";
import { DestinationName, SourceBadge } from "../../components";
import { Suspense, useState } from "react";
import {
  ContactConversation,
  CreateQuotationDialog,
  OpportunityStageBadge,
  OpportunityStatusBadge,
  OpportunityTimeline,
  SegmentBadge,
} from "../../compounds";
import { formatDate, formatDateTime, formatPhone, reclaimReason, useOpportunity, useConversation } from "../../lib";
import { DistributionPanel } from "./components";

export type OpportunityProps = {
  opportunityId: CrmOpportunityId.Id;
  onBack: () => void;
  onOpenQuotation: (quotationId: CrmQuotationId.Id) => void;
};

/** Split out because the suspense boundary has to sit above the hook. */
const ConversationPanel = ({ contactId }: { contactId: CrmContactId.Id }) => {
  const { result } = useConversation(contactId);
  return <ContactConversation contactId={contactId} detail={result.value.data} />;
};

/**
 * The two panels the right column can show, and they are tabs rather than a
 * stack: a conversation runs to dozens of messages, and below the history it
 * would push the page past where anybody scrolls.
 */
const HistoryPanel = ({
  opportunityId,
  contactId,
  timeline,
}: {
  opportunityId: CrmOpportunityId.Id;
  contactId: CrmContactId.Id;
  timeline: OpportunityDetail["timeline"];
}) => {
  const [tab, setTab] = useState<"history" | "conversation">("history");

  return (
    <section className="rounded-sm border border-neutral-700 p-6">
      <div className="mb-4 flex gap-2">
        <Button
          type="button"
          color={tab === "history" ? undefined : "surface"}
          className="w-auto px-3 py-1 text-sm"
          onClick={() => setTab("history")}
        >
          Histórico
        </Button>
        <Button
          type="button"
          color={tab === "conversation" ? undefined : "surface"}
          className="w-auto px-3 py-1 text-sm"
          onClick={() => setTab("conversation")}
        >
          Conversa
        </Button>
      </div>
      {tab === "history" ? (
        <OpportunityTimeline opportunityId={opportunityId} timeline={timeline} />
      ) : (
        <Suspense fallback={<Typography color="muted" size="small">Carregando…</Typography>}>
          <ConversationPanel contactId={contactId} />
        </Suspense>
      )}
    </section>
  );
};

const Entry = ({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) => (
  <div className="flex flex-col gap-0.5">
    <Typography color="muted" size="small" className="text-xs tracking-wide uppercase">
      {label}
    </Typography>
    <Typography size="small">{value ?? "—"}</Typography>
  </div>
);

const Placement = ({ placement }: { placement: OpportunityRecord.Placement.Any | undefined }) => {
  if (placement === undefined) {
    return (
      <Typography color="muted" size="small">
        Esta oportunidade ainda não foi encaminhada para nenhum destino.
      </Typography>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Entry label="Destino" value={<DestinationName id={placement.destinationId} />} />
      <Entry label="Colocado em" value={formatDateTime(placement.placedAt)} />
      {/*
       * `dueAt` is stamped on every placement and nothing reads it — confiscation
       * by deadline was left out of this delivery. Drawing it as "prazo" would
       * promise the store a consequence that never arrives, so the placement
       * shows what happened and not what is supposed to happen next.
       */}
      {placement.kind === "assigned" ? null : (
        <Entry label="Motivo da retomada" value={reclaimReason(placement.reason)} />
      )}
    </div>
  );
};

const Loading = () => (
  <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 md:p-10">
    <Skeleton className="h-10 w-72" />
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  </div>
);

const Failed = ({ message, onBack }: { message: string; onBack: () => void }) => (
  <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 p-10 text-center">
    <Typography color="danger">Não foi possível carregar a oportunidade.</Typography>
    <Typography color="muted" size="small">
      {message}
    </Typography>
    <Button type="button" color="surface" className="w-auto" onClick={onBack}>
      Voltar para as oportunidades
    </Button>
  </div>
);

const Detail = ({
  detail,
  onBack,
  onOpenQuotation,
}: {
  detail: OpportunityDetail;
  onBack: () => void;
  onOpenQuotation: (quotationId: CrmQuotationId.Id) => void;
}) => (
  <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 md:p-10">
    <header className="flex flex-col gap-3 border-b border-neutral-700 pb-6">
      <Button type="button" color="surface" className="w-auto self-start px-0 py-0" onClick={onBack}>
        ← Oportunidades
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Typography size="large">{detail.contact.name}</Typography>
          <OpportunityStatusBadge status={detail.status} />
          <OpportunityStageBadge stage={detail.stage} />
          <SegmentBadge segment={detail.opportunity.segment} />
          <SourceBadge source={detail.opportunity.source} />
        </div>
        {detail.placement === undefined || detail.stage === "lost" ? null : (
          <CreateQuotationDialog
            destinationId={detail.placement.destinationId}
            opportunity={{ id: detail.opportunity.id, name: detail.contact.name }}
            onCreated={(quotation) => onOpenQuotation(quotation.id)}
          />
        )}
      </div>
      {detail.contact.company === undefined ? null : (
        <Typography color="muted" size="small">
          {detail.contact.company}
        </Typography>
      )}
    </header>

    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className="flex flex-col gap-4">
        <Card.Root>
          <Card.Header>
            <Card.Title>Contato</Card.Title>
          </Card.Header>
          <Card.Content className="flex flex-col gap-3">
            <Entry label="Cargo" value={detail.contact.contactRole} />
            <Entry label="E-mail" value={detail.contact.email} />
            <Entry
              label="Telefone"
              value={detail.contact.phone === undefined ? undefined : formatPhone(detail.contact.phone)}
            />
            <Separator />
            <Entry label="UF" value={detail.contact.uf} />
            <Entry label="DDD" value={detail.contact.ddd} />
            <Entry label="Entrada" value={formatDate(detail.opportunity.createdAt)} />
            <Entry label="Página de origem" value={detail.opportunity.landingPageSlug} />
          </Card.Content>
        </Card.Root>

        <Card.Root>
          <Card.Header>
            <Card.Title>Colocação atual</Card.Title>
          </Card.Header>
          <Card.Content>
            <Placement placement={detail.placement} />
          </Card.Content>
        </Card.Root>

        <Card.Root>
          <Card.Header>
            <Card.Title>Distribuição</Card.Title>
          </Card.Header>
          <Card.Content>
            <DistributionPanel
              opportunityId={detail.opportunity.id}
              status={detail.status}
              destinationId={detail.placement?.destinationId}
              attempts={detail.distributions}
            />
          </Card.Content>
        </Card.Root>
      </aside>

      <HistoryPanel
        opportunityId={detail.opportunity.id}
        contactId={detail.contact.id}
        timeline={detail.timeline}
      />
    </div>
  </div>
);

export const Opportunity = ({ opportunityId, onBack, onOpenQuotation }: OpportunityProps) => {
  const { result } = useOpportunity(opportunityId);

  return (
    <main className="min-h-svh w-full">
      {AsyncResult.builder(result)
        .onSuccess((detail) => (
          <Detail detail={detail} onBack={onBack} onOpenQuotation={onOpenQuotation} />
        ))
        .onError((error) => <Failed message={error.message} onBack={onBack} />)
        .orElse(() => <Loading />)}
    </main>
  );
};
