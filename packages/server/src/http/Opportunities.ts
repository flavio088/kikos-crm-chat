import { CrmApi, File as PrimitiveFile } from "@crm-chat/domain";
import { Effect, FileSystem, Schema } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { CrmConflictError, CrmForbiddenError, CrmNotFoundError } from "../services/errors";
import { CrmOpportunityError, CrmOpportunityService } from "../services/Opportunity";
import { currentCrmActor, mapScopedError, mapScopedResponse } from "./internal";

const isServiceFailure = (error: unknown) =>
  error instanceof CrmOpportunityError ||
  error instanceof CrmNotFoundError ||
  error instanceof CrmForbiddenError ||
  error instanceof CrmConflictError;

const uploadFailure = (error: unknown) =>
  isServiceFailure(error)
    ? error
    : error instanceof Schema.SchemaError
      ? new CrmConflictError({
          reason: "media_type_not_accepted",
          message: "Formato não aceito. Envie PDF, JPG, PNG ou WebP",
        })
      : new CrmOpportunityError({ message: "Não foi possível ler o arquivo enviado" });

const attachmentDisposition = (filename: string) =>
  `attachment; filename*=UTF-8''${encodeURIComponent(filename).replaceAll("'", "%27")}`;

export const CrmOpportunityHttpHandlers = HttpApiBuilder.group(
  CrmApi,
  "crmOpportunities",
  Effect.fn("CrmOpportunityHttpHandlers")(function* (handlers) {
    const opportunities = yield* CrmOpportunityService;

    return handlers
      .handle("board", () =>
        currentCrmActor.pipe(
          Effect.flatMap((actor) => opportunities.board(actor)),
          mapScopedResponse,
        ),
      )
      .handle("get", ({ params }) =>
        currentCrmActor.pipe(
          Effect.flatMap((actor) => opportunities.detail(actor, params.id)),
          mapScopedResponse,
        ),
      )
      .handle("setStage", ({ params, payload }) =>
        currentCrmActor.pipe(
          Effect.flatMap((actor) => opportunities.setStage(actor, params.id, payload.stage)),
          mapScopedResponse,
        ),
      )
      .handle("addNote", ({ params, payload }) =>
        currentCrmActor.pipe(
          Effect.flatMap((actor) => opportunities.addNote(actor, params.id, payload.body)),
          mapScopedResponse,
        ),
      )
      .handle("attachFile", ({ params, payload }) =>
        Effect.gen(function* () {
          const actor = yield* currentCrmActor;
          const fileSystem = yield* FileSystem.FileSystem;
          const data = yield* fileSystem.readFile(payload.file.path);
          const content = yield* Schema.decodeUnknownEffect(PrimitiveFile.File)({
            mediaType: payload.file.contentType,
            data,
          });
          return yield* opportunities.attachFile(actor, params.id, {
            filename: payload.file.name,
            content,
          });
        }).pipe(Effect.mapError(uploadFailure), mapScopedResponse),
      )
      .handle("fileContent", ({ params }) =>
        currentCrmActor.pipe(
          Effect.flatMap((actor) => opportunities.fileContent(actor, params.id, params.fileId)),
          Effect.map(({ file, data }) =>
            HttpServerResponse.uint8Array(data, {
              contentType: file.mediaType,
              headers: {
                "content-disposition": attachmentDisposition(file.filename),
                "x-content-type-options": "nosniff",
              },
            }),
          ),
          mapScopedError,
        ),
      )
      .handle("detachFile", ({ params }) =>
        currentCrmActor.pipe(
          Effect.flatMap((actor) => opportunities.detachFile(actor, params.id, params.fileId)),
          mapScopedResponse,
        ),
      );
  }),
);
