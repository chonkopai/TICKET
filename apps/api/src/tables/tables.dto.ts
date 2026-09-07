import type {
  CreateTableRequest,
  ReleaseTableHoldRequest,
  UpdateTableRequest,
} from "@event-platform/shared-types";
import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateTableDto implements CreateTableRequest {
  @IsInt() @Min(1) @Max(1_000_000) number!: number;
  @IsOptional() @IsString() @MaxLength(120) name?: string | null;
  @IsInt() @Min(1) @Max(10_000) seats!: number;
  @IsInt() @Min(0) price!: number;
  @IsInt() @Min(0) deposit!: number;
  @IsOptional() @IsString() @Matches(/^[A-Za-z]{3}$/) currency?: string;
  @IsOptional() @IsString() @MaxLength(5_000) description?: string | null;
  @IsOptional() @IsIn(["available", "unavailable"]) status?: "available" | "unavailable";
  @IsObject() geometry!: CreateTableRequest["geometry"];
}

export class UpdateTableDto implements UpdateTableRequest {
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000) number?: number;
  @IsOptional() @IsString() @MaxLength(120) name?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(10_000) seats?: number;
  @IsOptional() @IsInt() @Min(0) price?: number;
  @IsOptional() @IsInt() @Min(0) deposit?: number;
  @IsOptional() @IsString() @Matches(/^[A-Za-z]{3}$/) currency?: string;
  @IsOptional() @IsString() @MaxLength(5_000) description?: string | null;
  @IsOptional() @IsIn(["available", "unavailable"]) status?: "available" | "unavailable";
}

export class ReleaseTableHoldDto implements ReleaseTableHoldRequest {
  @IsString() @MinLength(20) @MaxLength(200) holdToken!: string;
}

export class TableListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}
