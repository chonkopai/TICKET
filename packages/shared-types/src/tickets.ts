export type TicketTypeStatus = "draft" | "active" | "paused" | "sold_out";
export type TicketStatus =
  | "created"
  | "pending_payment"
  | "paid"
  | "active"
  | "used"
  | "cancelled"
  | "refunded";

export interface TicketTypeCounters {
  total: number;
  created: number;
  reserved: number;
  sold: number;
  paid: number;
  remaining: number;
  refunded: number;
  cancelled: number;
}

export interface OrganizerTicketType {
  id: string;
  eventId: string;
  name: string;
  price: number;
  deposit: number;
  currency: string;
  quantityTotal: number;
  description: string | null;
  salesStartAt: string | null;
  salesEndAt: string | null;
  restrictions: string | null;
  status: TicketTypeStatus;
  counters: TicketTypeCounters;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTicketTypeRequest {
  name: string;
  price: number;
  deposit?: number;
  currency?: string;
  quantityTotal: number;
  description?: string | null;
  salesStartAt?: string | null;
  salesEndAt?: string | null;
  restrictions?: string | null;
  status?: TicketTypeStatus;
}

export type UpdateTicketTypeRequest = Partial<CreateTicketTypeRequest>;

export interface OrganizerTicketTypeList {
  items: OrganizerTicketType[];
  page: number;
  limit: number;
  total: number;
  hasNext: boolean;
}

export interface DeleteTicketTypeResponse {
  deleted: true;
  id: string;
}

export interface InventoryReservation {
  token: string;
  ticketTypeId: string;
  quantity: number;
  expiresAt: string;
}

export interface OrganizerTicket {
  id: string;
  ticketTypeId: string;
  eventId: string;
  ticketTypeName: string;
  eventTitle: string;
  status: TicketStatus;
  usedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UseTicketRequest {
  qrToken: string;
}

export interface UseTicketResponse {
  ticket: OrganizerTicket;
}

export interface GuestTicket {
  id: string;
  eventId: string;
  eventTitle: string;
  ticketTypeName: string;
  status: TicketStatus;
  usedAt: string | null;
  qrPath: string;
  walletPath: string;
  createdAt: string;
  updatedAt: string;
}
