export interface WalletPassInput {
  serialNumber: string;
  eventTitle: string;
  ticketTypeName: string;
  seatLabel?: string | null;
  venueName: string;
  address: string;
  eventDate: string;
  eventTime: string;
  timezone: string;
  qrToken: string;
}
export interface WalletPassGenerator {
  isConfigured(): boolean;
  generate(input: WalletPassInput): Promise<Buffer>;
}
