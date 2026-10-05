"use client";
import Link from "next/link";
import type { OrganizerEvent } from "@event-platform/shared-types";
import { useLocale } from "../../../../../components/locale-provider";
import { localeUrl } from "../../../../../lib/locale";

const words={
  ru:{title:"Событие требует проверки",body:"Это событие использует прежний формат. Перед редактированием организатор должен проверить условия продажи, переводы, медиа и расписание. Существующие покупки, QR-билеты и возвраты доступны в управлении событием.",manage:"Управление событием",preview:"Предпросмотр",create:"Создать новое событие"},
  en:{title:"Event review required",body:"This event uses the previous format. Its sale terms, translations, media and schedule need review before editing. Existing purchases, QR tickets and refunds remain available in event management.",manage:"Manage event",preview:"Preview",create:"Create a new event"},
  kk:{title:"Іс-шараны тексеру қажет",body:"Бұл іс-шара бұрынғы форматты қолданады. Өңдемес бұрын сату шарттарын, аудармаларды, медианы және кестені тексеру қажет. Бұрынғы сатып алулар, QR-билеттер және қайтарымдар іс-шараны басқаруда қолжетімді.",manage:"Іс-шараны басқару",preview:"Алдын ала қарау",create:"Жаңа іс-шара құру"},
};
export function LegacyEventReview({event}:{event:OrganizerEvent}){
  const locale=useLocale(),copy=words[locale];
  return <main className="mx-auto max-w-3xl space-y-5 p-6 sm:p-10"><h1 className="text-2xl font-semibold">{event.title}</h1><section className="rounded-2xl border border-violet-200 dark:border-ticket-accent bg-violet-50 dark:bg-ticket-accent-soft p-5"><h2 className="text-lg font-semibold">{copy.title}</h2><p className="mt-3 leading-7">{copy.body}</p></section><nav className="flex flex-wrap gap-4"><Link className="rounded-xl bg-violet-700 dark:bg-ticket-primary px-4 py-3 text-white" href={localeUrl(`/organizer/events/${event.id}`,locale)}>{copy.manage}</Link><Link className="rounded-xl border px-4 py-3" href={localeUrl(`/organizer/events/${event.id}/preview`,locale)}>{copy.preview}</Link><Link className="rounded-xl border px-4 py-3" href={localeUrl("/events/create",locale)}>{copy.create}</Link></nav></main>;
}
