import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Photo } from './entities/photo.entity.js';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import { CreatePhotoDto } from './dto/create-photo.dto.js';
import { UpdatePhotoDto } from './dto/update-photo.dto.js';

@Injectable()
export class PhotosService {
  private readonly allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/jpg',
    'image/gif',
  ];

  constructor(
    @InjectRepository(Photo)
    private readonly photoRepository: Repository<Photo>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async findAll(userId: number): Promise<Photo[]> {
    return await this.photoRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number, userId: number): Promise<Photo> {
    const photo = await this.photoRepository.findOne({
      where: { id, userId },
    });

    if (!photo) {
      throw new NotFoundException(`Photo with ID ${id} not found`);
    }

    return photo;
  }

  async create(
    userId: number,
    createPhotoDto: CreatePhotoDto,
    file?: Express.Multer.File,
  ): Promise<Photo> {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }

    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Only JPEG, PNG, WebP, and GIF images are allowed.',
      );
    }

    const { secureUrl, publicId } =
      await this.cloudinaryService.uploadImage(file, userId);

    const photo = this.photoRepository.create({
      name: createPhotoDto.name,
      location: createPhotoDto.location,
      description: createPhotoDto.description,
      imageUrl: secureUrl,
      cloudinaryPublicId: publicId,
      userId,
    });

    return await this.photoRepository.save(photo);
  }

  async update(
    id: number,
    userId: number,
    updatePhotoDto: UpdatePhotoDto,
    file?: Express.Multer.File,
  ): Promise<Photo> {
    const photo = await this.findOne(id, userId);

    if (file) {
      if (!this.allowedMimeTypes.includes(file.mimetype)) {
        throw new BadRequestException(
          'Invalid file type. Only JPEG, PNG, WebP, and GIF images are allowed.',
        );
      }

      const oldPublicId = photo.cloudinaryPublicId;
      const { secureUrl, publicId } =
        await this.cloudinaryService.uploadImage(file, userId);

      photo.imageUrl = secureUrl;
      photo.cloudinaryPublicId = publicId;

      if (oldPublicId) {
        await this.cloudinaryService.deleteImage(oldPublicId);
      }
    }

    if (updatePhotoDto.name !== undefined) {
      photo.name = updatePhotoDto.name;
    }
    if (updatePhotoDto.location !== undefined) {
      photo.location = updatePhotoDto.location;
    }
    if (updatePhotoDto.description !== undefined) {
      photo.description = updatePhotoDto.description;
    }

    return await this.photoRepository.save(photo);
  }

  async remove(id: number, userId: number): Promise<{ message: string }> {
    const photo = await this.findOne(id, userId);

    if (photo.cloudinaryPublicId) {
      await this.cloudinaryService.deleteImage(photo.cloudinaryPublicId);
    }

    await this.photoRepository.remove(photo);

    return { message: 'Photo and its stored file deleted successfully' };
  }
}
