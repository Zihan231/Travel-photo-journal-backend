import { IsEmail, IsNotEmpty } from 'class-validator';

export class ResendCodeDto {
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;
}
