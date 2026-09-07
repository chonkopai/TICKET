import { EVENT_CATEGORIES, type CreateEventRequest, type UpdateEventRequest } from "@event-platform/shared-types";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export class CreateEventDto implements CreateEventRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsIn(EVENT_CATEGORIES)
  category!: CreateEventRequest["category"];

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city!: string;

  @IsString()
  @Matches(DATE_PATTERN)
  date!: string;

  @IsString()
  @Matches(TIME_PATTERN)
  time!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  venueName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  address!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  announcement?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  program?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  rules?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  visitTerms?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  cancellationTerms?: string | null;

  @IsOptional()
  @IsIn(["deposit", "full_payment"])
  paymentMode?: "deposit" | "full_payment";

  @IsOptional()
  @IsBoolean()
  showFullAmountForDeposit?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  depositTerms?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  extraConditions?: string | null;
}

export class UpdateEventDto implements UpdateEventRequest {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsIn(EVENT_CATEGORIES)
  category?: CreateEventRequest["category"];

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @Matches(DATE_PATTERN)
  date?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN)
  time?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  venueName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  announcement?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  program?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  rules?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  visitTerms?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  cancellationTerms?: string | null;

  @IsOptional()
  @IsIn(["deposit", "full_payment"])
  paymentMode?: "deposit" | "full_payment";

  @IsOptional()
  @IsBoolean()
  showFullAmountForDeposit?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  depositTerms?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  extraConditions?: string | null;
}

export class EventListQueryDto {
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
