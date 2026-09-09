export const PHONE_PATTERN = /^[1-9][1-9](?:9\d{8}|[2-8]\d{7})$/;

export const normalize = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  return digits.length > 11 && digits.startsWith("55") ? digits.slice(2) : digits;
};

export const isPhone = (phone: string): boolean => PHONE_PATTERN.test(phone);
