# Draft translation and private media setup

## Azure Translator setup

Creation drafts and the organizer editor use the selected server translation provider. Azure Text Translation v3 supports all six directed Russian/English/Kazakh pairs. The browser receives availability and results, never credentials. Google Basic v2 remains available when selected explicitly; there is no automatic fallback between providers.

1. In [Azure Portal](https://portal.azure.com/), search for **Translators** and select **Create**.
2. Select your Azure subscription and an existing resource group, select **Global** region, and give the resource a name such as `ticket-translator`.
3. Select **Free F0**. If F0 is unavailable, do not substitute a paid tier without deciding to do so. Microsoft allows only one free resource per subscription.
4. Review and create the resource. Complete any required terms acceptance yourself.
5. Open the resource's **Keys and Endpoint** page and copy Key 1 into the ignored root `.env` (or `.env.demo` for Docker), without sharing it in chat:

```dotenv
TRANSLATION_PROVIDER=azure
AZURE_TRANSLATOR_KEY=your-real-key
AZURE_TRANSLATOR_REGION=global
```

For a regional resource, replace `global` with its region code from Keys and Endpoint (for example `eastus`). The implementation uses Microsoft's global text-translation endpoint and sends the regional header when needed. Private/VNet-only custom endpoints are not supported by this adapter.

Restart the API process, then reload the wizard. Populate the draft's source language, select a different RU/ENG/KAZ content tab, and click **Перевести из исходного языка**. Translations are inserted and saved immediately, replacing existing text in the selected target language. No replacement checkbox or review step is required. The main-information heading, labels, placeholders, category choices, and description toolbar follow the selected content tab; the rest of the interface keeps its website language. Switching tabs shows that language’s saved text; the Translate button performs translation.

F0 includes 2 million characters per subscription month. Translation stops at the allowance until renewal or an explicit upgrade; S1 bills from the first character. Each target language consumes its own character allowance. See [Microsoft resource setup](https://learn.microsoft.com/en-us/azure/ai-services/translator/how-to/create-translator-resource), [pricing](https://azure.microsoft.com/en-us/pricing/details/translator/) and [quota FAQ](https://www.microsoft.com/en-us/translator/business/faq/).

Azure requests send credentials only in `Ocp-Apim-Subscription-Key` and, for regional resources, `Ocp-Apim-Subscription-Region`. Batches respect 1,000 strings and 50,000 characters per request for a single target language. Plain text remains plain; formatted descriptions use well-formed HTML and are wrapped in the shared rich-description envelope and sanitized by the web renderer/editor. See [Translate v3](https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/v3/translate).

## Google alternative

Set `TRANSLATION_PROVIDER=google` and `GOOGLE_TRANSLATE_API_KEY` to use the existing Basic v2 adapter. Existing deployments without a provider setting retain Google for compatibility. Never use `NEXT_PUBLIC_` credentials or commit keys.

## Shared translation behavior

| Server setting | Default | Bounds / purpose |
| --- | --- | --- |
| `TRANSLATION_TIMEOUT_MS` | 10000 | 1000–30000 per provider attempt |
| `TRANSLATION_RETRIES` | 1 | 0–2; temporary HTTP 429/5xx, network/timeouts only |
| `TRANSLATION_HOURLY_REQUESTS` | 20 | 1–100 per owner or signed anonymous-browser binding |
| `TRANSLATION_DAILY_CHARACTERS` | 100000 | 1–1000000 uncached source code points per same binding; 24-hour window |
| `TRANSLATION_CACHE_SECONDS` | 604800 | 60–604800; provider + exact source-text hash + source/target codes |

Anonymous requests without the signed browser cookie share a conservative network quota. Authorization precedes quotas/provider work. Cache entries are separate for Azure and Google and have no public enumeration endpoint. Expired entries are collected in bounded batches. Only sanitized failure codes leave the API.

Provider calls run outside database transactions. Final application checks draft revision and source/target content under the draft lock. Clicking Translate replaces existing target text directly. The replacement-permission flag and review/proposal endpoints have been removed. Source-change metadata remains compatible with existing drafts. If output exceeds a field limit, the entire insertion is rejected with `TRANSLATION_TOO_LONG`, preserving existing content without silent truncation; shorten the source text and retry. The autosave client preserves pending local edits when translated fields return.

## Verification

`azure-translation.spec.ts` tests all six language directions, global/regional authentication, mixed HTML/plain text, batching, bounded retries/timeouts, malformed response rejection, and provider selection without fallback. `packages/config/src/index.spec.ts` covers provider and region configuration. Draft database tests remain isolated and opt-in.

A successful mocked test is not a live provider check. After adding a real key, translate a short public fixture in every directed language pair, and verify the wizard on ngrok without overwriting an organizer's existing content. Do not log credentials or private event text.

## Live verification — 5 October 2026

The user-created `ticket-translator` resource in `ticket-demo` is Active, Global, and Free (F0). Its key is stored only in the ignored local `.env` with file mode 600. Local provider selection is Azure.

Live requests using the production adapter passed all six ru/en/kk directions with the public phrase “Music concert” and its Russian/Kazakh equivalents. An English-to-Russian formatted description retained its heading and bold text. No private event content was used in these provider smoke requests. Focused tests passed: 12 Azure provider tests, one formatted Google regression, four existing provider regressions, and seven config tests (24 total); 15 opt-in database tests were skipped. API build/typecheck and lint of changed source files passed. The ngrok wizard successfully translated the existing public formatting fixture from RU to KAZ, saved both title and formatted description, retained headings/lists/link formatting, and persisted the result after reload. The organizer's current draft was not edited. Evidence: `browser-evidence/redesign/ngrok-azure-translator.png`. Azure VM deployment was not performed by this setup.

## One-click translation verification — 5 October 2026

The ngrok formatting fixture (`8c3eae87-e81a-405f-bfac-83525f3ceced`) was checked in RU, ENG, and KAZ with the website language kept Russian. The main-information heading, labels, placeholders, classification options, and description toolbar followed each content tab. A manual English title was replaced immediately by clicking Translate, and the translated title and formatted description persisted after reload. A repeated KAZ translation saved directly. Neither replacement permission nor review/proposal controls were present. The organizer's current draft was not edited. Screenshot: `browser-evidence/redesign/ngrok-one-click-translation.png`.

Twenty focused API tests and eight browser-client autosave tests passed; 15 database integration tests were skipped by their opt-in guard. Shared-types and API builds, API and web typechecks, and lint of changed sources passed. The new service tests cover direct replacement, preserved rich text, atomic overlength rejection, concurrent edits, and refreshed freshness metadata when newly translated text is identical. The latter prevents an old stale marker from requiring the removed manual review workflow.

## Private media runtime

Install FFmpeg and FFprobe in the API runtime (`Dockerfile.demo` installs the distribution package). Set `MEDIA_FFMPEG_PATH` and `MEDIA_FFPROBE_PATH` if binaries are outside PATH. Missing codecs produce a failed, retryable media state with a provider-unavailable error; videos are not marked ready from MIME/extension alone. Sharp decodes images, checks dimensions, applies orientation and generates metadata-stripped WebP derivatives. FFprobe validates actual video streams/duration; FFmpeg generates a safe MP4 and poster. Gallery audio is retained for user-controlled playback; background playback stays muted and inline.

Mount an absolute private `DRAFT_MEDIA_STORAGE_DIR` in production. The demo compose configuration uses a named private volume, not a public static directory. Images default to 10 MiB, videos to 100 MiB / 60 seconds, and the aggregate draft to 250 MiB; validated environment settings can change these limits. The API streams raw uploads with a byte limit and validates actual signatures/decoding. Slots, assets and retry/delete requests remain capability scoped. Cookies are Secure/HttpOnly/SameSite=Lax and media responses are private/no-store.

Unattached assets are collected only after transactional reference checks; published links atomically mark permanent retention. Deleting a current link does not remove that marker. Order/snapshot references, publishing/published drafts and legacy references protect assets. Expired/deleted attached drafts retain assets for the recovery grace period. Cleanup claims assets before deleting files, preventing a new draft attachment during collection.

## Integration tests

Creation-draft database suites are opt-in with `EVENT_CREATION_DB_TEST=true` and refuse database names other than the locally named v2 rehearsal databases. Use `packages/database/tools/run-v2-command.mjs` with the private rehearsal connection directory and `fresh` or `legacy`; it supplies the test flags and asserts isolated identity. Supply real FFmpeg/FFprobe paths for media tests. Browser autosave tests run through `run-v2-browser-unit-tests.mjs` without a database or browser credentials. Never run migration, seed or mutation tests against the inventoried source database.
