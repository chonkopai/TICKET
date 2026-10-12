"use client";
import { useCallback, useEffect, useState } from "react";
import { assetMediaCrop, mediaRoleCrops, type CurrencyCapability, type DraftMediaResponse, type EventLocale, type PublicEventMedia } from "@event-platform/shared-types";
import type { DraftAutosave } from "../../lib/creation-draft-client";
import { draftEventPreview } from "../../lib/draft-event-preview";
import PublicEventPage from "../../app/events/[id]/event-client";
import { LocaleProvider } from "../locale-provider";
import { CurrencyProvider } from "../currency-provider";
import { usePrivateMedia } from "./media-grid";
import { CreationIcon } from "./creation-ui";
import { ScaledEventPreview } from "./scaled-event-preview";
const copy = {
  ru: { title: "Предпросмотр", desktop: "Компьютер", phone: "Телефон", name: "Название вашего события", date: "Дата и время", address: "Адрес события", tickets: "Билеты", free: "Бесплатно", invitation: "Пригласительный", choose: "Выберите формат билетов", description: "Добавьте описание — оно появится здесь", about: "О событии", selected: "Выберите места на схеме", gallery: "Фотографии и видео", background: "Изображение события" },
  en: { title: "Preview", desktop: "Desktop", phone: "Phone", name: "Your event title", date: "Date and time", address: "Event address", tickets: "Tickets", free: "Free", invitation: "Invitation", choose: "Choose a ticket format", description: "Add a description to see it here", about: "About the event", selected: "Choose seats on the plan", gallery: "Photos and videos", background: "Event image" },
  kk: { title: "Алдын ала қарау", desktop: "Компьютер", phone: "Телефон", name: "Іс-шараңыздың атауы", date: "Күні мен уақыты", address: "Іс-шара мекенжайы", tickets: "Билеттер", free: "Тегін", invitation: "Шақыру билеті", choose: "Билет түрін таңдаңыз", description: "Сипаттаманы қоссаңыз, осында көрсетіледі", about: "Іс-шара туралы", selected: "Жоспардан орын таңдаңыз", gallery: "Фотосуреттер мен бейнелер", background: "Іс-шара суреті" },
};
export function DraftPreview({ client, locale, contentLocale, assets }: { client: DraftAutosave; locale: EventLocale; contentLocale: EventLocale; assets: DraftMediaResponse[]; currencies: CurrencyCapability[] }) {
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [sources, setSources] = useState<Record<string, { url: string; poster: string | undefined }>>({});
  useEffect(() => { if (matchMedia("(max-width: 900px)").matches) setDevice("phone"); }, []);
  const resolved = useCallback((id: string, url: string, poster: string | undefined) => setSources(current => current[id]?.url === url && current[id]?.poster === poster ? current : { ...current, [id]: { url, poster } }), []);
  const draft = client.aggregate, controls = copy[locale], c = copy[contentLocale];
  const candidates = draft.media.slots.flatMap(id => { const asset = assets.find(item => item.id === id && item.state === "ready"); return asset ? [asset] : []; });
  const media: PublicEventMedia[] = candidates.flatMap(asset => {
    const source = sources[asset.id];
    return source ? [{ id: asset.id, slot: draft.media.slots.indexOf(asset.id), kind: asset.kind, width: asset.width ?? 1, height: asset.height ?? 1, url: source.url, posterUrl: source.poster ?? null, isCard: asset.id === draft.media.cardAssetId, isBackground: asset.id === draft.media.backgroundAssetId, galleryVisible: true, caption: draft.media.captions[asset.id]?.[contentLocale] ?? null, crops: mediaRoleCrops(assetMediaCrop(draft.media, asset.id)) }] : [];
  });
  const model = draftEventPreview(client.saved.id, draft, contentLocale, media, { title: c.name, address: c.address, invitation: c.invitation });
  return <aside className="creation-live-preview-pane" aria-label={controls.title}>
    <header className="creation-live-preview-heading"><h2><CreationIcon name="eye" size={17} />{controls.title}</h2><div className="creation-preview-devices" role="group" aria-label={controls.title}>
      {(["desktop", "phone"] as const).map(value => <button key={value} type="button" aria-pressed={device === value} onClick={() => setDevice(value)}>{controls[value]}</button>)}
    </div></header>
    {candidates.map(asset => <ResolvePreviewMedia key={asset.id} draftId={client.saved.id} asset={asset} onResolve={resolved} />)}
    <div className="creation-preview-scroll"><ScaledEventPreview device={device} title={`${controls.title} · ${controls[device]}`} locale={contentLocale}>
      <LocaleProvider locale={contentLocale}><CurrencyProvider><PublicEventPage id={client.saved.id} preview={{ ...model, datePlaceholder: model.hasDate ? undefined : c.date, descriptionPlaceholder: c.description, emptyTickets: c.choose, showRefund: Boolean(draft.selectedMode) }} /></CurrencyProvider></LocaleProvider>
    </ScaledEventPreview></div>
  </aside>;
}
function ResolvePreviewMedia({ draftId, asset, onResolve }: { draftId: string; asset: DraftMediaResponse; onResolve: (id: string, url: string, poster: string | undefined) => void }) {
  const src = usePrivateMedia(draftId, asset), poster = usePrivateMedia(draftId, asset.kind === "video" ? asset : undefined, "poster");
  useEffect(() => { if (src) onResolve(asset.id, src, poster); }, [asset.id, src, poster, onResolve]);
  return null;
}
