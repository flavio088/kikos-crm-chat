import type { ConversationDetail } from "@kikos/crm-contracts";
import { Conversation } from "@kikos/crm-core";
import type { CrmContactId } from "@kikos/effect-identity";
import { Button, InputGroup, Typography } from "@kikos/ui-backoffice";
import { Send } from "lucide-react";
import { Suspense } from "react";
import { formatDateTime, useConversationDraft, useSendConversationText, useConversationTemplates } from "../../lib";

const formatFileSize = (sizeBytes: number) => {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
};

const Bubble = ({ message }: { message: Conversation.Message.Any }) => {
  const mine = message.direction === "outbound";
  return (
    <li className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[74%]">
        <div
          className={`rounded-sm px-3 py-2 ${
            mine ? "bg-red-950 text-neutral-100" : "bg-neutral-800 text-neutral-100"
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
            <span className="block text-xs text-neutral-400">
              Template: {message.templateName}
            </span>
          ) : null}
          {message.kind === "text" || message.body !== undefined ? (
            <span className="block text-sm break-words">{message.body}</span>
          ) : null}
        </div>
        <Typography
          color="muted"
          size="small"
          className={`mt-0.5 text-xs text-neutral-500 ${mine ? "text-right" : ""}`}
        >
          {formatDateTime(message.sentAt)}
          {message.readAt !== undefined ? " · lida" : message.deliveredAt !== undefined ? " · entregue" : ""}
        </Typography>
      </div>
    </li>
  );
};

const TemplatePicker = () => {
  const { result } = useConversationTemplates();
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
          <span className="inline-block rounded-sm border border-neutral-700 px-2 py-1 text-xs text-neutral-300">
            {template.name}
            <span className="ml-1 text-neutral-500">{template.language}</span>
          </span>
        </li>
      ))}
    </ul>
  );
};

const Composer = ({
  contactId,
  windowOpen,
}: {
  contactId: CrmContactId.Id;
  windowOpen: boolean;
}) => {
  const [draft, setDraft] = useConversationDraft(contactId);
  const { send, pending } = useSendConversationText();
  const empty = draft.trim() === "";

  if (!windowOpen) {
    return (
      <div className="flex flex-col gap-3 rounded-sm border border-dashed border-neutral-700 px-3 py-4">
        <Typography color="muted" size="small">
          A janela de 24 horas fechou. Só um template aprovado pode ser enviado agora.
        </Typography>
        <Suspense
          fallback={
            <Typography color="muted" size="small">
              Carregando templates…
            </Typography>
          }
        >
          <TemplatePicker />
        </Suspense>
      </div>
    );
  }

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (empty || pending) return;
        send(contactId);
      }}
    >
      <InputGroup.Root className="flex-1">
        <InputGroup.Input
          aria-label="Nova mensagem"
          placeholder="Escreva uma mensagem…"
          value={draft}
          disabled={pending}
          onChange={(event) => setDraft(event.target.value)}
        />
      </InputGroup.Root>
      <Button type="submit" className="w-auto shrink-0 px-3" disabled={empty || pending}>
        <Send className="size-4" />
      </Button>
    </form>
  );
};

export type ContactConversationProps = {
  contactId: CrmContactId.Id;
  detail: ConversationDetail;
};

export const ContactConversation = ({ contactId, detail }: ContactConversationProps) => (
  <div className="flex flex-col gap-4">
    <Typography weight="medium">Conversa</Typography>
    {detail.messages.length === 0 ? (
      <Typography color="muted" size="small">
        Nenhuma mensagem ainda.
      </Typography>
    ) : (
      <ul className="flex flex-col gap-2">
        {detail.messages.map((message) => (
          <Bubble key={message.id} message={message} />
        ))}
      </ul>
    )}
    <Composer contactId={contactId} windowOpen={detail.windowOpen} />
  </div>
);