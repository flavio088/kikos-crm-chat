import type { CrmContactId } from "@crm-chat/domain";
import { useRef, useState } from "react";
import { Button, Input, Typography } from "../components";
import { useSimulateConversationReply } from "../lib";

export const SimulateReply = ({
  contactId,
  contactName,
}: {
  contactId: CrmContactId.Id;
  contactName: string;
}) => {
  const { simulate, pending } = useSimulateConversationReply();
  const dialog = useRef<HTMLDialogElement>(null);
  const [body, setBody] = useState("Oi, pode mandar sim");
  const submittable = body.trim().length > 0 && !pending;

  return (
    <>
      <Button className="h-10 w-auto shrink-0" onClick={() => dialog.current?.showModal()}>
        Simular resposta do cliente
      </Button>
      <dialog
        ref={dialog}
        className="m-auto w-full max-w-lg rounded-sm border border-neutral-700 bg-neutral-900 p-0 text-neutral-200 backdrop:bg-black/70"
      >
        <form
          className="flex flex-col gap-4 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (!submittable) return;
            simulate({ contactId, body: body.trim() });
            dialog.current?.close();
          }}
        >
          <div className="flex flex-col gap-2">
            <Typography weight="bold">Simular resposta de {contactName}</Typography>
            <Typography color="muted" size="small">
              Com isso você simula o funcionamento do webhook que conecta o CRM ao WhatsApp. A
              mensagem entra como se a Meta tivesse chamado o servidor: cai no chat como mensagem
              do cliente e reabre a janela de 24 horas.
            </Typography>
          </div>
          <Input
            aria-label="Resposta do cliente"
            placeholder="O que o cliente responde?"
            value={body}
            disabled={pending}
            onChange={(event) => setBody(event.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button color="surface" className="w-auto" onClick={() => dialog.current?.close()}>
              Cancelar
            </Button>
            <Button type="submit" className="w-auto" disabled={!submittable}>
              {pending ? "Enviando…" : "Enviar resposta"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
};
