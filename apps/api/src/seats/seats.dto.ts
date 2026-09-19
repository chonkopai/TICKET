import type { CreateTableSeatsRequest, CreateVenueRowRequest, UpdateVenueRowRequest } from "@event-platform/shared-types";
import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from "class-validator";

export class CreateTableSeatsDto implements CreateTableSeatsRequest {
  @IsArray() @IsInt({ each: true }) @Min(1, { each: true }) @Max(1_000_000, { each: true }) numbers!: number[];
  @IsOptional() @IsUUID("4") ticketTypeId?: string | null;
}

export class CreateVenueRowDto {
  @IsInt() @Min(1) @Max(100_000) number!: number;
  @IsOptional() @IsString() @MaxLength(120) name?: string | null;
  @IsOptional() @IsString() @MaxLength(40) typeLabel?: string | null;
  @IsOptional() @IsString() @MaxLength(200) shortDescription?: string | null;
  @IsInt() @Min(0) price!: number;
  @IsInt() @Min(0) deposit!: number;
  @IsOptional() @IsString() @Matches(/^[A-Za-z]{3}$/) currency?: string;
  @IsInt() @Min(1) @Max(100) seatCount!: number;
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000) startSeatNumber?: number;
  @IsOptional() @IsObject() geometry?: CreateVenueRowRequest["geometry"] | undefined;
  @IsOptional() @IsUUID("4") ticketTypeId?: string | null;
  @IsOptional() @IsIn(["available", "unavailable"]) status?: "available" | "unavailable";
}

export class UpdateVenueRowDto implements UpdateVenueRowRequest {
  @IsOptional() @IsInt() @Min(1) @Max(100_000) number?: number;
  @IsOptional() @IsString() @MaxLength(120) name?: string | null;
  @IsOptional() @IsString() @MaxLength(40) typeLabel?: string | null;
  @IsOptional() @IsString() @MaxLength(200) shortDescription?: string | null;
  @IsOptional() @IsInt() @Min(0) price?: number;
  @IsOptional() @IsInt() @Min(0) deposit?: number;
  @IsOptional() @IsString() @Matches(/^[A-Za-z]{3}$/) currency?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) seatCount?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000) startSeatNumber?: number;
  @IsOptional() @IsUUID("4") ticketTypeId?: string | null;
  @IsOptional() @IsIn(["available", "unavailable"]) status?: "available" | "unavailable";
}
