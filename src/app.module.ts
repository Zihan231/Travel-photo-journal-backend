import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { User } from './users/entities/user.entity.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const rawDbName =
          configService.get<string>('DbName') ||
          configService.get<string>('DB_NAME');

        if (!rawDbName) {
          throw new Error('Database name (DbName / DB_NAME) is not defined in environment variables');
        }

        const cleanDbName = rawDbName.replace(/^Database:\s*/i, '').trim();

        const host =
          configService.get<string>('Host') ||
          configService.get<string>('DB_HOST');

        if (!host) {
          throw new Error('Database host (Host / DB_HOST) is not defined in environment variables');
        }

        const username =
          configService.get<string>('User') ||
          configService.get<string>('DB_USERNAME');

        if (!username) {
          throw new Error('Database user (User / DB_USERNAME) is not defined in environment variables');
        }

        const password =
          configService.get<string>('Password') ??
          configService.get<string>('DB_PASSWORD') ??
          '';

        const port = parseInt(
          configService.get<string>('DB_PORT') || '3306',
          10,
        );

        return {
          type: 'mysql',
          host,
          port,
          username,
          password,
          database: cleanDbName,
          entities: [User],
          synchronize: true,
        };
      },
    }),
    UsersModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
