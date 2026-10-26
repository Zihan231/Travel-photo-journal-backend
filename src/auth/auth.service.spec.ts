import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import {
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let authService: AuthService;
  let mockUsersService: any;
  let mockJwtService: any;
  let mockMailService: any;

  beforeEach(() => {
    mockUsersService = {
      findByEmail: vi.fn(),
      findByEmailWithAuthDetails: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };

    mockJwtService = {
      signAsync: vi.fn().mockResolvedValue('mock_jwt_token'),
    };

    mockMailService = {
      sendVerificationCode: vi.fn().mockResolvedValue(undefined),
    };

    authService = new AuthService(
      mockUsersService,
      mockJwtService,
      mockMailService,
    );
  });

  describe('register', () => {
    it('should throw ConflictException when email is already registered', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
      });

      await expect(
        authService.register({
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should register user with isEmailVerified: false and send verification email', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockImplementation((userData: any) => ({
        id: 1,
        ...userData,
        createdAt: new Date(),
      }));

      const result = await authService.register({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.email).toBe('test@example.com');
      expect(result.isEmailVerified).toBe(false);
      expect(mockMailService.sendVerificationCode).toHaveBeenCalledTimes(1);
      expect(mockMailService.sendVerificationCode).toHaveBeenCalledWith(
        'test@example.com',
        expect.stringMatching(/^\d{6}$/),
      );
    });
  });

  describe('login', () => {
    it('should throw UnauthorizedException if user is not found', async () => {
      mockUsersService.findByEmailWithAuthDetails.mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'notfound@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if password does not match', async () => {
      const hashedPassword = await bcrypt.hash('correct_password', 10);
      mockUsersService.findByEmailWithAuthDetails.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        password: hashedPassword,
        isEmailVerified: true,
      });

      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'wrong_password',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException if email is not verified', async () => {
      const plainPassword = 'password123';
      const hashedPassword = await bcrypt.hash(plainPassword, 10);
      mockUsersService.findByEmailWithAuthDetails.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        password: hashedPassword,
        isEmailVerified: false,
      });

      await expect(
        authService.login({
          email: 'test@example.com',
          password: plainPassword,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should successfully login when email is verified and return token', async () => {
      const plainPassword = 'password123';
      const hashedPassword = await bcrypt.hash(plainPassword, 10);
      mockUsersService.findByEmailWithAuthDetails.mockResolvedValue({
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        password: hashedPassword,
        isEmailVerified: true,
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

  describe('verifyEmail', () => {
    it('should throw BadRequestException if code is expired', async () => {
      mockUsersService.findByEmailWithAuthDetails.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        isEmailVerified: false,
        verificationCode: '123456',
        codeExpiresAt: new Date(Date.now() - 10000), // expired 10s ago
        verificationAttempts: 0,
      });

      await expect(
        authService.verifyEmail({
          email: 'test@example.com',
          code: '123456',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should increment attempts and throw when code is incorrect', async () => {
      mockUsersService.findByEmailWithAuthDetails.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        isEmailVerified: false,
        verificationCode: '123456',
        codeExpiresAt: new Date(Date.now() + 60000),
        verificationAttempts: 2,
      });

      await expect(
        authService.verifyEmail({
          email: 'test@example.com',
          code: '999999',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockUsersService.update).toHaveBeenCalledWith(1, {
        verificationAttempts: 3,
      });
    });

    it('should invalidate code when attempts reach limit of 5', async () => {
      mockUsersService.findByEmailWithAuthDetails.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        isEmailVerified: false,
        verificationCode: '123456',
        codeExpiresAt: new Date(Date.now() + 60000),
        verificationAttempts: 4,
      });

      await expect(
        authService.verifyEmail({
          email: 'test@example.com',
          code: '999999',
        }),
      ).rejects.toThrow(/Maximum attempts reached/i);

      expect(mockUsersService.update).toHaveBeenCalledWith(1, {
        verificationCode: null,
        codeExpiresAt: null,
        verificationAttempts: 5,
      });
    });

    it('should successfully verify email when code matches', async () => {
      mockUsersService.findByEmailWithAuthDetails.mockResolvedValue({
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        isEmailVerified: false,
        verificationCode: '123456',
        codeExpiresAt: new Date(Date.now() + 60000),
        verificationAttempts: 1,
      });

      const result = await authService.verifyEmail({
        email: 'test@example.com',
        code: '123456',
      });

      expect(mockUsersService.update).toHaveBeenCalledWith(1, {
        isEmailVerified: true,
        verificationCode: null,
        codeExpiresAt: null,
        verificationAttempts: 0,
      });
      expect(result).toHaveProperty('access_token', 'mock_jwt_token');
      expect(result.user.isEmailVerified).toBe(true);
    });
  });

  describe('resendCode', () => {
    it('should enforce 60-second cooldown', async () => {
      mockUsersService.findByEmailWithAuthDetails.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        isEmailVerified: false,
        lastCodeSentAt: new Date(Date.now() - 20000), // only 20 seconds ago
      });

      await expect(
        authService.resendCode({ email: 'test@example.com' }),
      ).rejects.toThrow(/Please wait/i);
    });

    it('should allow resend after 60 seconds have elapsed', async () => {
      mockUsersService.findByEmailWithAuthDetails.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        isEmailVerified: false,
        lastCodeSentAt: new Date(Date.now() - 65000), // 65 seconds ago
      });

      const result = await authService.resendCode({ email: 'test@example.com' });

      expect(mockUsersService.update).toHaveBeenCalledTimes(1);
      expect(mockMailService.sendVerificationCode).toHaveBeenCalledTimes(1);
      expect(result.message).toContain('verification code has been sent');
    });
  });
});
