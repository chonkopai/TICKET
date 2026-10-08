"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { graphemeLength, type EventLocale } from "@event-platform/shared-types";
import { cityAddressQuery, geocodeAddress, loadYandexMaps, type MapCoordinates, type YandexMap } from "../../lib/yandex-maps";
import { addressFromGeocoder, sameAddressCity, searchAddressSuggestions, type AddressSearchResult, type AddressSuggestion } from "../../lib/address-search";
import { cityMapCenter } from "../../lib/city-map-centers";
import { useCreationValidation } from "./creation-validation";
import { CreationIcon } from "./creation-ui";

const copy = {
  ru: { title: "Выберите адрес на карте", placeholder: "Улица, номер дома или название места", map: "Показать на карте", hint: "Нажмите на нужное место — адрес появится в форме.", loading: "Загружаем карту…", searching: "Ищем адреса…", unavailable: "Карта пока недоступна. Введите адрес в форме вручную.", notFound: "Адрес не найден. Попробуйте другую точку на карте.", chooseCity: "Сначала выберите страну и город выше.", locating: "Определяем адрес…", lookupUnavailable: "Не удалось определить адрес. Попробуйте другую точку или введите адрес вручную.", searchUnavailable: "Поиск адресов пока недоступен. Введите адрес вручную или выберите его на карте.", cityUnavailable: "Не удалось найти город на карте. Приблизьте нужное место вручную.", center: "К центру города", close: "Закрыть", cancel: "Отмена", noLocal: "В выбранном городе ничего не найдено", otherCities: "В других городах этой страны", cityChanges: "При выборе адреса город мероприятия тоже изменится.", outsideCountry: "Выберите место в указанной стране.", tooLong: "Адрес должен содержать не более 250 символов." },
  en: { title: "Choose an address on the map", placeholder: "Street, building number or venue name", map: "Show on map", hint: "Click a place to fill the address in the form.", loading: "Loading map…", searching: "Searching addresses…", unavailable: "The map is unavailable. Type the address in the form.", notFound: "Address not found. Try another place on the map.", chooseCity: "Select a country and city above first.", locating: "Finding address…", lookupUnavailable: "Address lookup failed. Try another place or type the address manually.", searchUnavailable: "Address search is unavailable. Type the address or choose it on the map.", cityUnavailable: "The city could not be located. Zoom to the place manually.", center: "City center", close: "Close", cancel: "Cancel", noLocal: "No matches in the selected city", otherCities: "In other cities in this country", cityChanges: "Choosing an address also updates the event city.", outsideCountry: "Choose a place in the selected country.", tooLong: "The address must be 250 characters or fewer." },
  kk: { title: "Картадан мекенжайды таңдаңыз", placeholder: "Көше, үй нөмірі немесе орын атауы", map: "Картада көрсету", hint: "Орынды басыңыз — мекенжай формаға енгізіледі.", loading: "Карта жүктелуде…", searching: "Мекенжайлар ізделуде…", unavailable: "Карта қолжетімсіз. Мекенжайды формаға қолмен енгізіңіз.", notFound: "Мекенжай табылмады. Картадан басқа орынды таңдаңыз.", chooseCity: "Алдымен жоғарыда ел мен қаланы таңдаңыз.", locating: "Мекенжай анықталуда…", lookupUnavailable: "Мекенжай анықталмады. Басқа орынды таңдаңыз немесе қолмен енгізіңіз.", searchUnavailable: "Мекенжай іздеу қолжетімсіз. Қолмен енгізіңіз немесе картадан таңдаңыз.", cityUnavailable: "Қала картадан табылмады. Қажетті орынға қолмен жақындатыңыз.", center: "Қала орталығы", close: "Жабу", cancel: "Бас тарту", noLocal: "Таңдалған қаладан ештеңе табылмады", otherCities: "Осы елдің басқа қалаларында", cityChanges: "Мекенжай таңдалғанда іс-шара қаласы да өзгереді.", outsideCountry: "Таңдалған елден орынды таңдаңыз.", tooLong: "Мекенжай 250 таңбадан аспауы керек." },
};
export function AddressField({ label, value, city, country, locale, required, disabled, onChange }: { label: string; value: string; city: string; country: string | null; locale: EventLocale; required: boolean; disabled: boolean; onChange: (address: string, city?: string) => void }) {
  const c = copy[locale], id = useId(), validation = useCreationValidation(required ? "content.address" : undefined), input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null), control = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 360 });
  const [open, setOpen] = useState(false), [focused, setFocused] = useState(false), [text, setText] = useState(value), [composing, setComposing] = useState(false), [tooLong, setTooLong] = useState(false);
  const [results, setResults] = useState<AddressSearchResult | null>(null), [searching, setSearching] = useState(false), [failed, setFailed] = useState(false), [active, setActive] = useState(-1);
  const mapsKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY, suggestKey = process.env.NEXT_PUBLIC_YANDEX_SUGGEST_API_KEY;
  const canSearch = Boolean(country && city.trim()), query = text.trim(), showSuggestions = focused && canSearch && query.length >= 2 && !composing && !disabled;
  const options = results ? [...results.local, ...results.other] : [];
  useEffect(() => { if (!composing) setText(value); }, [value, composing]);
  function revealInput() {
    if (!input.current || document.activeElement !== input.current || !control.current) return;
    const viewport = window.visualViewport;
    const viewportBottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight);
    const rect = control.current.getBoundingClientRect(), footerTop = Math.min(document.querySelector(".creation-footer")?.getBoundingClientRect().top ?? viewportBottom, viewportBottom);
    const headerBottom = Math.max(document.querySelector(".site-navbar")?.getBoundingClientRect().bottom ?? 100, viewport?.offsetTop ?? 0);
    const space = input.current.value.trim().length >= 2 ? Math.min(280, Math.max(0, (footerTop - headerBottom - rect.height - 30) * .6)) : 0;
    const bottom = footerTop - space - 18;
    let distance = rect.bottom > bottom ? rect.bottom - bottom : rect.top < headerBottom + 12 ? rect.top - headerBottom - 12 : 0;
    // Mobile scrolls the form pane; desktop scrolls the document. Reserve room below the field in either case.
    for (let parent = control.current.parentElement; parent && distance; parent = parent.parentElement) {
      if (!/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) continue;
      const before = parent.scrollTop;
      parent.scrollBy({ top: distance, behavior: "instant" });
      distance -= parent.scrollTop - before;
    }
    if (distance) window.scrollBy({ top: distance, behavior: "instant" });
  }
  useEffect(() => {
    window.addEventListener("resize", revealInput); window.visualViewport?.addEventListener("resize", revealInput);
    return () => { window.removeEventListener("resize", revealInput); window.visualViewport?.removeEventListener("resize", revealInput); };
  }, []);
  useLayoutEffect(() => {
    if (!showSuggestions) return;
    revealInput();
    const place = () => {
      const rect = control.current!.getBoundingClientRect();
      const viewport = window.visualViewport, viewportBottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight);
      const footerTop = document.querySelector(".creation-footer")?.getBoundingClientRect().top ?? viewportBottom;
      const maxHeight = Math.min(360, Math.max(0, Math.min(viewportBottom, footerTop) - rect.bottom - 12));
      setPosition({ left: Math.max(8, rect.left), top: rect.bottom + 6, width: Math.min(rect.width, innerWidth - 16), maxHeight });
    };
    place(); window.addEventListener("resize", place); window.visualViewport?.addEventListener("resize", place);
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) setFocused(false); };
    const scroll = (event: Event) => { if (!panel.current?.contains(event.target as Node)) place(); };
    document.addEventListener("pointerdown", outside); window.addEventListener("scroll", scroll, true);
    return () => { window.removeEventListener("resize", place); window.visualViewport?.removeEventListener("resize", place); document.removeEventListener("pointerdown", outside); window.removeEventListener("scroll", scroll, true); };
  }, [showSuggestions, results, failed, searching]);
  useLayoutEffect(() => {
    if (showSuggestions && active >= 0) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [showSuggestions, active, id]);
  useEffect(() => {
    setResults(null); setFailed(false); setActive(-1);
    if (!showSuggestions || !country) { setSearching(false); return; }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const maps = !suggestKey && mapsKey ? await loadYandexMaps(mapsKey, locale) : undefined;
          if (controller.signal.aborted) return;
          const found = await searchAddressSuggestions({ city, country, locale, query, signal: controller.signal }, { ...(suggestKey ? { suggestKey } : {}), ...(maps ? { maps } : {}) });
          if (!controller.signal.aborted) setResults(found);
        } catch { if (!controller.signal.aborted) setFailed(true); }
        finally { if (!controller.signal.aborted) setSearching(false); }
      })();
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [showSuggestions, query, country, city, locale, mapsKey, suggestKey]);
  function accept(next: string) {
    if (graphemeLength(next) > 250) { setTooLong(true); setText(value); return; }
    setTooLong(false); setText(next); setFocused(true); onChange(next);
  }
  function choose(found: AddressSuggestion) {
    if (graphemeLength(found.address) > 250) { setTooLong(true); return; }
    setText(found.address); setFocused(false); setTooLong(false);
    onChange(found.address, country && !sameAddressCity(found.city, city, country) ? found.city : undefined);
    input.current?.focus();
    // Focusing after a pointer selection must not restart autocomplete for the chosen address.
    setFocused(false);
  }
  function showMap() { setFocused(false); setOpen(true); }
  return <div ref={root} {...validation.wrapper} className="creation-field creation-address-field" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && !panel.current?.contains(event.relatedTarget)) setFocused(false); }}>
    <label htmlFor={id} className="creation-field-label flex justify-between gap-3"><span>{label}{required ? <span aria-hidden="true" className="creation-required"> *</span> : null}</span><span id={`${id}-count`} className="creation-counter">{graphemeLength(text)} / 250</span></label>
    <div ref={control} className="creation-address-control">
      <input ref={input} id={id} {...validation.control} role="combobox" aria-required={required} aria-expanded={showSuggestions} aria-autocomplete="list" aria-controls={showSuggestions ? `${id}-options` : undefined} aria-activedescendant={showSuggestions && active >= 0 ? `${id}-option-${active}` : undefined} aria-describedby={`${id}-count${validation.control["aria-describedby"] ? ` ${validation.control["aria-describedby"]}` : ""}`} aria-invalid={tooLong || validation.invalid} disabled={disabled} autoComplete="off" placeholder={c.placeholder} value={text} onFocus={() => { setFocused(true); requestAnimationFrame(revealInput); }} onChange={event => { if (composing) setText(event.target.value); else accept(event.target.value); }} onCompositionStart={() => setComposing(true)} onCompositionEnd={event => { setComposing(false); accept(event.currentTarget.value); }} onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape") { setFocused(false); event.stopPropagation(); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setFocused(true); if (options.length) setActive(index => event.key === "ArrowDown" ? (index + 1) % options.length : (index <= 0 ? options.length : index) - 1); }
        if (event.key === "Enter") { event.preventDefault(); if (showSuggestions && active >= 0 && options[active]) choose(options[active]); }
      }} />
      <button type="button" className="creation-button creation-address-map-button" aria-haspopup="dialog" disabled={disabled || !canSearch} onClick={showMap}><CreationIcon name="map" size={19} /><span>{c.map}</span></button>
      {showSuggestions ? createPortal(<div ref={panel} className="creation-address-suggestions" style={position}>
        {searching || failed || (results && !results.local.length) ? <p role="status" className="creation-address-suggestion-status">{searching ? c.searching : failed ? c.searchUnavailable : c.noLocal}</p> : null}
        {!searching && (failed || (results && !results.local.length)) ? <button type="button" className="creation-button creation-address-fallback" onClick={showMap}><CreationIcon name="map" size={19} />{c.map}</button> : null}
        {results?.other.length ? <div className="creation-address-other"><strong>{c.otherCities}</strong><p>{c.cityChanges}</p></div> : null}
        <div id={`${id}-options`} role="listbox" aria-label={label}>{options.map((found, index) => <button key={found.id} type="button" role="option" id={`${id}-option-${index}`} aria-selected={active === index} tabIndex={-1} className="creation-address-option" onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(found)}><CreationIcon name="map-pin" size={18} /><span><strong>{found.title}</strong><small>{found.subtitle}</small></span></button>)}</div>
        {options.length ? <span className="creation-address-attribution">© Яндекс</span> : null}
      </div>, document.querySelector(".creation-workspace") ?? document.body) : null}
    </div>
    {!canSearch ? <span className="creation-hint">{c.chooseCity}</span> : null}
    {tooLong ? <span role="alert" className="creation-error">{c.tooLong}</span> : null}
    {validation.error}
    {open && country ? <AddressPicker value={text} city={city} country={country} locale={locale} onClose={() => { setOpen(false); input.current?.focus(); setFocused(false); }} onApply={choose} /> : null}
  </div>;
}
function AddressPicker({ value, city, country, locale, onClose, onApply }: { value: string; city: string; country: string; locale: EventLocale; onClose: () => void; onApply: (address: AddressSuggestion) => void }) {
  const c = copy[locale], id = useId(), dialog = useRef<HTMLDialogElement>(null), canvas = useRef<HTMLDivElement>(null);
  const map = useRef<YandexMap | null>(null), request = useRef(0), cityCenter = useRef<MapCoordinates | undefined>(undefined), apply = useRef(onApply);
  apply.current = onApply;
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [status, setStatus] = useState(c.loading);
  const key = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY;
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let alive = true;
    if (!key) { setStatus(c.unavailable); return; }
    void (async () => {
      try {
        const maps = await loadYandexMaps(key, locale);
        if (!alive || !canvas.current) return;
        const initialCenter = cityMapCenter(city, country);
        cityCenter.current = initialCenter;
        const instance = new maps.Map(canvas.current, { center: initialCenter ?? [20, 0], zoom: initialCenter ? 12 : 2, controls: ["zoomControl"] });
        map.current = instance;
        instance.events.add("click", event => {
          const coords = event.get("coords"), current = ++request.current;
          instance.geoObjects.removeAll(); instance.geoObjects.add(new maps.Placemark(coords, {}, { preset: "islands#violetDotIcon" }));
          setBusy(true); setStatus(c.locating);
          void geocodeAddress(maps, coords, { results: 1, kind: "house", locale }).then(result => {
            if (!alive || current !== request.current) return;
            const place = result.geoObjects.get(0);
            if (!place) { setStatus(c.notFound); return; }
            const found = addressFromGeocoder(place);
            if (found.countryCode !== country || !found.city) { setStatus(c.outsideCountry); return; }
            if (graphemeLength(found.address) > 250) { setStatus(c.tooLong); return; }
            apply.current(found); dialog.current?.close();
          }).catch(() => { if (alive && current === request.current) setStatus(c.lookupUnavailable); }).finally(() => { if (alive && current === request.current) setBusy(false); });
        });
        setReady(true); setStatus("");
        // Initial positioning must never overwrite a newer map click or change the form.
        const initialRequest = request.current;
        if (city.trim() && !initialCenter) {
          try {
            const result = await geocodeAddress(maps, cityAddressQuery(city, country, locale), { results: 1, locale });
            const place = result.geoObjects.get(0);
            if (!alive || initialRequest !== request.current) return;
            if (place) { cityCenter.current = place.geometry.getCoordinates(); void instance.setCenter(cityCenter.current, 12); }
            else setStatus(c.cityUnavailable);
          } catch { if (alive && initialRequest === request.current) setStatus(c.cityUnavailable); }
        }
        if (value.trim()) {
          try {
            const result = await geocodeAddress(maps, cityAddressQuery(city, country, locale, value), { results: 1, locale });
            if (!alive || initialRequest !== request.current) return;
            const place = result.geoObjects.get(0);
            if (place) {
              const found = addressFromGeocoder(place);
              if (found.countryCode === country && sameAddressCity(found.city, city, country)) {
                instance.geoObjects.add(new maps.Placemark(found.coordinates!, {}, { preset: "islands#violetDotIcon" }));
                void instance.setCenter(found.coordinates!, 16);
              }
            }
          } catch { /* Typed addresses remain editable; map clicks are still available. */ }
        }
      } catch { if (alive) setStatus(c.unavailable); }
    })();
    return () => { alive = false; request.current++; map.current?.destroy(); map.current = null; };
  }, [key, city, country, locale, c, value]);
  return <dialog ref={dialog} aria-labelledby={`${id}-title`} className="creation-address-dialog" onClose={onClose}>
    <header className="creation-address-header">
      <span className="creation-address-heading-icon"><CreationIcon name="map-pin" size={22} /></span>
      <div><h2 id={`${id}-title`}>{c.title}</h2><p>{cityAddressQuery(city, country, locale)}</p></div>
      <button type="button" className="creation-address-close" aria-label={c.close} onClick={() => dialog.current?.close()}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
    </header>
    <div className="creation-address-body">
      <div className="creation-address-map-frame">
        <div ref={canvas} className="creation-address-map" aria-label={locale === "ru" ? "Яндекс Карта" : "Yandex Map"} aria-busy={busy} />
        {!ready ? <div className="creation-address-map-placeholder"><CreationIcon name="map-pin" size={28} /><p>{status}</p></div> : null}
        {ready && cityCenter.current ? <button type="button" className="creation-address-recenter" onClick={() => { if (cityCenter.current) void map.current?.setCenter(cityCenter.current, 12); }}><CreationIcon name="map-pin" size={15} />{c.center}</button> : null}
      </div>
      <p role="status" className="creation-address-status" data-warning={Boolean(status) && ready}>{status || c.hint}</p>
    </div>
    <footer><span className="creation-address-selection"><CreationIcon name="map-pin" size={17} />{c.hint}</span><div><button type="button" className="creation-button" onClick={() => dialog.current?.close()}>{c.cancel}</button></div></footer>
  </dialog>;
}
