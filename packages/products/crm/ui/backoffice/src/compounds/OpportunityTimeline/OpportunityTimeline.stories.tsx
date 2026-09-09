import type { OpportunityTimelineEntry } from "@kikos/crm-contracts";
import { Event, Note } from "@kikos/crm-core";
import { CrmDestinationId, CrmEventId, CrmNoteId, CrmOpportunityId, UserId } from "@kikos/effect-identity";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DateTime } from "effect";
import { OpportunityTimeline } from ".";

const opportunityId = CrmOpportunityId.Id.make("crm_opportunity_01JC0000000000000000000001");
const destinationId = CrmDestinationId.Id.make("crm_destination_01JC0000000000000000000001");
const author = UserId.Id.make("user_01JC0000000000000000000001");

const origin = DateTime.toEpochMillis(DateTime.makeUnsafe("2026-08-10T09:00:00.000Z"));

const at = (hours: number) => DateTime.makeUnsafe(origin + hours * 3600000);

const eventEntry = (
  seed: number,
  kind: Event.Kind,
  payload: Event.Event["payload"],
  hours: number,
): OpportunityTimelineEntry => ({
  kind: "event",
  at: at(hours),
  event: new Event.Event({
    id: CrmEventId.Id.make(`crm_event_01JC00000000000000000000${String(seed).padStart(2, "0")}`),
    kind,
    opportunityId,
    destinationId,
    actorUserId: author,
    payload,
    createdAt: at(hours),
    updatedAt: at(hours),
  }),
});

const noteEntry = (seed: number, body: string, hours: number): OpportunityTimelineEntry => ({
  kind: "note",
  at: at(hours),
  note: new Note.OnOpportunity({
    id: CrmNoteId.Id.make(`crm_note_01JC00000000000000000000${String(seed).padStart(2, "0")}`),
    opportunityId,
    body,
    authorId: author,
    createdAt: at(hours),
    updatedAt: at(hours),
  }),
});

const timeline: ReadonlyArray<OpportunityTimelineEntry> = [
  eventEntry(1, "created", { source: "rd_station" }, 0),
  eventEntry(2, "placed", { destination: "Comercial Norte" }, 2),
  noteEntry(1, "Pediu proposta para 12 esteiras e 6 bikes.", 4),
  eventEntry(3, "reclaimed", { reason: "Prazo de primeiro contato expirado." }, 28),
  noteEntry(2, "Ligou perguntando se alguém ia retornar.", 30),
];

const meta = {
  title: "Compounds/OpportunityTimeline",
  component: OpportunityTimeline,
  decorators: [
    (Story: () => React.ReactElement) => (
      <div className="w-[32rem]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OpportunityTimeline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Full: Story = {
  args: { opportunityId, timeline },
};

export const Empty: Story = {
  args: { opportunityId, timeline: [] },
};
