import { IsNotEmpty, IsString } from 'class-validator';

export class CreatePhotoDto {
  @IsNotEmpty({ message: 'Name is required' })
  @IsString({ message: 'Name must be a string' })
  name: string;

  @IsNotEmpty({ message: 'Location is required' })
  @IsString({ message: 'Location must be a string' })
  location: string;

  @IsNotEmpty({ message: 'Description is required' })
  @IsString({ message: 'Description must be a string' })
  description: string;
}
