import type { Option } from "effect";
import { Phone } from "../primitives";
import type { Contact } from "./Contact";

export type Identity = {
  readonly email: string | undefined;
  readonly phone: string | undefined;
};

const filled = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
};

export const identityOf = (input: {
  readonly email?: string | undefined;
  readonly phone?: string | undefined;
}): Identity => {
  const email = filled(input.email);
  const phone = filled(input.phone);
  const digits = phone === undefined ? undefined : Phone.normalize(phone);
  return {
    email: email === undefined ? undefined : email.toLowerCase(),
    phone: digits !== undefined && Phone.isPhone(digits) ? digits : undefined,
  };
};

export type Found = {
  readonly byEmail: Option.Option<Contact>;
  readonly byPhone: Option.Option<Contact>;
};
