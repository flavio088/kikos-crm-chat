const GROUPS = [
  "min-w",
  "max-w",
  "min-h",
  "max-h",
  "w",
  "h",
  "px",
  "py",
  "pt",
  "pb",
  "pl",
  "pr",
  "p",
  "rounded",
] as const;

const keyOf = (token: string) => {
  const split = token.lastIndexOf(":") + 1;
  const variant = token.slice(0, split);
  const base = token.slice(split).replace(/^-/, "");
  const group = GROUPS.find((candidate) => base.startsWith(`${candidate}-`));
  return group === undefined ? token : `${variant}${group}`;
};

export const cn = (...classes: ReadonlyArray<string | false | null | undefined>) => {
  const kept = new Map<string, string>();
  for (const token of classes.flatMap((value) => (value ? value.split(/\s+/) : []))) {
    if (token.length === 0) continue;
    const key = keyOf(token);
    kept.delete(key);
    kept.set(key, token);
  }
  return Array.from(kept.values()).join(" ");
};
