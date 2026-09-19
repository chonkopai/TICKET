import type { UseGroupPassRequest, UseTicketRequest } from "@event-platform/shared-types";
import { IsBoolean, IsString, Matches } from "class-validator";

export class UseTicketDto implements UseTicketRequest {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  qrToken!: string;
}

export class UseGroupPassDto implements UseGroupPassRequest {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  token!: string;

  @IsBoolean()
  confirm!: true;
}
