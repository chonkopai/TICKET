import type { ReactNode } from "react";

export type CreationIconName = "image" | "image-plus" | "upload" | "align-left" | "calendar-days" | "map-pin" | "ticket1" | "ticket-check" | "ticket2" | "armchair" | "eye" | "arrow-up-right" | "cloud-check" | "lock-keyhole" | "plus" | "circle" | "circle-check";

/** Keep the exported SVG's intrinsic dimensions; sizing belongs to the slot. */
export function CreationIcon({ name, size = 19 }: { name: CreationIconName; size?: number }) {
  return <span aria-hidden="true" className="creation-icon" style={{ width: size, height: size }}><img src={`/event-creation/${name}.svg`} alt="" /></span>;
}

export function CreationCard({ id, title, icon, aside, children }: { id: string; title: string; icon: CreationIconName; aside?: ReactNode; children: ReactNode }) {
  return <section id={id} className="creation-card" aria-labelledby={`${id}-heading`} tabIndex={-1}>
    <div className="creation-card-heading"><CreationIcon name={icon} /><h2 id={`${id}-heading`}>{title}</h2>{aside}</div>
    {children}
  </section>;
}
