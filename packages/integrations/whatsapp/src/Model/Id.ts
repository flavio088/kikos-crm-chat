import { Schema } from "effect";

/**
 * The two ids the Cloud API hands back, and they are shaped nothing alike.
 *
 * A message id is an opaque `wamid.` string — base64 over an internal
 * envelope, which Meta reserves the right to change, so nothing here reads
 * past the prefix. A media id is bare digits. Keeping them apart in the type
 * is what stops one flowing where the other is due, since both arrive as
 * `string` on the wire.
 */
export const MessageId = Schema.TemplateLiteral(["wamid.", Schema.String]);
export type MessageId = typeof MessageId.Type;

export const MediaId = Schema.String.check(Schema.isPattern(/^\d+$/));
export type MediaId = typeof MediaId.Type;

/**
 * A recipient, as the api addresses one: digits in full international form,
 * no plus and no punctuation. The crm stores phones without the country code
 * (`Phone.normalize` strips a leading `55`), so crossing this boundary is a
 * conversion in both directions rather than a copy.
 */
export const WhatsAppPhone = Schema.String.check(Schema.isPattern(/^\d{10,15}$/));
export type WhatsAppPhone = typeof WhatsAppPhone.Type;