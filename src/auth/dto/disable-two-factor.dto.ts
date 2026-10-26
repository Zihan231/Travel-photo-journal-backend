import { IsNotEmpty, IsString } from 'class-validator';

export class DisableTwoFactorDto {
  @IsNotEmpty({ message: 'Current account password is required' })
  @IsString({ message: 'Password must be a string' })
  password: string;

  @IsNotEmpty({ message: 'Authenticator code or recovery code is required' })
  @IsString({ message: 'Code must be a string' })
  code: string;
}
