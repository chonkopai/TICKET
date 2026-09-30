import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";

export class ContactDto {
  @IsIn(["email", "phone"])
  method!: "email" | "phone";

  @IsString()
  @MaxLength(320)
  target!: string;
}

export class VerifyContactDto extends ContactDto {
  @IsUUID("4")
  challengeId!: string;

  @Matches(/^\d{6}$/)
  code!: string;
}

export class CompleteContactDto extends ContactDto {
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  grant!: string;
}

export class CompleteRegistrationDto extends CompleteContactDto {
  @IsString()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MaxLength(100)
  lastName!: string;

  @IsString()
  @MaxLength(1_024)
  password!: string;
}

export class PasswordLoginDto extends ContactDto {
  @IsString()
  @MaxLength(1_024)
  password!: string;
}

export class CompleteLinkDto extends CompleteContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(1_024)
  password?: string;
}

export class CompletePasswordResetDto extends CompleteContactDto {
  @IsString()
  @MaxLength(1_024)
  newPassword!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(1_024)
  currentPassword!: string;

  @IsString()
  @MaxLength(1_024)
  newPassword!: string;
}

export class TelegramLinkTokenDto {
  @Matches(/^[A-Za-z0-9_-]{32,64}$/)
  token!: string;
}
