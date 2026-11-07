import { hallV3Editor, hallObjectPaint, UNAVAILABLE_HALL_COLOR, type DraftHallV3, type EventLocale } from "@event-platform/shared-types";

export function HallThumbnail({ hall, locale = "ru" }: { hall: DraftHallV3; locale?: EventLocale }) {
  const editor = hallV3Editor(hall, locale);
  return <svg role="img" aria-label={locale === "ru" ? "Предпросмотр зала" : locale === "kk" ? "Залды алдын ала қарау" : "Hall preview"} className="h-40 w-full rounded-xl border border-slate-200 dark:border-ticket-border bg-white dark:bg-ticket-surface" viewBox={`0 0 ${hall.room.widthM} ${hall.room.heightM}`}>
    <rect width={hall.room.widthM} height={hall.room.heightM} fill="#f8f7fc" stroke="#cbc7d4" strokeWidth=".1" />
    {editor.objects.map(object => {
      const paint = hallObjectPaint(object, editor), color = object.locked ? UNAVAILABLE_HALL_COLOR : paint.color;
      return <g key={object.id} transform={`translate(${object.x} ${object.y}) rotate(${object.rotation})`}>{object.type === "seat" ? <circle r=".22" fill={color} /> : <rect x={-object.width / 2} y={-object.height / 2} width={object.width} height={object.height} rx={object.type === "table_round" ? object.width / 2 : .05} fill={color} stroke={paint.neutral ? "#94a3b8" : color} strokeWidth=".06" opacity={object.type === "zone" ? .3 : 1} />}</g>;
    })}
  </svg>;
}
