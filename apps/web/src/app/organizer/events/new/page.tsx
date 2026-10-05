import { redirect } from "next/navigation";
import { isLocale } from "../../../../lib/locale";
export default async function NewOrganizerEventPage({searchParams}:{searchParams:Promise<{lang?:string}>}){const params=await searchParams;redirect(`/events/create?lang=${isLocale(params.lang)?params.lang:"ru"}`);}
