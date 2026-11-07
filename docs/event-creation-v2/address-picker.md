# Event address search and map picker

The creation and owned editing forms use a normal address textbox with a “Show on map” button on its right. Address edits keep the existing 250-grapheme limit, validation and autosave. The existing navbar, typography, colors and map-pin icon are preserved.

Typing at least two characters starts a debounced search for the selected city and country. Results display a place name and address. City matching uses country-specific aliases (for example, Almaty/Алматы), rather than substring matching. Country restrictions apply before rendering results. Broad city/province-only geocoder results are excluded.

When the selected city has no matches, the dropdown shows a full-width “Show on map” action before suggestions from other cities in the same country. The wider search runs only after the local search finds no matches. Choosing another city's address saves both the address and the city in one draft patch; the dropdown explains the city update before selection. Failures are presented separately from an empty result.

Suggestions support arrow keys, Enter and Escape. Old requests cannot replace newer queries or results after a city/country change. The dropdown opens above the field when needed and fits between the header and fixed footer, including the mobile layout. IME composition and manual editing remain available.

The map modal no longer contains a search box or duplicate address editor. It centers on the selected city and optionally locates the current address. A map click performs reverse geocoding, fills the main address textbox and closes the modal automatically. A successful selection is autosaved. Map clicks outside the selected country are rejected. Failed lookups keep the map open and preserve the current typed address. Cancelling leaves the form unchanged.

## API setup

Configure these keys in the project-root `.env`:

```dotenv
NEXT_PUBLIC_YANDEX_MAPS_API_KEY=
NEXT_PUBLIC_YANDEX_SUGGEST_API_KEY=
YANDEX_GEOCODER_API_KEY=
```

In the [Yandex developer dashboard](https://developer.tech.yandex.ru/), use a JavaScript Maps API key for `NEXT_PUBLIC_YANDEX_MAPS_API_KEY`, a Geosuggest API key for `NEXT_PUBLIC_YANDEX_SUGGEST_API_KEY`, and a separate Geocoder API key for `YANDEX_GEOCODER_API_KEY`. The Geocoder key is server-only and is never included in the browser bundle. Restrict HTTP Referers to the deployed web origins, including `sulphate-shown-subtract.ngrok-free.dev` and `localhost` for this preview. Check product access and usage limits. Activation can take up to 15 minutes. Restart the web server afterward; production bundles require the keys during the build.

Geosuggest supplies venue-name and address autocomplete with its `countries` restriction and structured locality fields. Without a Geosuggest key, the existing Maps API geocoder provides address-only suggestions. With the separate Geocoder key configured, forward and reverse lookups go through `/api/address/geocode` to the HTTP Geocoder API. Only a capability flag is exposed to the browser; the Geocoder key remains on the server. The server sends the configured `WEB_ORIGIN` as the provider request’s `Referer` so domain-restricted Geocoder keys work. Caller-provided Referer headers are not forwarded. Without the separate key, the SDK geocoder remains the fallback. Missing/failed services leave manual entry available. Public browser keys are intentionally included in the browser bundle and require provider-side origin restrictions.

Official documentation: [Geosuggest setup](https://yandex.com/maps-api/docs/suggest-api/quickstart.html), [request parameters](https://yandex.com/maps-api/docs/suggest-api/request.html), [response fields](https://yandex.com/maps-api/docs/suggest-api/response.html), [JavaScript geocoding](https://yandex.com/dev/jsapi-v2-1/doc/en/v2-1/ref/reference/geocode).

## Map centers

The 64 curated city-selector entries have bundled map centers from [GeoNames](https://www.geonames.org/), using the cities15000 dataset downloaded on 2026-10-07 under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Russian, English and Kazakh aliases resolve to the same country-specific center. Custom city names use Yandex geocoding. These centers only position the viewport; they never represent a selected venue. Initial lookup responses cannot recenter the map after a newer click.

## Verification — 8 October 2026

- Web TypeScript, targeted lint and whitespace checks passed.
- Eleven unit tests cover SDK retry, city aliases/centers, country filtering, fallback, deduplication, cancellation, quota errors, Geosuggest parameters/venue names and reverse-geocoding metadata.
- Thirty-two mocked browser checks cover real form interactions, keyboard selection, atomic city/address autosave, stale responses, error handling, map clicks, cancellation, character limits, manual clearing, 1157/768/390px viewports, footer visibility and dark mode. Zero browser runtime errors. All draft endpoints were mocked; no tester records were created or modified.
- The real ngrok preview displays the Yandex map with the duplicate fields removed. Address lookup returns HTTP 403 with invalid credentials from Yandex. The Geosuggest key is not configured. The user will configure keys later, so successful live suggestions and reverse-geocoding remain pending.

Browser runner: `verify-address-search.mjs`; sanitized reports: `address-search-validation.json` and `address-search-live-validation.json`. Screenshots and full mocked patch evidence are in `/private/tmp/ticket-address-browser`; live preview evidence is in `/private/tmp/ticket-address-live`.

For the browser runner, set `PLAYWRIGHT_MODULE` to the installed Playwright module if it is not on the normal module path. Optional `ADDRESS_TEST_URL` defaults to `http://localhost:3000`; `ADDRESS_LIVE_MAP=1` uses real Yandex services while still mocking every draft endpoint.

## Separate Geocoder key integration — 9 October 2026

The user has obtained Geocoder and Geosuggest API keys. Add them to the root `.env` using the variable names above, retaining the existing JavaScript Maps key. The new server route validates request lengths, result limits and coordinate bounds, converts latitude/longitude order, and returns only place data or sanitized provider errors. The browser adapter preserves the existing city filtering and map-click behavior. Sixteen unit tests, TypeScript and targeted lint passed; live activation still awaits saving the keys and restarting the web server.

## Preview restart with saved keys — 9 October 2026

The website was restarted on port 3000 after the user saved all three keys. The ngrok homepage returns HTTP 200. Real Geosuggest requests return HTTP 200 and city-filtered address suggestions are displayed. The Yandex map loads, with no browser runtime errors. The separate Geocoder provider returns HTTP 403 (invalid credentials) on both documented v1 and compatibility 1.x endpoints; map-click autofill remains unavailable until the key is accepted by Yandex. No key values were logged or added to tracked files. Verification used mocked draft endpoints and did not modify tester records.

## Referer restriction resolved — 9 October 2026

The screenshot confirmed that the Geocoder key was restricted by HTTP Referer. Sending the configured preview origin directly to the provider returned HTTP 200. The earlier 403 response was caused by the server integration omitting that header, rather than an invalid key. The server route now includes `Referer` from `WEB_ORIGIN` (falling back to its own request origin). No dashboard restrictions or key values were changed. Real Geosuggest and Geocoder requests through ngrok return HTTP 200. Four live browser checks verified address suggestions, map loading, duplicate-field removal and automatic map-click filling of the main address input. All 17 unit tests and 32 mocked browser checks passed, along with TypeScript, targeted lint and whitespace checks. Live verification used mocked drafts and did not change tester records.
