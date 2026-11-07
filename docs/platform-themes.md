# Platform light and dark themes

The moon/sun button beside Favorites switches the whole application between the existing light design and a charcoal, white and purple palette. Login, hall editor and organizer management have their own controls, including loading, error and sign-in fallback screens where the normal navigation is absent.

The theme is stored in `ticket:theme` in browser local storage. New visitors follow the system preference; an explicit choice overrides it. Changes from another tab synchronize through the storage event. A small script in the document head applies the preference before rendering; unavailable storage falls back to the system preference and does not break the page.

Shared colors live in `apps/web/src/components/theme.css`. Existing light utilities retain their appearance; explicit dark variants cover public pages, account and ticket pages, checkout/payment, delivery, quick booking, organizer tools, chats and dropdowns. The creation workspace consumes the same colors through its scoped variables. Hall grid/floor labels and analytics graphics respond to the theme while uploaded media and saved hall object/tariff colors retain their original presentation. Google sign-in uses the SDK's supported dark button theme ([Google reference](https://developers.google.com/identity/gsi/web/reference/js-reference#theme)).

## Validation

- Production web build, including TypeScript: passed.
- Repository lint: passed with the existing unused homepage `ArrowIcon` warning.
- Four tests: saved preferences before rendering, system defaults/invalid preferences, restricted storage, and dark palette contrast. Text colors pass 4.5:1 against base/card/input surfaces; white primary button labels pass 4.5:1; input boundaries pass 3:1.
- Ngrok: light/dark switching, reload persistence, route persistence, catalog calendar, creation forms, timezone search menu, preview dialog, login and its mobile control, hall canvas and its light restoration, favorites, payment pages and organizer sign-in states.
- Mobile header tested at 320px and 390px. No horizontal overflow; the new button remains beside Favorites. Creation menu stays within the 390px viewport. Temporary viewport overrides reset.
- No hydration warnings returned on the final creation page. Testing did not submit credentials, publish an event, pay an order or change draft content.

The browser had no authenticated account and no published test event. Signed-in account/organizer content and a populated live checkout received code/style coverage and build validation, but were not verified in the browser. The public event check reached its not-found state. The creation and preview checks used the existing separate unpublished fixture; the original draft context was restored afterward.

## Screenshots

- [Dark creation](event-creation-v2/browser-evidence/redesign/ngrok-dark-creation.jpg)
- [Dark mobile menu](event-creation-v2/browser-evidence/redesign/ngrok-dark-mobile.jpg)
- [Dark catalog](event-creation-v2/browser-evidence/redesign/ngrok-dark-catalog.jpg)
- [Dark login](event-creation-v2/browser-evidence/redesign/ngrok-dark-login.jpg)
- [Dark hall editor](event-creation-v2/browser-evidence/redesign/ngrok-dark-hall.jpg)
