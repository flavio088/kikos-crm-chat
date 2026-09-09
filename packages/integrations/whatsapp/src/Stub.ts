import { Effect, Layer, Schema } from "effect";
import {
WhatsAppError,
WhatsAppGateway,
type IWhatsAppGateway
} from "./Gateway";
import * as Model from "./Model";

/**
 * The api, stood in for.
 *
 * It exists so the crm can be built and shown before the business account is
 * verified — and it stays afterwards, because a test that reaches Meta is a
 * test that fails when Meta is slow.
 *
 * What it does not do is pretend: nothing is delivered, no phone rings. It
 * answers in the shapes the real one answers in, which is what the code under
 * it is written against.
 */
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

    /**
     * Only what this stub was handed. An unknown handle fails rather than
     * answering bytes, because that is what the api does — and code that
     * only ever sees success is code whose failure path was never run.
     */
    download: (id) =>
      Effect.suspend(() => {
        const data = uploaded.get(id);
        return data === undefined
          ? Effect.fail(new WhatsAppError({ message: `No media ${id}` }))
          : Effect.succeed(data.slice());
      }),

    templates: Effect.succeed([
      { name: "retomada_orcamento", language: "pt_BR" },
      { name: "primeiro_contato", language: "pt_BR" },
    ]),
  };
});

export const layerStub = Layer.effect(WhatsAppGateway)(makeStub);