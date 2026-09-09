import { MessageCircleIcon } from "lucide-react";
import { formatPhone } from "../lib/Format";

const internationalOf = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 11 && digits.startsWith("55") ? digits : `55${digits}`;
};

export const WhatsAppLink = ({ phone, name }: { phone: string; name: string }) => (
  <a
    href={`https://wa.me/${internationalOf(phone)}`}
    target="_blank"
    rel="noreferrer"
    aria-label={`WhatsApp de ${name}`}
    title={formatPhone(phone)}
    onClick={(event) => event.stopPropagation()}
    className="rounded-sm p-0.5 text-neutral-400 transition-colors duration-150 hover:text-emerald-400 focus-visible:text-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 motion-reduce:transition-none"
  >
    <MessageCircleIcon aria-hidden className="size-3.5" />
  </a>
);
