import type { UseTicketRequest } from "@event-platform/shared-types";
import { IsString, Matches } from "class-validator";

export class UseTicketDto implements UseTicketRequest {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  qrToken!: string;
}
