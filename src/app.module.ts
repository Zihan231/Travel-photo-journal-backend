import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { MailModule } from './mail/mail.module.js';
import { PhotosModule } from './photos/photos.module.js';
import { CloudinaryModule } from './cloudinary/cloudinary.module.js';
import { AiModule } from './ai/ai.module.js';
import { User } from './users/entities/user.entity.js';
import { Photo } from './photos/entities/photo.entity.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV
        ? [
            `.env.${process.env.NODE_ENV}.local`,
            `.env.${process.env.NODE_ENV}`,
            '.env',
          ]
        : ['.env.local', '.env'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbUrl =
          configService.get<string>('DATABASE_URL') ||
          configService.get<string>('DB_URL');

        if (dbUrl) {
          // If the connection string points to restricted MySQL 'sys' schema, route to 'travel_photo_journal'
          const targetUrl = dbUrl.replace(
            /\/sys(\?.*)?$/i,
            '/travel_photo_journal$1',
          );

          const useSsl =
            configService.get<string>('DB_SSL') === 'true' ||
            targetUrl.includes('tidbcloud.com');

          const ssl = useSsl
            ? {
                minVersion: 'TLSv1.2',
                rejectUnauthorized: true,
              }
            : undefined;

          return {
            type: 'mysql',
            url: targetUrl,
            ssl,
            entities: [User, Photo],
            synchronize: true,
          };
        }

        const rawDbName =
          configService.get<string>('DB_DATABASE') ||
          configService.get<string>('DB_NAME') ||
          configService.get<string>('DbName');

        if (!rawDbName) {
          throw new Error(
            'Database name (DB_NAME / DB_DATABASE) is not defined in environment variables',
          );
        }

        const cleanDbName = rawDbName.replace(/^Database:\s*/i, '').trim();

        const host =
          configService.get<string>('DB_HOST') ||
          configService.get<string>('Host');

        if (!host) {
          throw new Error(
            'Database host (DB_HOST / Host) is not defined in environment variables',
          );
        }

        const username =
          configService.get<string>('DB_USERNAME') ||
          configService.get<string>('DB_USER') ||
          configService.get<string>('User');

        if (!username) {
          throw new Error(
            'Database user (DB_USER / DB_USERNAME) is not defined in environment variables',
          );
        }

        const password =
          configService.get<string>('DB_PASSWORD') ??
          configService.get<string>('Password') ??
          '';

        const port = parseInt(
          configService.get<string>('DB_PORT') || '3306',
          10,
        );

        const useSsl =
          configService.get<string>('DB_SSL') === 'true' ||
          host.includes('tidbcloud.com');

        const ssl = useSsl
          ? {
              minVersion: 'TLSv1.2',
              rejectUnauthorized: true,
            }
          : undefined;

        return {
          type: 'mysql',
          host,
          port,
          username,
          password,
          database: cleanDbName,
          ssl,
          entities: [User, Photo],
          synchronize: true,
        };
      },
    }),
    UsersModule,
    AuthModule,
    MailModule,
    CloudinaryModule,
    PhotosModule,
    AiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
