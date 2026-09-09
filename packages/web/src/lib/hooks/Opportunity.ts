import { useAtom, useAtomSet, useAtomSuspense, useAtomValue } from "@effect/atom-react";
import type { CrmOpportunityFileId, CrmOpportunityId } from "@crm-chat/domain";
import { AsyncResult } from "effect/unstable/reactivity";
import {
  addOpportunityNoteAtom,
  detachOpportunityFileAtom,
  downloadOpportunityFileAtom,
  noteDraftAtom,
  opportunityAtom,
  opportunityBoardAtom,
  opportunityFileContentAtom,
  setOpportunityStageAtom,
  uploadOpportunityFileAtom,
} from "../atoms";

export const useOpportunityBoard = () => {
  const result = useAtomValue(opportunityBoardAtom);
  return { result };
};

export const useOpportunity = (id: CrmOpportunityId.Id) => {
  const result = useAtomValue(opportunityAtom(id));
  return { result };
};

export const useSetOpportunityStage = () => {
  const setStage = useAtomSet(setOpportunityStageAtom);
  const result = useAtomValue(setOpportunityStageAtom);
  return { setStage, pending: AsyncResult.isWaiting(result) };
};

export const useOpportunityNoteDraft = (id: CrmOpportunityId.Id) => useAtom(noteDraftAtom(id));

export const useAddOpportunityNote = () => {
  const add = useAtomSet(addOpportunityNoteAtom);
  const result = useAtomValue(addOpportunityNoteAtom);
  return { add, pending: AsyncResult.isWaiting(result) };
};

export const useUploadOpportunityFile = () => {
  const upload = useAtomSet(uploadOpportunityFileAtom);
  const result = useAtomValue(uploadOpportunityFileAtom);
  return { upload, pending: AsyncResult.isWaiting(result) };
};

export const useOpportunityFileContent = (
  opportunityId: CrmOpportunityId.Id,
  fileId: CrmOpportunityFileId.Id,
) => {
  const result = useAtomSuspense(opportunityFileContentAtom(opportunityId, fileId));
  return { result };
};

export const useDownloadOpportunityFile = () => {
  const download = useAtomSet(downloadOpportunityFileAtom);
  const result = useAtomValue(downloadOpportunityFileAtom);
  return { download, pending: AsyncResult.isWaiting(result) };
};

export const useDetachOpportunityFile = () => {
  const detach = useAtomSet(detachOpportunityFileAtom);
  const result = useAtomValue(detachOpportunityFileAtom);
  return { detach, pending: AsyncResult.isWaiting(result) };
};
