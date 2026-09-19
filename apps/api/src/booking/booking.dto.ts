import type {
  CancelRequest,
  CreateTableCheckoutRequest,
  CreateSeatCheckoutRequest,
  CreateTicketCheckoutRequest,
} from "@event-platform/shared-types";
import { ArrayMaxSize, ArrayNotEmpty, Equals, IsInt, IsUUID, Max, Min } from "class-validator";

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

export class SeatCheckoutDto implements CreateSeatCheckoutRequest {
  @IsUUID("4", { each: true })
  @ArrayNotEmpty()
  @ArrayMaxSize(10)
  seatIds!: string[];

  @Equals(true)
  termsAccepted!: true;
}

export class CancelDto implements CancelRequest {
  @Equals(true)
  confirmed!: true;
}
