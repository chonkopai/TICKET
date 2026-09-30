import type {
  CancelRequest,
  CreateTableCheckoutRequest,
  CreateSeatCheckoutRequest,
  CreateTicketCheckoutRequest,
  CreateCartCheckoutRequest,
  CheckoutEmailChoice,
} from "@event-platform/shared-types";
import { ArrayMaxSize, ArrayNotEmpty, Equals, IsInt, IsUUID, Max, Min, ValidateNested, IsOptional, IsArray, ArrayUnique, IsEmail, IsString, Matches } from "class-validator";
import { Type } from "class-transformer";

class CartTicketDto {
  @IsUUID("4") ticketTypeId!: string;
  @IsInt() @Min(1) @Max(10) quantity!: number;
}

class EmailDeliveryDto implements CheckoutEmailChoice {
  @IsEmail() address!: string;
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) grant?: string;
}

export class CheckoutEmailRequestDto {
  @IsEmail() address!: string;
}

export class CheckoutEmailVerifyDto extends CheckoutEmailRequestDto {
  @IsUUID("4") challengeId!: string;
  @IsString() @Matches(/^\d{6}$/) code!: string;
}

export class CartCheckoutDto implements CreateCartCheckoutRequest {
  @IsOptional() @ValidateNested() @Type(() => EmailDeliveryDto) emailDelivery?: EmailDeliveryDto;
  @IsUUID("4") eventId!: string;
  @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => CartTicketDto) tickets!: CartTicketDto[];
  @IsOptional() @IsUUID("4") tableId?: string;
  @IsArray() @ArrayMaxSize(10) @ArrayUnique() @IsUUID("4", { each: true }) seatIds!: string[];
  @Equals(true) termsAccepted!: true;
}

export class TicketCheckoutDto implements CreateTicketCheckoutRequest {
  @IsOptional() @ValidateNested() @Type(() => EmailDeliveryDto) emailDelivery?: EmailDeliveryDto;
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
  @IsOptional() @ValidateNested() @Type(() => EmailDeliveryDto) emailDelivery?: EmailDeliveryDto;
  @IsUUID()
  tableId!: string;

  @Equals(true)
  termsAccepted!: true;
}

export class SeatCheckoutDto implements CreateSeatCheckoutRequest {
  @IsOptional() @ValidateNested() @Type(() => EmailDeliveryDto) emailDelivery?: EmailDeliveryDto;
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
