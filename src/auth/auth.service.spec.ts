import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let authService: AuthService;
  let mockUsersService: any;
  let mockJwtService: any;

  beforeEach(() => {
    mockUsersService = {
      findByEmail: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
    };

    mockJwtService = {
      signAsync: vi.fn().mockResolvedValue('mock_jwt_token'),
    };

    authService = new AuthService(mockUsersService, mockJwtService);
  });

  describe('register', () => {
    it('should throw ConflictException when email is already registered', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ id: 1, email: 'test@example.com' });

      await expect(
        authService.register({
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should successfully register a new user and return token', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        createdAt: new Date(),
      });

      const result = await authService.register({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result).toHaveProperty('access_token', 'mock_jwt_token');
      expect(result).toHaveProperty('token_type', 'Bearer');
      expect(result.user.email).toBe('test@example.com');
    });
  });

  describe('login', () => {
    it('should throw UnauthorizedException if user is not found', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'notfound@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if password does not match', async () => {
      const hashedPassword = await bcrypt.hash('correct_password', 10);
      mockUsersService.findByEmail.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        password: hashedPassword,
      });

      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'wrong_password',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should successfully login and return access token', async () => {
      const plainPassword = 'password123';
      const hashedPassword = await bcrypt.hash(plainPassword, 10);
      mockUsersService.findByEmail.mockResolvedValue({
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        password: hashedPassword,
        bio: null,
        avatar: null,
      });

      const result = await authService.login({
        email: 'test@example.com',
        password: plainPassword,
      });

      expect(result).toHaveProperty('access_token', 'mock_jwt_token');
      expect(result).toHaveProperty('token_type', 'Bearer');
      expect(result.user.id).toBe(1);
    });
  });
});
