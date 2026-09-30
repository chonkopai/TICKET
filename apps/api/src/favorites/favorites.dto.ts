import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";
import { EVENT_LOCALES, type EventLocale } from "@event-platform/shared-types";

export class FavoritesQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
  @IsOptional() @IsIn(EVENT_LOCALES) locale?: EventLocale;
}
