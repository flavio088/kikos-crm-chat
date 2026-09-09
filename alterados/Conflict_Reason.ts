import { Schema } from "effect";

/**
 * Why a write collided with standing state, as data.
 *
 * The sentence that travels beside it stays a sentence — good for a log and
 * for a reader — but it is not what a caller branches on. Reading it back was
 * the only discriminator the wire used to carry, and a reword on this side
 * silently downgraded the other side to a generic "conflito".
 *
 * Split by the call that can raise it instead of gathered in one flat list:
 * whoever handles admission owes an answer for every admission reason and for
 * none of the others, so a `Record` keyed by one of these unions is exhaustive
 * over exactly the right set — and adding a reason here stops that `Record`
 * from compiling until it gets an answer too.
 */

/** `addMember` refuses. */
export const Admission = Schema.Literals([
  "already_a_member",
  "already_selling_elsewhere",
  "no_room_after_anchor",
]);
export type Admission = Schema.Schema.Type<typeof Admission>;

/** `setRotation` refuses. */
export const Rotation = Schema.Literals(["roster_mismatch"]);
export type Rotation = Schema.Schema.Type<typeof Rotation>;

/**
 * `hire` refuses. Its own union rather than a fourth `Admission` reason: this
 * one is raised before anybody is admitted to anything, and it asks the gestor
 * for a move the three admission reasons never do — stop, and go find who
 * already owns that address. Keeping it apart is also what leaves every
 * existing `Record<Admission, …>` exhaustive over exactly the set it answers.
 */
export const Hiring = Schema.Literals(["email_already_registered"]);
export type Hiring = Schema.Schema.Type<typeof Hiring>;

/** A quotation refuses to leave the status it is in. */
export const Transition = Schema.Literals(["quotation_status_refused"]);
export type Transition = Schema.Schema.Type<typeof Transition>;

export const Stage = Schema.Literals(["opportunity_stage_refused", "opportunity_lost"]);
export type Stage = Schema.Schema.Type<typeof Stage>;
export const isStage = Schema.is(Stage);

/**
 * `createOpportunity` refuses: the e-mail answers for one contact and the
 * phone for another, so there is no one person to hang the opportunity from.
 *
 * Its own union because it asks for a move none of the others ask for — stop,
 * and decide which of the two rows is the human. The intake never raises it:
 * with nobody standing there to answer, refusing would throw the lead away, so
 * it opens the third, flagged contact instead. That asymmetry is the point of
 * keeping this separate from `ContactEdit`.
 */
export const Conversion = Schema.Literals(["contact_identity_conflict"]);
export type Conversion = Schema.Schema.Type<typeof Conversion>;

/**
 * `sendText` refuses.
 *
 * Meta allows free text only for twenty-four hours after the customer's last
 * message. Outside it, an approved template is the only thing that leaves —
 * which is a different move for whoever is at the composer, not a retry.
 */
export const Conversation = Schema.Literals(["conversation_window_closed"]);
export type Conversation = Schema.Schema.Type<typeof Conversation>;
/**
 * `updateContact` refuses: the address being written already identifies
 * somebody else.
 *
 * Two literals rather than one because the screen has to say which field to
 * fix — "este e-mail já é de outro contato" and "este telefone já é de outro
 * contato" send the person to different inputs. Merging the two contacts is
 * never the answer here: it is destructive and irreversible, and the person
 * doing the edit is rarely the person who knows.
 */
export const ContactEdit = Schema.Literals(["contact_email_taken", "contact_phone_taken"]);
export type ContactEdit = Schema.Schema.Type<typeof ContactEdit>;

/**
 * `addLocator` refuses.
 *
 * Two literals because they send whoever is at the rules screen to opposite
 * moves. The same rule twice on one store is a no-op they can ignore; a
 * landing page suffix another store already claims is a decision — one landing
 * page names one store, which is the whole point of the most specific tier,
 * so somebody has to say which store it names.
 */
export const Rules = Schema.Literals(["locator_already_here", "landing_page_taken"]);
export type Rules = Schema.Schema.Type<typeof Rules>;

/** Every reason the crm can answer a write with, which is what crosses the wire. */
export const Placement = Schema.Literals([
  "opportunity_closed",
  "destination_unavailable",
  "seller_not_in_rotation",
]);
export type Placement = Schema.Schema.Type<typeof Placement>;
export const Attachment = Schema.Literals(["media_type_not_accepted", "content_mismatch", "attachment_limit_reached",]);
export type Attachment = Schema.Schema.Type<typeof Attachment>; 

export const Reason = Schema.Union([
  Admission,
  Rotation,
  Transition,
  Stage,
  Hiring,
  Conversion,
  Conversation,
  ContactEdit,
  Rules,
  Placement,
  Attachment,
]);
export type Reason = Schema.Schema.Type<typeof Reason>;

export const isAdmission = Schema.is(Admission);
export const isRotation = Schema.is(Rotation);
export const isTransition = Schema.is(Transition);
export const isHiring = Schema.is(Hiring);
export const isConversion = Schema.is(Conversion);
export const isConversation = Schema.is(Conversation);
export const isContactEdit = Schema.is(ContactEdit);
export const isRules = Schema.is(Rules);
export const isPlacement = Schema.is(Placement);
export const isAttachment = Schema.is(Attachment);
export const isReason = Schema.is(Reason);
/**
 * `attachFile` refuses.
 *
 * Two literals because they send whoever is at the composer to different
 * moves. A media type outside the accepted set is a file to swap for another
 * one; content that does not match the type it declares is a file to
 * distrust — the extension says one thing and the bytes say another, which is
 * how an executable arrives named `foto.png`.
 */

