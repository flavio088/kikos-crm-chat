import { useAtom, useAtomRefresh, useAtomSet, useAtomSuspense, useAtomValue } from "@effect/atom-react";
import { useMe } from "@kikos/auth-backoffice";
import type { OpportunityCard, OpportunityCreation } from "@kikos/crm-contracts";
import { Policy, type Opportunity } from "@kikos/crm-core";
import type { CrmDestinationId, CrmOpportunityId, CrmOpportunityFileId, UserId } from "@kikos/effect-identity";
import { AsyncResult } from "effect/unstable/reactivity";
import type { CreateOpportunityInput, OpportunityQuery } from "../../Opportunity";
import {
  addOpportunityNoteAtom,
  createOpportunityAtom,
  detachOpportunityFileAtom,
  distributeOpportunityAtom,
  downloadOpportunityFileAtom,
  moveOpportunityStageAtom,
  opportunityAtom,
  opportunityBoardAtom,
  opportunityColumnAtom,
  opportunityFileContentAtom,
  opportunitiesAtom,
  noteDraftAtom,
  placeOpportunityAtom,
  uploadOpportunityFileAtom,
} from "../atoms";

export const useOpportunities = (query: OpportunityQuery) => {
  const result = useAtomValue(opportunitiesAtom(query));
  return { result };
};

export const useRefreshOpportunities = (query: OpportunityQuery) => {
  const refresh = useAtomRefresh(opportunitiesAtom(query));
  return { refresh };
};

export const useOpportunity = (id: CrmOpportunityId.Id) => {
  const result = useAtomValue(opportunityAtom(id));
  return { result };
};

export const useRefreshOpportunity = (id: CrmOpportunityId.Id) => {
  const refresh = useAtomRefresh(opportunityAtom(id));
  return { refresh };
};

export const useOpportunityBoard = (destinationId: CrmDestinationId.Id | undefined) => {
  const result = useAtomValue(opportunityBoardAtom(destinationId));
  return { result };
};

export const useRefreshOpportunityBoard = (destinationId: CrmDestinationId.Id | undefined) => {
  const refresh = useAtomRefresh(opportunityBoardAtom(destinationId));
  return { refresh };
};

export const useOpportunityColumn = () => {
  const set = useAtomSet(opportunityColumnAtom);
  const result = useAtomValue(opportunityColumnAtom);
  const load = (input: {
    readonly destinationId: CrmDestinationId.Id | undefined;
    readonly stage: Opportunity.Stage.Stage;
    readonly offset: number;
    readonly limit: number;
    readonly onLoaded: (opportunities: ReadonlyArray<OpportunityCard>) => void;
  }) => set(input);
  return {
    load,
    pending: AsyncResult.isWaiting(result),
    failed: AsyncResult.isFailure(result),
  };
};

export const useMoveOpportunityStage = () => {
  const set = useAtomSet(moveOpportunityStageAtom);
  const result = useAtomValue(moveOpportunityStageAtom);
  const move = (
    id: CrmOpportunityId.Id,
    to: Opportunity.Stage.Target,
    options: { readonly onSettled: (succeeded: boolean) => void },
  ) => set({ id, to, ...options });
  return { move, pending: AsyncResult.isWaiting(result) };
};

export const useCreateOpportunity = () => {
  const set = useAtomSet(createOpportunityAtom);
  const result = useAtomValue(createOpportunityAtom);
  const create = (
    input: CreateOpportunityInput,
    options: {
      readonly separateOpportunity: boolean;
      readonly onOutcome: (creation: OpportunityCreation) => void;
    },
  ) => set({ input, ...options });
  return { create, pending: AsyncResult.isWaiting(result) };
};

export const useOpportunityNoteDraft = (id: CrmOpportunityId.Id) => useAtom(noteDraftAtom(id));

export const useAddOpportunityNote = () => {
  const add = useAtomSet(addOpportunityNoteAtom);
  const result = useAtomValue(addOpportunityNoteAtom);
  return { add, pending: AsyncResult.isWaiting(result) };
};

export const useOpportunityFileContent = (
  opportunityId: CrmOpportunityId.Id,
  fileId: CrmOpportunityFileId.Id,
) => {
  const result = useAtomSuspense(opportunityFileContentAtom(opportunityId, fileId));
  return { result };
};

export const useUploadOpportunityFile = () => {
  const upload = useAtomSet(uploadOpportunityFileAtom);
  const result = useAtomValue(uploadOpportunityFileAtom);
  return { upload, pending: AsyncResult.isWaiting(result) };
};

export const useDownloadOpportunityFile = () => {
  const download = useAtomSet(downloadOpportunityFileAtom);
  const result = useAtomValue(downloadOpportunityFileAtom);
  return { download, pending: AsyncResult.isWaiting(result) };
};

export const useDistributeOpportunity = () => {
  const set = useAtomSet(distributeOpportunityAtom);
  const result = useAtomValue(distributeOpportunityAtom);
  return { distribute: set, pending: AsyncResult.isWaiting(result) };
};

export const usePlaceOpportunity = () => {
  const set = useAtomSet(placeOpportunityAtom);
  const result = useAtomValue(placeOpportunityAtom);
  const place = (
    id: CrmOpportunityId.Id,
    placement: { readonly destinationId: CrmDestinationId.Id; readonly userId?: UserId.Id },
  ) => set({ id, ...placement });
  return { place, pending: AsyncResult.isWaiting(result) };
};

export const useCanPlaceOpportunity = () => {
  const me = useMe();
  return AsyncResult.builder(me)
    .onSuccess(({ data }) => Policy.oversees(data.role))
    .orElse(() => false);
};

export const useDetachOpportunityFile = () => {
  const detach = useAtomSet(detachOpportunityFileAtom);
  const result = useAtomValue(detachOpportunityFileAtom);
  return { detach, pending: AsyncResult.isWaiting(result) };
};
