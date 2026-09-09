import { base } from "@kikos/vitest-config/base";
import { mergeConfig } from "vitest/config";

export default mergeConfig(base, {
  test: { name: "@kikos/whatsapp", passWithNoTests: true },
});