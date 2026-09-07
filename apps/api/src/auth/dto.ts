import type { TelegramLinkConsumeRequest, TelegramLoginPayload } from "@event-platform/shared-types";
import { Type } from "class-transformer";
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
} from "class-validator";

export class TelegramLoginDto implements TelegramLoginPayload {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id!: number;

  @IsString()
  @MaxLength(128)
  first_name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  last_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_048)
  photo_url?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  auth_date!: number;

  @IsString()
  @Matches(/^[a-fA-F0-9]{64}$/)
  hash!: string;
}

export class RefreshTokenDto {
  @IsString()
  @MaxLength(4_096)
  refreshToken!: string;
}

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @Length(3, 32)
  phone?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string | null;
}

export class ConsumeTelegramLinkDto implements TelegramLinkConsumeRequest {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{32,64}$/)
  token!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  telegramId!: number;

  @Type(() => Number)
  @IsInt()
  chatId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  lastName?: string;
}
