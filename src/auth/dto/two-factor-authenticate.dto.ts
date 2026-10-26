import { IsNotEmpty, IsString } from 'class-validator';

export class TwoFactorAuthenticateDto {
  @IsNotEmpty({ message: 'Two-factor token is required' })
  @IsString({ message: 'Two-factor token must be a string' })
  twoFactorToken: string;

  @IsNotEmpty({ message: 'Code or recovery code is required' })
  @IsString({ message: 'Code must be a string' })
  code: string;
}
