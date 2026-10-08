"use client";
import { useEffect, useState } from "react";
import { assetMediaCrop, resolveLocalTime, selectedSaleRows, type CurrencyCapability, type DraftMediaResponse, type EventLocale, type MediaCrop } from "@event-platform/shared-types";
import type { DraftAutosave } from "../../lib/creation-draft-client";
import { FramedMedia } from "./framed-media";
import { usePrivateMedia } from "./media-grid";
import { EventStory } from "../event-presentation";
import { CreationIcon } from "./creation-ui";
import { HallThumbnail } from "./ticket-modes";
const copy = {
  ru: { title: "Предпросмотр", desktop: "Компьютер", phone: "Телефон", name: "Название вашего события", date: "Дата и время", address: "Адрес события", tickets: "Билеты", free: "Бесплатно", invitation: "Пригласительный", choose: "Выберите формат билетов", description: "Добавьте описание — оно появится здесь", about: "О событии", selected: "Выберите места на схеме", gallery: "Фотографии и видео", background: "Изображение события" },
  en: { title: "Preview", desktop: "Desktop", phone: "Phone", name: "Your event title", date: "Date and time", address: "Event address", tickets: "Tickets", free: "Free", invitation: "Invitation", choose: "Choose a ticket format", description: "Add a description to see it here", about: "About the event", selected: "Choose seats on the plan", gallery: "Photos and videos", background: "Event image" },
  kk: { title: "Алдын ала қарау", desktop: "Компьютер", phone: "Телефон", name: "Іс-шараңыздың атауы", date: "Күні мен уақыты", address: "Іс-шара мекенжайы", tickets: "Билеттер", free: "Тегін", invitation: "Шақыру билеті", choose: "Билет түрін таңдаңыз", description: "Сипаттаманы қоссаңыз, осында көрсетіледі", about: "Іс-шара туралы", selected: "Жоспардан орын таңдаңыз", gallery: "Фотосуреттер мен бейнелер", background: "Іс-шара суреті" },
};
export function DraftPreview({ client, locale, contentLocale, assets, currencies }: { client: DraftAutosave; locale: EventLocale; contentLocale: EventLocale; assets: DraftMediaResponse[]; currencies: CurrencyCapability[] }) {
  const [device, setDevice] = useState<"desktop" | "phone">("desktop"), [chosen, setChosen] = useState<string | null>(null);
  useEffect(() => { if (matchMedia("(max-width: 900px)").matches) setDevice("phone"); }, []);
  const draft = client.aggregate, controls = copy[locale], c = copy[contentLocale], content = draft.content[contentLocale];
  const candidates = draft.media.slots.flatMap(id => { const asset = assets.find(item => item.id === id && item.state === "ready"); return asset ? [asset] : []; });
  const background = candidates.find(asset => asset.id === chosen) ?? candidates.find(asset => asset.id === draft.media.backgroundAssetId);
  const src = usePrivateMedia(client.saved.id, background), poster = usePrivateMedia(client.saved.id, background?.kind === "video" ? background : undefined, "poster");
  const exponent = currencies.find(currency => currency.code === draft.currency)?.exponent ?? 2;
  let date: string = c.date, time = "";
  if (draft.schedule.startLocal) try {
    const instant = new Date(resolveLocalTime(draft.schedule.startLocal, draft.schedule.timezone, draft.schedule.startChoice ?? undefined));
    const formatted = new Intl.DateTimeFormat(contentLocale, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: draft.schedule.timezone }).format(instant);
    date = formatted.charAt(0).toLocaleUpperCase(contentLocale) + formatted.slice(1);
    time = new Intl.DateTimeFormat(contentLocale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "shortOffset", timeZone: draft.schedule.timezone }).format(instant);
  } catch { /* Partially entered dates keep the preview placeholder. */ }
  const rows = selectedSaleRows(draft);
  return <aside className="creation-live-preview-pane" aria-label={controls.title}>
    <header className="creation-live-preview-heading"><h2><CreationIcon name="eye" size={17} />{controls.title}</h2><div className="creation-preview-devices" role="group" aria-label={controls.title}>
      {(["desktop", "phone"] as const).map(value => <button key={value} type="button" aria-pressed={device === value} onClick={() => setDevice(value)}>{controls[value]}</button>)}
    </div></header>
    <div className="creation-preview-scroll"><article className="creation-preview-page" lang={contentLocale} data-device={device}>
      <div className="creation-preview-hero"><div className="creation-preview-hero-media" aria-hidden="true">{src && background ? <FramedMedia src={src} poster={poster} kind={background.kind} width={background.width ?? 1} height={background.height ?? 1} crop={assetMediaCrop(draft.media, background.id)} alt="" className="h-full w-full" /> : null}</div><div className="creation-preview-shade" />
        <div className="creation-preview-hero-content"><h3>{content?.title || c.name}</h3><div className="creation-preview-details"><div><CreationIcon name="calendar-days" size={15} /><div><strong>{date}</strong>{time ? <p>{time}</p> : null}</div></div><div><CreationIcon name="map-pin" size={15} /><div><strong>{content?.address || c.address}</strong>{draft.classification.city ? <p>{draft.classification.city}</p> : null}</div></div></div></div>
        {candidates.length > 1 ? <div className="creation-preview-thumbnails">{candidates.slice(0, 4).map((asset, index) => <button type="button" key={asset.id} aria-label={`${c.background} ${index + 1}`} aria-pressed={asset.id === background?.id} onClick={() => setChosen(asset.id)}><PreviewAsset draftId={client.saved.id} asset={asset} crop={assetMediaCrop(draft.media, asset.id)} /></button>)}</div> : null}
      </div>
      <div className="creation-preview-body"><div className="creation-preview-story">{!content?.description ? <div className="creation-preview-placeholder"><h3>{c.about}</h3><p>{c.description}</p></div> : null}<EventStory description={content?.description ?? null} address={content?.address ?? ""} refundConditions={draft.refundsAvailable ? content?.refundConditions ?? null : null} refundsAvailable={draft.refundsAvailable ?? false} free={draft.selectedMode === "free"} locale={contentLocale} showRefund={!!draft.selectedMode} /></div>
        <section className="creation-preview-tickets"><h3>{c.tickets}</h3>{!draft.selectedMode ? <p className="creation-hint">{c.choose}</p> : rows.map(row => <div className="creation-preview-ticket" key={row.id}><span>{row.content[contentLocale]?.name || (draft.selectedMode === "free" ? c.invitation : "—")}</span><strong>{draft.selectedMode === "free" ? c.free : row.amount !== null ? new Intl.NumberFormat(contentLocale, { style: "currency", currency: draft.currency }).format(row.amount / 10 ** exponent) : "—"}</strong></div>)}</section>
      </div>
      {draft.selectedMode === "paid_seated" && draft.paidSeated ? <section className="creation-preview-hall"><h3>{c.selected}</h3><HallThumbnail hall={draft.paidSeated} locale={contentLocale} /></section> : null}
      {candidates.length ? <section className="creation-preview-gallery"><h3>{c.gallery}</h3><div>{candidates.map(asset => <PreviewAsset key={asset.id} draftId={client.saved.id} asset={asset} crop={assetMediaCrop(draft.media, asset.id)} caption={draft.media.captions[asset.id]?.[contentLocale] ?? ""} controls />)}</div></section> : null}
    </article></div>
  </aside>;
}
function PreviewAsset({ draftId, asset, crop, caption = "", controls = false }: { draftId: string; asset: DraftMediaResponse; crop: MediaCrop; caption?: string; controls?: boolean }) {
  const src = usePrivateMedia(draftId, asset, controls ? "display" : "thumbnail"), poster = usePrivateMedia(draftId, asset.kind === "video" ? asset : undefined, "poster");
  return src ? <FramedMedia src={src} poster={poster} kind={controls ? asset.kind : "image"} width={asset.width ?? 1} height={asset.height ?? 1} crop={crop} alt={caption} className="aspect-video h-full w-full rounded-lg" controls={controls} /> : null;
}
