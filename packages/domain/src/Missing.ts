import { Schema } from "effect";

export const Reason = Schema.Literals(["contact_not_found", "opportunity_not_found"]);
export type Reason = Schema.Schema.Type<typeof Reason>;
