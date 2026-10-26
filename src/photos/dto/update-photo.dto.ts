import { IsOptional, IsString } from 'class-validator';

export class UpdatePhotoDto {
  @IsOptional()
  @IsString({ message: 'Name must be a string' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'Location must be a string' })
  location?: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;
}
