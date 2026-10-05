import { loadTranslationEnv } from "@event-platform/config";
import type { EventLocale } from "@event-platform/shared-types";
import { AzureTranslation } from "./azure-translation.js";
import { GoogleV2Translation } from "./google-v2-translation.js";

export type TranslationConfig = ReturnType<typeof loadTranslationEnv>;

export interface TranslationProvider {
  readonly config: TranslationConfig;
  readonly configured: boolean;
  readonly cacheNamespace: string;
  translate(texts: string[], source: EventLocale, target: EventLocale): Promise<string[]>;
}

export function createTranslationProvider(config = loadTranslationEnv(), request: typeof fetch = fetch): TranslationProvider {
  return config.TRANSLATION_PROVIDER === "azure"
    ? new AzureTranslation(config, request)
    : new GoogleV2Translation(config, request);
}
