import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyEmailDto {
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @IsNotEmpty({ message: 'Verification code is required' })
  @IsString({ message: 'Verification code must be a string' })
  @Length(6, 6, { message: 'Verification code must be exactly 6 digits' })
  code: string;
}
