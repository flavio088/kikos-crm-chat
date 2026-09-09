import { Schema } from "effect";

const isBareDigits = Schema.isPattern(/^\d+$/);
const isFullInternationalDigits = Schema.isPattern(/^\d{10,15}$/);

export const MessageId = Schema.TemplateLiteral(["wamid.", Schema.String]);
export type MessageId = typeof MessageId.Type;

export const MediaId = Schema.String.check(isBareDigits);
export type MediaId = typeof MediaId.Type;

export const WhatsAppPhone = Schema.String.check(isFullInternationalDigits);
export type WhatsAppPhone = typeof WhatsAppPhone.Type;