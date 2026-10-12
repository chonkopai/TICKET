import type { EventChatMessage, EventChatPage } from "@event-platform/shared-types";
import { apiRequest } from "../app/(auth)/_lib/api";
import { quickRequest } from "../app/quick/api";

export function orderChatClient(eventId: string, orderId: string, mode: "guest" | "organizer" | "anonymous", accessToken?: string) {
  const path = mode === "organizer"
    ? `/api/organizer/events/${eventId}/orders/${orderId}/chat`
    : `/me/events/${eventId}/orders/${orderId}/chat`;
  const quickPath = `events/${eventId}/orders/${orderId}/chat`;
  return {
    list: (before?: string) => {
      const query = before ? `?before=${encodeURIComponent(before)}` : "";
      return mode === "anonymous"
        ? quickRequest<EventChatPage>(`${quickPath}${query}`, accessToken)
        : apiRequest<EventChatPage>(`${path}${query}`, { cache: "no-store" });
    },
    read: () => mode === "anonymous"
      ? quickRequest(`${quickPath}/read`, accessToken, {})
      : apiRequest(`${path}/read`, { method: "POST" }),
    send: (text: string, requestKey: string) => mode === "anonymous"
      ? quickRequest<EventChatMessage>(quickPath, accessToken, { text, requestKey })
      : apiRequest<EventChatMessage>(path, { method: "POST", body: JSON.stringify({ text, requestKey }) }),
  };
}
