import { Effect, Layer, Schema } from "effect";
import {
WhatsAppError,
WhatsAppGateway,
type IWhatsAppGateway
} from "./Gateway";
import * as Model from "./Model";

const decodeMessageId = Schema.decodeUnknownSync(Model.MessageId);
const decodeMediaId = Schema.decodeUnknownSync(Model.MediaId);

export const makeStub = Effect.sync((): IWhatsAppGateway => {
  const uploaded = new Map<Model.MediaId, Uint8Array>();
  let counter = 0;

  const nextId = () => {
    counter += 1;
    return counter;
  };

  return {
    send: (_message) =>
      Effect.sync(() => decodeMessageId(`wamid.stub${nextId()}`)),

    upload: (data, _mediaType) =>
      Effect.sync(() => {
        const id = decodeMediaId(String(nextId()));
        uploaded.set(id, data.slice());
        return id;
      }),

    download: (id) =>
      Effect.suspend(() => {
        const data = uploaded.get(id);
        return data === undefined
          ? Effect.fail(new WhatsAppError({ message: `No media ${id}` }))
          : Effect.succeed(data.slice());
      }),

    approvedTemplates: Effect.succeed([
      {
        name: "retomada_orcamento",
        language: "pt_BR",
        body: "Olá! Aqui é a Kikos Fitness. Seu orçamento de equipamentos ficou pendente e ainda está de pé. Quer retomar? É só responder esta mensagem que seguimos por aqui.",
      },
      {
        name: "primeiro_contato",
        language: "pt_BR",
        body: "Olá! Aqui é a Kikos Fitness. Recebemos seu interesse em montar ou renovar a academia e queremos entender o projeto. Pode responder por aqui quando for um bom momento?",
      },
    ]),
  };
});

export const layerStub = Layer.effect(WhatsAppGateway)(makeStub);