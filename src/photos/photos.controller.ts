import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PhotosService } from './photos.service.js';
import { CreatePhotoDto } from './dto/create-photo.dto.js';
import { UpdatePhotoDto } from './dto/update-photo.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { User } from '../users/entities/user.entity.js';

@Controller('photos')
@UseGuards(JwtAuthGuard)
export class PhotosController {
  constructor(private readonly photosService: PhotosService) {}

  @Get()
  async findAll(@CurrentUser() user: User) {
    return await this.photosService.findAll(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('image'))
  async create(
    @CurrentUser() user: User,
    @Body() createPhotoDto: CreatePhotoDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return await this.photosService.create(user.id, createPhotoDto, file);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return await this.photosService.findOne(id, user.id);
  }

  @Put(':id')
  @UseInterceptors(FileInterceptor('image'))
  async update(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePhotoDto: UpdatePhotoDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return await this.photosService.update(id, user.id, updatePhotoDto, file);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return await this.photosService.remove(id, user.id);
  }
}
