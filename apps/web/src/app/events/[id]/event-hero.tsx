"use client";

import { useState } from "react";
import type { PublicEvent, PublicEventMedia } from "@event-platform/shared-types";
import { PublicFramedAsset } from "../../../components/public-event-media";

/** Keep the saved 16:9 crop intact, then scale that frame to cover the hero. */
export function EventHero({ event, children, actions, galleryLabel }: { event: PublicEvent; children: React.ReactNode; actions: React.ReactNode; galleryLabel: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const images = event.media?.filter(asset => asset.kind === "image" && (asset.galleryVisible || asset.isBackground || asset.isCard)) ?? [];
  const background = event.media?.find(asset => asset.isBackground) ?? images[0];
  const legacy = [...new Set([event.posterUrl, ...(event.galleryUrls ?? [])].filter((url): url is string => Boolean(url)))];
  const options: Array<{ id: string; asset?: PublicEventMedia; url: string }> = images.length
    ? [background, ...images].filter((asset, index, all): asset is PublicEventMedia => Boolean(asset && asset.kind === "image" && all.findIndex(item => item?.id === asset.id) === index)).slice(0, 4).map(asset => ({ id: asset.id, asset, url: asset.url }))
    : legacy.slice(0, 4).map(url => ({ id: url, url: mediaUrl(url) }));
  const active = options.find(option => option.id === selected);
  const asset = active?.asset ?? (selected ? undefined : background);
  const url = active?.url ?? mediaUrl(event.posterUrl ?? "");

  return <section className="event-hero relative isolate overflow-hidden bg-[#10192b] text-white">
    <div className="event-hero-media" aria-hidden="true">
      {asset ? <PublicFramedAsset asset={asset} role="background" className="h-full w-full" /> : url ? <img alt="" src={url} className="h-full w-full object-cover" /> : null}
    </div>
    <div className="absolute inset-0 bg-[#081527]/45" />
    <div className="absolute inset-0 bg-gradient-to-t from-[#081527]/95 via-[#081527]/30 to-[#081527]/35" />
    <div className="event-hero-actions absolute inset-x-0 top-4 mx-auto max-w-7xl">{actions}</div>
    <div className="event-hero-content relative z-10 mx-auto flex h-full max-w-7xl flex-col justify-end gap-5 px-4 pb-6 pt-20 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:px-10 lg:pb-10">
      <div className="min-w-0 flex-1">{children}</div>
      {options.length > 0 ? <div className="flex shrink-0 gap-2 self-end" role="group" aria-label={galleryLabel}>
        {options.map((option, index) => <button key={option.id} type="button" aria-label={`${galleryLabel}: ${index + 1}`} aria-pressed={option.id === (active?.id ?? background?.id ?? options[0]?.id)} onClick={() => setSelected(option.id)} className="event-hero-thumbnail relative overflow-hidden rounded-lg border-2 shadow-lg transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" style={{ borderColor: option.id === (active?.id ?? background?.id ?? options[0]?.id) ? "white" : "transparent" }}>
          {option.asset ? <PublicFramedAsset asset={option.asset} className="h-full w-full" /> : <img alt="" src={option.url} className="h-full w-full object-cover" />}
        </button>)}
      </div> : null}
    </div>
  </section>;
}

function mediaUrl(url: string) { return url ? new URL(url, process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").toString() : ""; }
