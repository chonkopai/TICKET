"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { OrderChat } from "./order-chat";
import { AccountIcon } from "./account-icon";
import { useLocale } from "./locale-provider";
import { getSession, subscribeSession } from "../app/(auth)/_lib/session";
import "./floating-order-chat.css";

type Conversation = { eventId: string; orderId: string; mode?: "guest" | "organizer"; title?: string | undefined };
const ChatContext = createContext<(conversation: Conversation) => void>(() => undefined);

export function OrderChatButton({ children, className = "account-text-link", ...conversation }: Conversation & { children: ReactNode; className?: string }) {
  const open = useContext(ChatContext);
  return <button type="button" className={className} onClick={() => open(conversation)}>{children}</button>;
}

export function FloatingOrderChatProvider({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const copy = { ru: { title: "Переписка с организатором", organizer: "Сообщения по заказу", close: "Закрыть чат", move: "Переместить окно: перетащите или используйте стрелки", order: "Заказ" }, kk: { title: "Ұйымдастырушымен хат алмасу", organizer: "Тапсырыс хабарлары", close: "Чатты жабу", move: "Терезені жылжыту: сүйреңіз немесе көрсеткілерді пайдаланыңыз", order: "Тапсырыс" }, en: { title: "Chat with organizer", organizer: "Order messages", close: "Close chat", move: "Move window: drag or use arrow keys", order: "Order" } }[locale];
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [mobile, setMobile] = useState(false);
  const background = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  function move(x: number, y: number) {
    const rect = panel.current?.getBoundingClientRect();
    if (rect) setPosition({ x: Math.max(8, Math.min(x, innerWidth - rect.width - 8)), y: Math.max(8, Math.min(y, innerHeight - rect.height - 8)) });
  }
  function close() { setConversation(null); }
  useEffect(() => {
    const media = matchMedia("(max-width: 640px)");
    const resize = () => { setMobile(media.matches); setPosition(null); };
    resize(); window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    let userId = getSession()?.user.id;
    return subscribeSession(() => { const next = getSession()?.user.id; if (next !== userId) setConversation(null); userId = next; });
  }, []);
  useEffect(() => {
    if (!conversation) return;
    closeButton.current?.focus();
    return () => { queueMicrotask(() => { if (!panel.current) returnFocus.current?.focus(); }); };
  }, [conversation]);
  useEffect(() => {
    if (!conversation) return;
    const bodyOverflow = document.body.style.overflow;
    if (mobile) { document.body.style.overflow = "hidden"; background.current?.setAttribute("inert", ""); }
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setConversation(null); }
      if (mobile && event.key === "Tab") {
        const nodes = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]');
        if (!nodes?.length) return;
        const first = nodes[0]!, last = nodes[nodes.length - 1]!;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => { background.current?.removeAttribute("inert"); document.body.style.overflow = bodyOverflow; document.removeEventListener("keydown", keyboard); };
  }, [conversation, mobile]);

  return <ChatContext.Provider value={next => { const active = document.activeElement as HTMLElement | null;
    returnFocus.current = active?.closest(".ticket-navbar-notifications")?.querySelector<HTMLButtonElement>(":scope > button") ?? active; setConversation(next); }}>
    <div ref={background}>{children}</div>
    {conversation ? <div className="order-chat-layer">
      {mobile ? <div className="order-chat-backdrop" onClick={close} /> : null}
      <div ref={panel} className="order-chat-window" role="dialog" aria-modal={mobile || undefined} aria-label={conversation.mode === "organizer" ? copy.organizer : copy.title} style={!mobile && position ? { left: position.x, top: position.y, right: "auto", bottom: "auto" } : undefined}>
        <header className="order-chat-window-header">
          <div className="order-chat-window-drag" role={mobile ? undefined : "button"} tabIndex={mobile ? undefined : 0} aria-label={mobile ? undefined : copy.move}
            onPointerDown={event => { if (mobile || event.button !== 0) return; const rect = panel.current!.getBoundingClientRect(); drag.current = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top }; event.currentTarget.setPointerCapture(event.pointerId); }}
            onPointerMove={event => { if (drag.current) move(drag.current.left + event.clientX - drag.current.x, drag.current.top + event.clientY - drag.current.y); }}
            onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
            onKeyDown={event => { if (mobile || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return; event.preventDefault(); const rect = panel.current!.getBoundingClientRect(); move(rect.left + (event.key === "ArrowLeft" ? -24 : event.key === "ArrowRight" ? 24 : 0), rect.top + (event.key === "ArrowUp" ? -24 : event.key === "ArrowDown" ? 24 : 0)); }}>
            <span className="order-chat-window-symbol"><AccountIcon name="messages" /></span><div><h2>{conversation.mode === "organizer" ? copy.organizer : copy.title}</h2><p>{conversation.title || `${copy.order} #${conversation.orderId.slice(-8)}`}</p></div>
          </div>
          <button type="button" ref={closeButton} onClick={close} aria-label={copy.close} className="order-chat-window-close">×</button>
        </header>
        <div className="order-chat-window-body"><OrderChat eventId={conversation.eventId} orderId={conversation.orderId} mode={conversation.mode ?? "guest"} /></div>
      </div>
    </div> : null}
  </ChatContext.Provider>;
}
