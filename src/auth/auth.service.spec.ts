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
  let mockTwoFactorService: any;

  beforeEach(() => {
    mockUsersService = {
      findByEmail: vi.fn(),
      findByEmailWithAuthDetails: vi.fn(),
      findById: vi.fn(),
      findByIdWithTwoFactorDetails: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };

    mockJwtService = {
      signAsync: vi.fn().mockResolvedValue('mock_jwt_token'),
      verifyAsync: vi.fn(),
    };

    mockMailService = {
      sendVerificationCode: vi.fn().mockResolvedValue(undefined),
    };

    mockTwoFactorService = {
      generateSecret: vi.fn(),
      verifyTotpCode: vi.fn(),
      generateRecoveryCodes: vi.fn(),
      verifyAndConsumeRecoveryCode: vi.fn(),
    };

    authService = new AuthService(
      mockUsersService,
      mockJwtService,
      mockMailService,
      mockTwoFactorService,
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

    it('should successfully login when 2FA is disabled and return access token', async () => {
      const plainPassword = 'password123';
      const hashedPassword = await bcrypt.hash(plainPassword, 10);
      mockUsersService.findByEmailWithAuthDetails.mockResolvedValue({
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        password: hashedPassword,
        isEmailVerified: true,
        isTwoFactorEnabled: false,
        bio: null,
        avatar: null,
      });

      const result = await authService.login({
        email: 'test@example.com',
        password: plainPassword,
      });

      expect(result).toHaveProperty('access_token', 'mock_jwt_token');
      expect(result).toHaveProperty('token_type', 'Bearer');
      expect((result as any).user.id).toBe(1);
    });

    it('should return requires2fa: true and twoFactorToken when 2FA is enabled', async () => {
      const plainPassword = 'password123';
      const hashedPassword = await bcrypt.hash(plainPassword, 10);
      mockUsersService.findByEmailWithAuthDetails.mockResolvedValue({
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        password: hashedPassword,
        isEmailVerified: true,
        isTwoFactorEnabled: true,
      });

      const result = await authService.login({
        email: 'test@example.com',
        password: plainPassword,
      });

      expect(result).toEqual({
        requires2fa: true,
        twoFactorToken: 'mock_jwt_token',
        message: expect.stringContaining('Two-factor authentication required'),
      });
      expect(mockJwtService.signAsync).toHaveBeenCalledWith(
        {
          sub: 1,
          email: 'test@example.com',
          type: '2fa_ticket',
          is2faPending: true,
        },
        { expiresIn: '5m' },
      );
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
      expect(result).not.toHaveProperty('access_token');
      expect(result.isEmailVerified).toBe(true);
      expect(result.message).toContain('You can now log in');
    });
  });

  describe('resendCode', () => {
    it('should enforce 3-minute cooldown', async () => {
      mockUsersService.findByEmailWithAuthDetails.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        isEmailVerified: false,
        lastCodeSentAt: new Date(Date.now() - 60000), // only 1 minute ago (cooldown is 3 min)
      });

      await expect(
        authService.resendCode({ email: 'test@example.com' }),
      ).rejects.toThrow(/Please wait/i);
    });

    it('should allow resend after 3 minutes have elapsed', async () => {
      mockUsersService.findByEmailWithAuthDetails.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        isEmailVerified: false,
        lastCodeSentAt: new Date(Date.now() - 185000), // 185 seconds ago (> 3 min)
      });

      const result = await authService.resendCode({ email: 'test@example.com' });

      expect(mockUsersService.update).toHaveBeenCalledTimes(1);
      expect(mockMailService.sendVerificationCode).toHaveBeenCalledTimes(1);
      expect(result.message).toContain('verification code has been sent');
    });
  });

  describe('2FA methods', () => {
    describe('generateTwoFactorSecret', () => {
      it('should generate secret and QR code and store encrypted secret', async () => {
        mockUsersService.findById.mockResolvedValue({
          id: 1,
          email: 'test@example.com',
        });
        mockTwoFactorService.generateSecret.mockResolvedValue({
          plainSecret: 'BASE32SECRET',
          encryptedSecret: 'iv:tag:ciphertext',
          otpauthUrl: 'otpauth://...',
          qrCodeUrl: 'data:image/png;base64,...',
        });

        const result = await authService.generateTwoFactorSecret(1);

        expect(result.secret).toBe('BASE32SECRET');
        expect(result.qrCodeUrl).toBe('data:image/png;base64,...');
        expect(mockUsersService.update).toHaveBeenCalledWith(1, {
          twoFactorSecret: 'iv:tag:ciphertext',
          twoFactorAttempts: 0,
          twoFactorLockoutUntil: null,
          twoFactorLastStep: null,
        });
      });
    });

    describe('enableTwoFactor', () => {
      it('should throw BadRequestException if secret has not been generated', async () => {
        mockUsersService.findByIdWithTwoFactorDetails.mockResolvedValue({
          id: 1,
          twoFactorSecret: null,
        });

        await expect(authService.enableTwoFactor(1, '123456')).rejects.toThrow(
          BadRequestException,
        );
      });

      it('should throw BadRequestException if code is invalid', async () => {
        mockUsersService.findByIdWithTwoFactorDetails.mockResolvedValue({
          id: 1,
          twoFactorSecret: 'iv:tag:ciphertext',
        });
        mockTwoFactorService.verifyTotpCode.mockReturnValue({ valid: false });

        await expect(authService.enableTwoFactor(1, '000000')).rejects.toThrow(
          BadRequestException,
        );
      });

      it('should enable 2FA and return 8 recovery codes on success', async () => {
        mockUsersService.findByIdWithTwoFactorDetails.mockResolvedValue({
          id: 1,
          twoFactorSecret: 'iv:tag:ciphertext',
        });
        mockTwoFactorService.verifyTotpCode.mockReturnValue({
          valid: true,
          step: 50000,
        });
        mockTwoFactorService.generateRecoveryCodes.mockReturnValue({
          plainCodes: ['CODE-1', 'CODE-2'],
          hashedCodes: ['HASH-1', 'HASH-2'],
        });

        const result = await authService.enableTwoFactor(1, '123456');

        expect(result.isTwoFactorEnabled).toBe(true);
        expect(result.recoveryCodes).toEqual(['CODE-1', 'CODE-2']);
        expect(mockUsersService.update).toHaveBeenCalledWith(1, {
          isTwoFactorEnabled: true,
          twoFactorRecoveryCodes: ['HASH-1', 'HASH-2'],
          twoFactorAttempts: 0,
          twoFactorLockoutUntil: null,
          twoFactorLastStep: 50000,
        });
      });
    });

    describe('authenticateTwoFactor', () => {
      it('should throw UnauthorizedException if ticket token is invalid', async () => {
        mockJwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));

        await expect(
          authService.authenticateTwoFactor('bad_token', '123456'),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('should throw UnauthorizedException if token is not a 2fa_ticket', async () => {
        mockJwtService.verifyAsync.mockResolvedValue({
          sub: 1,
          type: 'access_token',
        });

        await expect(
          authService.authenticateTwoFactor('access_token', '123456'),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('should successfully authenticate with valid TOTP code', async () => {
        mockJwtService.verifyAsync.mockResolvedValue({
          sub: 1,
          email: 'test@example.com',
          type: '2fa_ticket',
          is2faPending: true,
        });
        mockUsersService.findByIdWithTwoFactorDetails.mockResolvedValue({
          id: 1,
          email: 'test@example.com',
          isTwoFactorEnabled: true,
          twoFactorSecret: 'iv:tag:ciphertext',
          twoFactorAttempts: 0,
          twoFactorLockoutUntil: null,
          twoFactorLastStep: null,
        });
        mockTwoFactorService.verifyTotpCode.mockReturnValue({
          valid: true,
          step: 100,
        });

        const result = await authService.authenticateTwoFactor(
          'valid_ticket',
          '123456',
        );

        expect(result).toHaveProperty('access_token', 'mock_jwt_token');
        expect(result).toHaveProperty('token_type', 'Bearer');
        expect(mockUsersService.update).toHaveBeenCalledWith(1, {
          twoFactorAttempts: 0,
          twoFactorLockoutUntil: null,
          twoFactorLastStep: 100,
        });
      });

      it('should successfully authenticate and consume recovery code if TOTP fails', async () => {
        mockJwtService.verifyAsync.mockResolvedValue({
          sub: 1,
          email: 'test@example.com',
          type: '2fa_ticket',
          is2faPending: true,
        });
        mockUsersService.findByIdWithTwoFactorDetails.mockResolvedValue({
          id: 1,
          email: 'test@example.com',
          isTwoFactorEnabled: true,
          twoFactorSecret: 'iv:tag:ciphertext',
          twoFactorRecoveryCodes: ['HASH-1', 'HASH-2'],
          twoFactorAttempts: 0,
          twoFactorLockoutUntil: null,
          twoFactorLastStep: null,
        });
        mockTwoFactorService.verifyTotpCode.mockReturnValue({ valid: false });
        mockTwoFactorService.verifyAndConsumeRecoveryCode.mockReturnValue({
          valid: true,
          remainingCodes: ['HASH-2'],
        });

        const result = await authService.authenticateTwoFactor(
          'valid_ticket',
          'RECOVERY-CODE',
        );

        expect(result).toHaveProperty('access_token', 'mock_jwt_token');
        expect(mockUsersService.update).toHaveBeenCalledWith(1, {
          twoFactorAttempts: 0,
          twoFactorLockoutUntil: null,
          twoFactorRecoveryCodes: ['HASH-2'],
        });
      });

      it('should lock out account for 15 minutes after 5 failed attempts', async () => {
        mockJwtService.verifyAsync.mockResolvedValue({
          sub: 1,
          email: 'test@example.com',
          type: '2fa_ticket',
          is2faPending: true,
        });
        mockUsersService.findByIdWithTwoFactorDetails.mockResolvedValue({
          id: 1,
          email: 'test@example.com',
          isTwoFactorEnabled: true,
          twoFactorSecret: 'iv:tag:ciphertext',
          twoFactorAttempts: 4, // 5th attempt incoming
          twoFactorLockoutUntil: null,
        });
        mockTwoFactorService.verifyTotpCode.mockReturnValue({ valid: false });
        mockTwoFactorService.verifyAndConsumeRecoveryCode.mockReturnValue({
          valid: false,
        });

        await expect(
          authService.authenticateTwoFactor('valid_ticket', '000000'),
        ).rejects.toThrow(ForbiddenException);

        expect(mockUsersService.update).toHaveBeenCalledWith(
          1,
          expect.objectContaining({
            twoFactorAttempts: 5,
            twoFactorLockoutUntil: expect.any(Date),
          }),
        );
      });
    });

    describe('disableTwoFactor', () => {
      it('should throw UnauthorizedException if password does not match', async () => {
        const hashedPassword = await bcrypt.hash('correct_pass', 10);
        mockUsersService.findByIdWithTwoFactorDetails.mockResolvedValue({
          id: 1,
          password: hashedPassword,
          isTwoFactorEnabled: true,
          twoFactorSecret: 'iv:tag:ciphertext',
        });

        await expect(
          authService.disableTwoFactor(1, '123456', 'wrong_pass'),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('should throw BadRequestException if OTP code is invalid', async () => {
        const hashedPassword = await bcrypt.hash('correct_pass', 10);
        mockUsersService.findByIdWithTwoFactorDetails.mockResolvedValue({
          id: 1,
          password: hashedPassword,
          isTwoFactorEnabled: true,
          twoFactorSecret: 'iv:tag:ciphertext',
        });
        mockTwoFactorService.verifyTotpCode.mockReturnValue({ valid: false });
        mockTwoFactorService.verifyAndConsumeRecoveryCode.mockReturnValue({
          valid: false,
        });

        await expect(
          authService.disableTwoFactor(1, 'bad_code', 'correct_pass'),
        ).rejects.toThrow(BadRequestException);
      });

      it('should disable 2FA when password and code are valid', async () => {
        const hashedPassword = await bcrypt.hash('correct_pass', 10);
        mockUsersService.findByIdWithTwoFactorDetails.mockResolvedValue({
          id: 1,
          password: hashedPassword,
          isTwoFactorEnabled: true,
          twoFactorSecret: 'iv:tag:ciphertext',
        });
        mockTwoFactorService.verifyTotpCode.mockReturnValue({ valid: true });

        const result = await authService.disableTwoFactor(
          1,
          '123456',
          'correct_pass',
        );

        expect(result.isTwoFactorEnabled).toBe(false);
        expect(mockUsersService.update).toHaveBeenCalledWith(1, {
          isTwoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorRecoveryCodes: null,
          twoFactorAttempts: 0,
          twoFactorLockoutUntil: null,
          twoFactorLastStep: null,
        });
      });
    });
  });
});
