import { Conversation, type ConversationDetail, type CrmContactId } from "@crm-chat/domain";
import { Suspense, useLayoutEffect, useRef } from "react";
import { Button, Input, Message, Typography } from "../components";
import {
  formatDateTime,
  formatFileSize,
  initialsOf,
  useConversationDraft,
  useConversationTemplates,
  useSendConversationTemplate,
  useSendConversationText,
} from "../lib";

const receiptOf = (message: Conversation.Message.Any) =>
  message.readAt !== undefined ? " · lida" : message.deliveredAt !== undefined ? " · entregue" : "";

const Bubble = ({
  message,
  contactName,
}: {
  message: Conversation.Message.Any;
  contactName: string;
}) => {
  const mine = message.direction === "outbound";
  const label = mine ? "Vendedor Kikos" : contactName;
  return (
    <Message.Root align={mine ? "end" : "start"}>
      <Message.Avatar className="size-8 text-xs text-neutral-200">{initialsOf(label)}</Message.Avatar>
      <Message.Content>
        <Message.Header>{label}</Message.Header>
        <div
          data-slot="message-body"
          className={`w-fit max-w-full rounded-sm px-3 py-2 whitespace-pre-wrap text-neutral-200 ${
            mine ? "bg-red-950" : "bg-neutral-800"
          }`}
        >
          {message.kind === "media" ? (
            <span className="block text-sm">
              {message.filename}
              <span className="block text-xs text-neutral-400">
                {formatFileSize(message.sizeBytes)}
              </span>
            </span>
          ) : null}
          {message.kind === "template" ? (
            <span className="block text-xs text-neutral-400">Template · {message.templateName}</span>
          ) : null}
          {message.body !== undefined ? (
            <span className="block text-sm break-words">{message.body}</span>
          ) : null}
        </div>
        <Message.Footer>
          {formatDateTime(message.sentAt)}
          {mine ? receiptOf(message) : ""}
        </Message.Footer>
      </Message.Content>
    </Message.Root>
  );
};

const TemplatePicker = ({
  contactId,
  contactName,
}: {
  contactId: CrmContactId.Id;
  contactName: string;
}) => {
  const { result } = useConversationTemplates();
  const { send, pending } = useSendConversationTemplate();
  const templates = result.value.data;

  if (templates.length === 0) {
    return (
      <Typography color="muted" size="small">
        Nenhum template aprovado. Cadastre um no painel da Meta para poder retomar a conversa.
      </Typography>
    );
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {templates.map((template) => (
        <li key={`${template.name}:${template.language}`}>
          <button
            type="button"
            title={template.body === "" ? `Enviar o template ${template.name}` : template.body}
            className="inline-flex cursor-pointer items-center rounded-sm border border-neutral-700 px-2 py-1 text-xs text-neutral-300 transition-colors hover:border-red-600 hover:text-white disabled:pointer-events-none disabled:opacity-60"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(`Enviar para ${contactName}?\n\n${template.body}`)) return;
              send({ contactId, name: template.name, language: template.language });
            }}
          >
            {template.name}
            <span className="ml-1 text-neutral-500">{template.language}</span>
          </button>
        </li>
      ))}
    </ul>
  );
};

const Composer = ({ contactId }: { contactId: CrmContactId.Id }) => {
  const [draft, setDraft] = useConversationDraft(contactId);
  const { send, pending } = useSendConversationText();
  const submittable = draft.trim().length > 0 && !pending;

  return (
    <form
      className="flex w-full items-center gap-2 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (submittable) send(contactId);
      }}
    >
      <Input
        className="h-10"
        aria-label="Nova mensagem"
        placeholder="Escreva uma mensagem…"
        value={draft}
        disabled={pending}
        onChange={(event) => setDraft(event.target.value)}
      />
      <Button type="submit" className="h-10 w-auto shrink-0" disabled={!submittable}>
        {pending ? "Enviando…" : "Enviar"}
      </Button>
    </form>
  );
};

const WindowClosed = ({
  contactId,
  contactName,
  awaiting,
}: {
  contactId: CrmContactId.Id;
  contactName: string;
  awaiting: Conversation.Message.Template | undefined;
}) => (
  <div className="flex flex-col gap-3 p-4">
    {awaiting === undefined ? (
      <Typography color="muted" size="small">
        A janela de 24 horas fechou. Só um template aprovado pode ser enviado agora. Escolha um
        para enviar.
      </Typography>
    ) : (
      <Typography color="muted" size="small">
        Template enviado em {formatDateTime(awaiting.sentAt)}. A conversa reabre quando{" "}
        {contactName} responder. Se precisar, envie outro template.
      </Typography>
    )}
    <Suspense
      fallback={
        <Typography color="muted" size="small">
          Carregando templates…
        </Typography>
      }
    >
      <TemplatePicker contactId={contactId} contactName={contactName} />
    </Suspense>
  </div>
);

const Messages = ({ detail }: { detail: ConversationDetail }) => {
  const container = useRef<HTMLDivElement>(null);
  const newest = detail.messages[detail.messages.length - 1]?.id;

  useLayoutEffect(() => {
    const node = container.current;
    if (node !== null) node.scrollTop = node.scrollHeight;
  }, [newest]);

  return (
    <Message.Group
      ref={container}
      className="max-h-[36rem] min-h-0 flex-1 gap-4 overflow-y-auto px-6 py-4 lg:max-h-none"
    >
      {detail.messages.length === 0 ? (
        <Typography color="muted" size="small">
          Nenhuma mensagem ainda.
        </Typography>
      ) : null}
      {detail.messages.map((message) => (
        <Bubble key={message.id} message={message} contactName={detail.contact.name} />
      ))}
    </Message.Group>
  );
};

export type ContactConversationProps = {
  contactId: CrmContactId.Id;
  detail: ConversationDetail;
};

const awaitingReplyOf = (messages: ReadonlyArray<Conversation.Message.Any>) => {
  const last = messages[messages.length - 1];
  return last !== undefined && last.direction === "outbound" && last.kind === "template"
    ? last
    : undefined;
};

export const ContactConversation = ({ contactId, detail }: ContactConversationProps) => (
  <div className="flex min-h-0 flex-1 flex-col">
    <Messages detail={detail} />
    <footer className="shrink-0 border-t border-neutral-700">
      {detail.windowOpen ? (
        <Composer contactId={contactId} />
      ) : (
        <WindowClosed
          contactId={contactId}
          contactName={detail.contact.name}
          awaiting={awaitingReplyOf(detail.messages)}
        />
      )}
    </footer>
  </div>
);
