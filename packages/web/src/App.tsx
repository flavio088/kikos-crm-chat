import { CrmOpportunityId } from "@crm-chat/domain";
import { Schema } from "effect";
import { useSyncExternalStore } from "react";
import { Sidebar } from "./compounds/Sidebar";
import { Board } from "./scenes/Board";
import { Opportunity } from "./scenes/Opportunity";

const subscribe = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

const readHash = () => window.location.hash;

const isOpportunityId = Schema.is(CrmOpportunityId.Id);

export const goToBoard = () => {
  window.location.hash = "#/";
};

export const goToOpportunity = (id: CrmOpportunityId.Id) => {
  window.location.hash = `#/oportunidades/${id}`;
};

const Scene = ({ hash }: { hash: string }) => {
  const match = /^#\/oportunidades\/([^/]+)$/.exec(hash);
  const id = match?.[1];
  if (id !== undefined && isOpportunityId(id)) {
    return <Opportunity opportunityId={id} onBack={goToBoard} />;
  }
  return <Board onOpen={goToOpportunity} />;
};

export const App = () => {
  const hash = useSyncExternalStore(subscribe, readHash, readHash);
  return (
    <div className="grid min-h-svh w-full grid-cols-[16rem_1fr]">
      <Sidebar onOpenOpportunities={goToBoard} />
      <div className="min-w-0">
        <Scene hash={hash} />
      </div>
    </div>
  );
};
