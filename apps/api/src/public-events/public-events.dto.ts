import { Transform, Type } from "class-transformer";
import { EVENT_CATEGORIES, type EventCategory, type EventPaymentMode } from "@event-platform/shared-types";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min, MaxLength } from "class-validator";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class PublicEventsQueryDto {
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
  limit = 12;

  @IsOptional()
  @IsIn(["recent", "popular"])
  sort: "recent" | "popular" = "recent";

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  city?: string;

  @IsOptional()
  @IsIn(EVENT_CATEGORIES)
  category?: EventCategory;

  @IsOptional()
  @IsIn(["deposit", "full_payment"])
  paymentMode?: EventPaymentMode;

  @IsOptional()
  @IsIn(["today", "weekend"])
  datePreset?: "today" | "weekend";

  @IsOptional()
  @Transform(({ value }) => value === "true" ? true : value === "false" ? false : value)
  @IsBoolean()
  free?: boolean;

  @IsOptional()
  @Matches(DATE_PATTERN)
  from?: string;

  @IsOptional()
  @Matches(DATE_PATTERN)
  to?: string;
}
