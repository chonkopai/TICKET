import type {
  CancelRequest,
  CreateTableCheckoutRequest,
  CreateTicketCheckoutRequest,
} from "@event-platform/shared-types";
import { Equals, IsInt, IsUUID, Max, Min } from "class-validator";

export class TicketCheckoutDto implements CreateTicketCheckoutRequest {
  @IsUUID()
  ticketTypeId!: string;

  @IsInt()
  @Min(1)
  @Max(10)
  quantity!: number;

  @Equals(true)
  termsAccepted!: true;
}

export class TableCheckoutDto implements CreateTableCheckoutRequest {
  @IsUUID()
  tableId!: string;

  @Equals(true)
  termsAccepted!: true;
}

export class CancelDto implements CancelRequest {
  @Equals(true)
  confirmed!: true;
}
