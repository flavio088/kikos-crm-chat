import { CrmApi } from "@kikos/crm-contracts";
import {
  CrmDistributionService,
  CrmForbiddenError,
  CrmNotFoundError,
  CrmOpportunityError,
  CrmOpportunityService,
  Persistance,
  Services,
  CrmConflictError,
} from "@kikos/crm-services";
import { File as PrimitiveFile } from "@kikos/primitives";
import { Effect, FileSystem, Layer, Option, Schema } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import {
  currentCrmActor,
  mapPageResponse,
  mapScopedResponse,
  mapScopedError,
} from "../internal";

export const CrmOpportunityHttpHandlers = HttpApiBuilder.group(
  CrmApi,
  "crmOpportunities",
  Effect.fn("CrmOpportunityHttpHandlers")(function* (handlers) {
    const opportunities = yield* CrmOpportunityService;
    const distribution = yield* CrmDistributionService;
    const files = yield* Persistance.OpportunityFilePersistence.Repository;
    const contents =
      yield* Persistance.OpportunityFileContentPersistence.Repository;
    /**
     * Both writes answer with the refreshed aggregate, the way `addNote` does:
     * where the lead ended up, the status that follows from it and the attempt
     * that says why are all things the screen has to redraw at once, and a
     * narrow answer would only send it straight back for the rest.
     */
    const andDetail = (
      actor: Parameters<typeof opportunities.detail>[0],
      id: Parameters<typeof opportunities.detail>[1],
    ) => opportunities.detail(actor, id);

    return handlers
      .handle("all", ({ query }) =>
        currentCrmActor.pipe(
          Effect.flatMap((actor) =>
            opportunities.list(actor, {
              segment: query.segment,
              source: query.source,
              search: query.search,
              status: query.status,
              stage: query.stage,
              destinationId: query.destinationId,
              page: query.page,
              limit: query.limit,
            }),
          ),
          mapPageResponse,
        ),
      )
      .handle("sellerTally", ({ query }) =>
        currentCrmActor.pipe(
          Effect.flatMap((actor) =>
            opportunities.sellerTally(actor, {
              destinationId: query.destinationId,
              segment: query.segment,
              source: query.source,
              search: query.search,
              status: query.status,
              stage: query.stage,
            }),
          ),
          mapScopedResponse,
        ),
      )
      .handle("board", ({ query }) =>
        currentCrmActor.pipe(
          Effect.flatMap((actor) =>
            opportunities.board(actor, query.destinationId),
          ),
          mapScopedResponse,
        ),
      )
      .handle("column", ({ query }) =>
        currentCrmActor.pipe(
          Effect.flatMap((actor) =>
            opportunities.column(actor, {
              destinationId: query.destinationId,
              stage: query.stage,
              offset: query.offset,
              limit: query.limit,
            }),
          ),
          mapScopedResponse,
        ),
      )
      .handle("get", ({ params }) =>
        currentCrmActor.pipe(
          Effect.flatMap((actor) => opportunities.detail(actor, params.id)),
          mapScopedResponse,
        ),
      )
      .handle("create", ({ payload }) =>
        currentCrmActor.pipe(
          Effect.flatMap((actor) =>
            opportunities.create(actor, {
              name: payload.name,
              company: payload.company,
              email: payload.email,
              phone: payload.phone,
              contactRole: payload.contactRole,
              segment: payload.segment,
              source: payload.source,
              uf: payload.uf,
              ddd: payload.ddd,
              landingPageSlug: payload.landingPageSlug,
              contactId: payload.contactId,
              separateOpportunity: payload.separateOpportunity ?? false,
            }),
          ),
          mapScopedResponse,
        ),
      )
      .handle("update", ({ params, payload }) =>
        currentCrmActor.pipe(
          Effect.flatMap((actor) =>
            opportunities.update(actor, params.id, {
              segment: payload.segment,
            }),
          ),
          mapScopedResponse,
        ),
      )
      .handle("stage", ({ params, payload }) =>
        currentCrmActor.pipe(
          Effect.flatMap((actor) =>
            opportunities.moveStage(actor, params.id, payload.stage),
          ),
          mapScopedResponse,
        ),
      )
      .handle("remove", ({ params }) =>
        currentCrmActor.pipe(
          Effect.flatMap((actor) => opportunities.remove(actor, params.id)),
          mapScopedResponse,
        ),
      )
      .handle("addNote", ({ params, payload }) =>
        currentCrmActor.pipe(
          Effect.flatMap((actor) =>
            opportunities.addNote(actor, params.id, payload.body),
          ),
          mapScopedResponse,
        ),
      )
      .handle("attachFile", ({ params, payload }) =>
        Effect.gen(function* () {
          const actor = yield* currentCrmActor;
          const fileSystem = yield* FileSystem.FileSystem;
          const data = yield* fileSystem.readFile(payload.file.path);
          const content = yield* Schema.decodeUnknownEffect(PrimitiveFile.File)(
            {
              mediaType: payload.file.contentType,
              data,
            },
          );
          return yield* opportunities.attachFile(actor, params.id, {
            filename: payload.file.name,
            content,
          });
        }).pipe(
          /**
           * Reading the multipart temp file and decoding it are the two
           * failures that belong to this boundary rather than to the domain: a
           * media type outside the accepted set fails the decode here, before
           * `attachFile` is reached. Both are folded into the service's own
           * error so the route answers in the same vocabulary as the ones
           * beside it.
           *
           * The message is fixed rather than the underlying one: a
           * `PlatformError` carries the temp file's path, which is
           * infrastructure detail the client has no use for.
           */
          Effect.mapError((error) =>
            error instanceof CrmOpportunityError ||
            error instanceof CrmNotFoundError ||
            error instanceof CrmForbiddenError ||
            error instanceof CrmConflictError
              ? error
              : error instanceof Schema.SchemaError
                ? new CrmConflictError({
                    reason: "media_type_not_accepted",
                    message: "Formato não aceito. Envie PDF, JPG, PNG ou WebP",
                  })
                : new CrmOpportunityError({
                    message: "Não foi possível ler o arquivo enviado",
                  }),
          ),
          mapScopedResponse,
        ),
      )
      .handle("fileContent", ({ params }) =>
        currentCrmActor.pipe(
          Effect.flatMap((actor) =>
            opportunities.fileContent(actor, params.id, params.fileId),
          ),
          Effect.map(({ file, data }) => {
            const encodedFilename = encodeURIComponent(
              file.filename,
            ).replaceAll("'", "%27");
            return HttpServerResponse.uint8Array(data, {
              contentType: file.mediaType,
              headers: {
                "content-disposition": `attachment; filename*=UTF-8''${encodedFilename}`,
                "x-content-type-options": "nosniff",
              },
            });
          }),
          mapScopedError,
        ),
      )
            /**
       * Taking an attachment back. Thin because the service settles both the
       * ability and the ownership, the same way `fileContent` does — a route
       * that had to remember either would be one refactor away from forgetting.
       */
      .handle("detachFile", ({ params }) =>
        currentCrmActor.pipe(
          Effect.flatMap((actor) => opportunities.detachFile(actor, params.id, params.fileId)),
          mapScopedResponse,
        ),
      )
      .handle("distribute", ({ params }) =>
        currentCrmActor.pipe(
          Effect.flatMap((actor) =>
            distribution
              .redistribute(actor, params.id)
              .pipe(Effect.flatMap(() => andDetail(actor, params.id))),
          ),
          mapScopedResponse,
        ),
      )
      .handle("placement", ({ params, payload }) =>
        currentCrmActor.pipe(
          Effect.flatMap((actor) =>
            distribution
              .place(actor, {
                opportunityId: params.id,
                destinationId: payload.destinationId,
                userId: payload.userId,
              })
              .pipe(Effect.flatMap(() => andDetail(actor, params.id))),
          ),
          mapScopedResponse,
        ),
      );
  }),
);

export const LiveCrmOpportunityApiGroup = CrmOpportunityHttpHandlers.pipe(
  Layer.provide(Services.live),
  Layer.provide(Persistance.layerSql),
);

export const MemoryCrmOpportunityApiGroup = CrmOpportunityHttpHandlers.pipe(
  Layer.provide(Services.liveWithoutErpSync),
  Layer.provide(Persistance.layerMemory),
);
