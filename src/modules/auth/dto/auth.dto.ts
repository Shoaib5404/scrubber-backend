import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  password!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}

export class IssueApiTokenDto {
  @ApiProperty()
  @IsString()
  client_id!: string;

  @ApiProperty()
  @IsString()
  client_secret!: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  token!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password_confirmation!: string;
}

export class AcceptInviteDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  token!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password_confirmation!: string;
}

export class ConfirmPasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  password!: string;
}

export class VerifyEmailDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  id!: number;

  @ApiProperty()
  @IsString()
  hash!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  expires!: number;

  @ApiProperty()
  @IsString()
  signature!: string;
}

export class UpdateProfileDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;
}

export class UpdatePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  current_password!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password_confirmation!: string;
}

export class DeleteProfileDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  password!: string;
}
