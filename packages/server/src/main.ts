import { createServer } from "node:http";
import { CrmApi } from "@crm-chat/domain";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Config, Effect, Layer } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Database } from "./db";
import { WhatsAppGatewayLive } from "./gateway";
import { layerSeededActor } from "./http/actor";
import {
  CrmConversationHttpHandlers,
  CrmConversationTemplateHttpHandlers,
} from "./http/Conversation";
import { CrmOpportunityHttpHandlers } from "./http/Opportunities";
import { WhatsAppWebhookHttpHandlers } from "./http/Webhook";
import * as ContactPersistence from "./persistence/Contact";
import * as ConversationPersistence from "./persistence/Conversation";
import * as ConversationMediaPersistence from "./persistence/ConversationMedia";
import * as ConversationMessagePersistence from "./persistence/ConversationMessage";
import * as OpportunityPersistence from "./persistence/Opportunity";
import * as OpportunityEventPersistence from "./persistence/OpportunityEvent";
import * as OpportunityFilePersistence from "./persistence/OpportunityFile";
import * as OpportunityFileContentPersistence from "./persistence/OpportunityFileContent";
import * as OpportunityNotePersistence from "./persistence/OpportunityNote";
import * as ConversationService from "./services/Conversation";
import * as OpportunityService from "./services/Opportunity";

const PersistenceLive = Layer.effectDiscard(Database.migrateToLatest).pipe(
  Layer.provideMerge(Database.layerFromEnv),
);

const RepositoriesLive = Layer.mergeAll(
  ContactPersistence.layerSql,
  OpportunityPersistence.layerSql,
  OpportunityEventPersistence.layerSql,
  OpportunityNotePersistence.layerSql,
  OpportunityFilePersistence.layerSql,
  OpportunityFileContentPersistence.layerSql,
  ConversationPersistence.layerSql,
  ConversationMessagePersistence.layerSql,
  ConversationMediaPersistence.layerSql,
);

const ServicesLive = Layer.mergeAll(ConversationService.layer, OpportunityService.layer).pipe(
  Layer.provide(WhatsAppGatewayLive),
);

const ApiLive = HttpApiBuilder.layer(CrmApi).pipe(
  Layer.provide(CrmOpportunityHttpHandlers),
  Layer.provide(CrmConversationHttpHandlers),
  Layer.provide(CrmConversationTemplateHttpHandlers),
  Layer.provide(WhatsAppWebhookHttpHandlers),
  Layer.provide(ServicesLive),
  Layer.provide(RepositoriesLive),
);

const CorsLive = HttpRouter.cors({
  allowedOrigins: ["http://localhost:5173"],
  allowedMethods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
});

const HealthRoute = HttpRouter.add("GET", "/health", HttpServerResponse.text("ok"));

const ServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const port = yield* Config.number("PORT").pipe(Config.withDefault(3000));
    yield* Effect.log(`API em http://localhost:${port}`);
    return NodeHttpServer.layer(createServer, { port });
  }),
);

const main = HttpRouter.serve(Layer.mergeAll(ApiLive, CorsLive, HealthRoute)).pipe(
  Layer.provide(layerSeededActor),
  Layer.provide(RepositoriesLive),
  Layer.provide(PersistenceLive),
  Layer.provide(ServerLive),
);

NodeRuntime.runMain(Layer.launch(main));
