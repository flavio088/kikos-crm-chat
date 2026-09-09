import {
  type CrmContactId,
  type CrmOpportunityId,
  Opportunity as OpportunityModel,
  type OpportunityDetail,
} from "@crm-chat/domain";
import { AsyncResult } from "effect/unstable/reactivity";
import { Suspense } from "react";
import {
  Button,
  Card,
  Message,
  Separator,
  Skeleton,
  StageBadge,
  Tabs,
  Typography,
  cn,
} from "../components";
import { ContactConversation } from "../compounds/ContactConversation";
import { OpportunityTimeline } from "../compounds/OpportunityTimeline";
import { SimulateReply } from "../compounds/SimulateReply";
import {
  dddOf,
  formatDate,
  formatPhone,
  useConversation,
  useOpportunity,
  useSetOpportunityStage,
} from "../lib";

export type OpportunityProps = {
  opportunityId: CrmOpportunityId.Id;
  onBack: () => void;
};

const ConversationPanel = ({ contactId }: { contactId: CrmContactId.Id }) => {
  const { result } = useConversation(contactId);
  return <ContactConversation contactId={contactId} detail={result.value.data} />;
};

const ConversationLoading = () => (
  <Message.Group className="flex-1 gap-4 px-6 py-4">
    <Skeleton className="h-16 w-2/3" />
    <Skeleton className="h-16 w-1/2 self-end" />
    <Skeleton className="h-16 w-3/5" />
  </Message.Group>
);

const Entry = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex flex-col gap-0.5">
    <Typography color="muted" size="small" className="text-xs tracking-wide uppercase">
      {label}
    </Typography>
    <Typography size="small">{value ?? "—"}</Typography>
  </div>
);

const StagePicker = ({ detail }: { detail: OpportunityDetail }) => {
  const { setStage, pending } = useSetOpportunityStage();
  return (
    <div className="flex flex-col gap-3">
      <Typography color="muted" size="small">
        Escolha a etapa em que esta oportunidade está.
      </Typography>
      <ul className="flex flex-wrap gap-2">
        {OpportunityModel.STAGES.map((stage) => {
          const active = detail.opportunity.stage === stage;
          return (
            <li key={stage}>
              <button
                type="button"
                aria-pressed={active}
                disabled={pending || active}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors duration-150 disabled:cursor-default motion-reduce:transition-none",
                  active
                    ? "border-red-600 bg-red-600/15 text-white"
                    : "border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:text-white disabled:opacity-60",
                )}
                onClick={() => setStage({ id: detail.opportunity.id, stage })}
              >
                {OpportunityModel.stageLabels[stage]}
              </button>
            </li>
          );
        })}
      </ul>
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
    <Button color="surface" className="w-auto" onClick={onBack}>
      Voltar para as oportunidades
    </Button>
  </div>
);

const Detail = ({ detail, onBack }: { detail: OpportunityDetail; onBack: () => void }) => (
  <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 md:p-10">
    <header className="flex flex-col gap-3 border-b border-neutral-700 pb-6">
      <Button color="surface" className="w-auto self-start px-0 py-0" onClick={onBack}>
        ← Oportunidades
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Typography size="large">{detail.contact.name}</Typography>
          <StageBadge stage={detail.opportunity.stage} />
          <span className="inline-flex shrink-0 items-center rounded-sm bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
            {detail.opportunity.title}
          </span>
        </div>
        <SimulateReply contactId={detail.contact.id} contactName={detail.contact.name} />
      </div>
      {detail.contact.company === undefined ? null : (
        <Typography color="muted" size="small">
          {detail.contact.company}
        </Typography>
      )}
    </header>

    <div className="grid grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <Card.Root className="lg:col-start-1 lg:row-start-1">
        <Card.Header>
          <Card.Title>Contato</Card.Title>
        </Card.Header>
        <Card.Content className="flex flex-col gap-3">
          <Entry label="Empresa" value={detail.contact.company} />
          <Entry label="E-mail" value={detail.contact.email} />
          <Entry
            label="Telefone"
            value={
              detail.contact.phone === undefined ? undefined : formatPhone(detail.contact.phone)
            }
          />
          <Separator />
          <Entry
            label="DDD"
            value={detail.contact.phone === undefined ? undefined : dddOf(detail.contact.phone)}
          />
          <Entry label="Entrada" value={formatDate(detail.opportunity.createdAt)} />
        </Card.Content>
      </Card.Root>

      <Card.Root className="lg:col-start-1">
        <Card.Header>
          <Card.Title>Etapa</Card.Title>
        </Card.Header>
        <Card.Content>
          <StagePicker detail={detail} />
        </Card.Content>
      </Card.Root>

      <section className="relative min-h-[28rem] rounded-sm border border-neutral-700 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <div className="flex flex-col lg:absolute lg:inset-0">
          <Tabs.Root defaultValue="conversa" className="flex min-h-0 flex-1 flex-col">
            <Tabs.List className="shrink-0 px-6 pt-4">
              <Tabs.Tab value="conversa">Conversa</Tabs.Tab>
              <Tabs.Tab value="historico">Histórico</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="conversa" className="min-h-0 flex-1 gap-0">
              <Suspense fallback={<ConversationLoading />}>
                <ConversationPanel contactId={detail.contact.id} />
              </Suspense>
            </Tabs.Panel>
            <Tabs.Panel value="historico" className="min-h-0 flex-1 gap-0">
              <OpportunityTimeline
                opportunityId={detail.opportunity.id}
                timeline={detail.timeline}
              />
            </Tabs.Panel>
          </Tabs.Root>
        </div>
      </section>
    </div>
  </div>
);

export const Opportunity = ({ opportunityId, onBack }: OpportunityProps) => {
  const { result } = useOpportunity(opportunityId);

  return (
    <main className="min-h-svh w-full">
      {AsyncResult.builder(result)
        .onSuccess((detail) => <Detail detail={detail} onBack={onBack} />)
        .onError((error) => <Failed message={error.message} onBack={onBack} />)
        .orElse(() => <Loading />)}
    </main>
  );
};
