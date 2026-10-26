import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Photo } from './entities/photo.entity.js';
import { PhotosService } from './photos.service.js';
import { PhotosController } from './photos.controller.js';
import { CloudinaryModule } from '../cloudinary/cloudinary.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([Photo]), CloudinaryModule],
  controllers: [PhotosController],
  providers: [PhotosService],
  exports: [PhotosService],
})
export class PhotosModule {}
