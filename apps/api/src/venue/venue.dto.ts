import type {
  ApplyVenueTemplateRequest,
  CreateVenueLayoutRequest,
  CreateVenueTemplateRequest,
  UpdateVenueLayoutRequest,
  VenueLayoutAny,
} from "@event-platform/shared-types";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from "class-validator";

export class CreateVenueLayoutDto implements CreateVenueLayoutRequest {
  @IsOptional() @IsString() @MaxLength(120) templateName?: string;
  @IsOptional() @IsObject() layoutJson?: VenueLayoutAny;
}

export class UpdateVenueLayoutDto implements UpdateVenueLayoutRequest {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) templateName?: string;
  @IsOptional() @IsObject() layoutJson?: VenueLayoutAny;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) revision?: number;
}

export class CreateVenueTemplateDto implements CreateVenueTemplateRequest {
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(3000) @IsUUID("4", { each: true }) objectIds?: string[];
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
}

export class ApplyVenueTemplateDto implements ApplyVenueTemplateRequest {
  @IsUUID("4") templateId!: string;
}

export class VenueListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
}
