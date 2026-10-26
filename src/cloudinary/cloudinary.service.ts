import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'node:stream';

export interface CloudinaryUploadResult {
  secureUrl: string;
  publicId: string;
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(private readonly configService: ConfigService) {
    const cloudName =
      this.configService.get<string>('CLOUDINARY_CLOUD_NAME') ||
      this.configService.get<string>('CLOUD_NAME');

    const apiKey =
      this.configService.get<string>('CLOUDINARY_API_KEY') ||
      this.configService.get<string>('API_KEY');

    const apiSecret =
      this.configService.get<string>('CLOUDINARY_API_SECRET') ||
      this.configService.get<string>('API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      this.logger.warn(
        'Cloudinary credentials are not fully configured. File uploads might fail.',
      );
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
  }

  async uploadImage(
    file: Express.Multer.File,
    userId: number,
  ): Promise<CloudinaryUploadResult> {
    const folder = `travel-photo-journal/user_${userId}`;

    return new Promise<CloudinaryUploadResult>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
        },
        (error, result: UploadApiResponse | undefined) => {
          if (error || !result) {
            this.logger.error(
              `Cloudinary upload failed: ${error?.message || 'Unknown error'}`,
            );
            return reject(
              new InternalServerErrorException(
                error?.message || 'Failed to upload image to Cloudinary',
              ),
            );
          }

          resolve({
            secureUrl: result.secure_url,
            publicId: result.public_id,
          });
        },
      );

      Readable.from(file.buffer).pipe(uploadStream);
    });
  }

  async deleteImage(publicId: string): Promise<void> {
    if (!publicId) return;

    try {
      await cloudinary.uploader.destroy(publicId);
      this.logger.log(`Cloudinary asset deleted: ${publicId}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to delete Cloudinary asset ${publicId}: ${error?.message}`,
      );
    }
  }
}
