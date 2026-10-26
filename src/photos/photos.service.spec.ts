import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PhotosService } from './photos.service.js';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('PhotosService', () => {
  let photosService: PhotosService;
  let mockPhotoRepository: any;
  let mockCloudinaryService: any;

  beforeEach(() => {
    mockPhotoRepository = {
      find: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
    };

    mockCloudinaryService = {
      uploadImage: vi.fn().mockResolvedValue({
        secureUrl: 'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg',
        publicId: 'travel-photo-journal/user_1/sample_id',
      }),
      deleteImage: vi.fn().mockResolvedValue(undefined),
    };

    photosService = new PhotosService(
      mockPhotoRepository,
      mockCloudinaryService,
    );
  });

  describe('findAll', () => {
    it('should query only photos belonging to the authenticated userId', async () => {
      const mockPhotos = [
        { id: 1, name: 'Paris Trip', userId: 1 },
        { id: 2, name: 'Tokyo Adventure', userId: 1 },
      ];
      mockPhotoRepository.find.mockResolvedValue(mockPhotos);

      const result = await photosService.findAll(1);

      expect(mockPhotoRepository.find).toHaveBeenCalledWith({
        where: { userId: 1 },
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual(mockPhotos);
    });
  });

  describe('findOne', () => {
    it('should return photo if it belongs to the authenticated user', async () => {
      const mockPhoto = { id: 10, name: 'Rome Tour', userId: 1 };
      mockPhotoRepository.findOne.mockResolvedValue(mockPhoto);

      const result = await photosService.findOne(10, 1);

      expect(mockPhotoRepository.findOne).toHaveBeenCalledWith({
        where: { id: 10, userId: 1 },
      });
      expect(result).toEqual(mockPhoto);
    });

    it('should throw NotFoundException if photo does not exist or belongs to another user', async () => {
      mockPhotoRepository.findOne.mockResolvedValue(null);

      await expect(photosService.findOne(999, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should throw BadRequestException if file is missing', async () => {
      await expect(
        photosService.create(1, {
          name: 'Beach',
          location: 'Bali',
          description: 'Fun day',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if file is not an allowed image format', async () => {
      const mockFile = {
        mimetype: 'application/pdf',
        buffer: Buffer.from('dummy'),
      } as Express.Multer.File;

      await expect(
        photosService.create(
          1,
          { name: 'Doc', location: 'Office', description: 'Test' },
          mockFile,
        ),
      ).rejects.toThrow(/Invalid file type/);
    });

    it('should upload image to Cloudinary and save photo in database', async () => {
      const mockFile = {
        mimetype: 'image/jpeg',
        buffer: Buffer.from('fake-image-bytes'),
      } as Express.Multer.File;

      mockPhotoRepository.create.mockImplementation((data: any) => data);
      mockPhotoRepository.save.mockImplementation(async (data: any) => ({
        id: 1,
        ...data,
      }));

      const result = await photosService.create(
        1,
        {
          name: 'Bali Sunset',
          location: 'Seminyak, Bali',
          description: 'Sunset on the beach',
        },
        mockFile,
      );

      expect(mockCloudinaryService.uploadImage).toHaveBeenCalledWith(mockFile, 1);
      expect(result.userId).toBe(1);
      expect(result.imageUrl).toBe(
        'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg',
      );
      expect(result.cloudinaryPublicId).toBe(
        'travel-photo-journal/user_1/sample_id',
      );
    });
  });

  describe('update', () => {
    it('should update metadata without replacing image if no file provided', async () => {
      const existingPhoto = {
        id: 1,
        name: 'Old Name',
        location: 'Old Loc',
        description: 'Old Desc',
        imageUrl: 'https://img.jpg',
        cloudinaryPublicId: 'public_1',
        userId: 1,
      };
      mockPhotoRepository.findOne.mockResolvedValue(existingPhoto);
      mockPhotoRepository.save.mockImplementation(async (entity: any) => entity);

      const result = await photosService.update(1, 1, {
        name: 'Updated Name',
      });

      expect(result.name).toBe('Updated Name');
      expect(mockCloudinaryService.uploadImage).not.toHaveBeenCalled();
      expect(mockCloudinaryService.deleteImage).not.toHaveBeenCalled();
    });

    it('should replace image in Cloudinary and update photo if new file provided', async () => {
      const existingPhoto = {
        id: 1,
        name: 'Photo',
        location: 'Loc',
        description: 'Desc',
        imageUrl: 'https://old.jpg',
        cloudinaryPublicId: 'old_public_id',
        userId: 1,
      };
      mockPhotoRepository.findOne.mockResolvedValue(existingPhoto);
      mockPhotoRepository.save.mockImplementation(async (entity: any) => entity);

      const newFile = {
        mimetype: 'image/png',
        buffer: Buffer.from('new-image'),
      } as Express.Multer.File;

      const result = await photosService.update(1, 1, {}, newFile);

      expect(mockCloudinaryService.uploadImage).toHaveBeenCalledWith(newFile, 1);
      expect(mockCloudinaryService.deleteImage).toHaveBeenCalledWith(
        'old_public_id',
      );
      expect(result.cloudinaryPublicId).toBe(
        'travel-photo-journal/user_1/sample_id',
      );
    });
  });

  describe('remove', () => {
    it('should delete Cloudinary asset and remove database record', async () => {
      const existingPhoto = {
        id: 1,
        cloudinaryPublicId: 'sample_public_id',
        userId: 1,
      };
      mockPhotoRepository.findOne.mockResolvedValue(existingPhoto);
      mockPhotoRepository.remove.mockResolvedValue(existingPhoto);

      const result = await photosService.remove(1, 1);

      expect(mockCloudinaryService.deleteImage).toHaveBeenCalledWith(
        'sample_public_id',
      );
      expect(mockPhotoRepository.remove).toHaveBeenCalledWith(existingPhoto);
      expect(result.message).toContain('deleted successfully');
    });

    it('should throw NotFoundException when trying to delete photo belonging to another user', async () => {
      mockPhotoRepository.findOne.mockResolvedValue(null);

      await expect(photosService.remove(99, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
