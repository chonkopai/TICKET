"use client";
import { useEffect,useState } from "react";
import type { OrganizerEvent } from "@event-platform/shared-types";
import { apiRequest } from "../../../../(auth)/_lib/api";
import { ProtectedRoute } from "../../../../(auth)/_components/protected-route";
import { DraftWorkspace } from "../../../../events/create/workspace";
import { LegacyEventReview } from "./legacy-event-review";
export function OwnedEventEditor({eventId}:{eventId:string}){return <ProtectedRoute><Editor eventId={eventId}/></ProtectedRoute>;}
function Editor({eventId}:{eventId:string}){const [event,setEvent]=useState<OrganizerEvent|null>(null),[error,setError]=useState("");useEffect(()=>{void apiRequest<OrganizerEvent>(`/api/organizer/events/${eventId}`).then(setEvent).catch(reason=>setError(reason.message));},[eventId]);return error?<p role="alert">{error}</p>:!event?<p role="status">…</p>:event.creationVersion===2?<DraftWorkspace eventId={eventId}/>:<LegacyEventReview event={event}/>;}
