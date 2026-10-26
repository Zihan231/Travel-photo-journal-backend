import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class TwoFactorCodeDto {
  @IsNotEmpty({ message: 'Authenticator code is required' })
  @IsString({ message: 'Code must be a string' })
  @Matches(/^\d{6}$/, {
    message: 'Authenticator code must be a 6-digit number',
  })
  code: string;
}
