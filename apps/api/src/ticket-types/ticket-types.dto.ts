import type {
  CreateTicketTypeRequest,
  TicketTypeStatus,
  UpdateTicketTypeRequest,
} from "@event-platform/shared-types";
import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

const TICKET_TYPE_STATUSES: TicketTypeStatus[] = ["draft", "active", "paused", "sold_out"];

export class CreateTicketTypeDto implements CreateTicketTypeRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsInt()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  deposit?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currency?: string;

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  quantityTotal!: number;

  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  description?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true })
  salesStartAt?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true })
  salesEndAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  restrictions?: string | null;

  @IsOptional()
  @IsIn(TICKET_TYPE_STATUSES)
  status?: TicketTypeStatus;
}

export class UpdateTicketTypeDto implements UpdateTicketTypeRequest {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  deposit?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  quantityTotal?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  description?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true })
  salesStartAt?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true })
  salesEndAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  restrictions?: string | null;

  @IsOptional()
  @IsIn(TICKET_TYPE_STATUSES)
  status?: TicketTypeStatus;
}

export class TicketTypeListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}
