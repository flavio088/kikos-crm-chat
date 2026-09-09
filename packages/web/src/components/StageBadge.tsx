import { Opportunity } from "@crm-chat/domain";
import { stageDescriptions } from "../lib/labels";
import { cn } from "./cn";

const tones: Record<Opportunity.Stage, string> = {
  novo: "border-neutral-600 text-neutral-300",
  em_contato: "border-sky-500 text-sky-300",
  proposta: "border-violet-500 text-violet-300",
  ganho: "border-emerald-500 text-emerald-300",
  perdido: "border-neutral-700 text-neutral-500",
};

export const StageBadge = ({ stage }: { stage: Opportunity.Stage }) => (
  <span
    title={stageDescriptions[stage]}
    className={cn(
      "inline-flex shrink-0 cursor-default items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
      tones[stage],
    )}
  >
    {Opportunity.stageLabels[stage]}
  </span>
);
