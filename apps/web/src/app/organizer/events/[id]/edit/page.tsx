import { Suspense } from "react";
import { OwnedEventEditor } from "./owned-event-editor";
export default async function EditOrganizerEventPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <Suspense><OwnedEventEditor eventId={id}/></Suspense>;}
