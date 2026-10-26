import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import * as OTPAuth from 'otpauth';
import { TwoFactorService } from './two-factor.service.js';

describe('TwoFactorService', () => {
  let service: TwoFactorService;
  let mockConfigService: Partial<ConfigService>;

  beforeEach(() => {
    mockConfigService = {
      get: (key: string) => {
        if (key === 'JWT_SECRET') return 'test_super_secret_jwt_key_12345';
        return null;
      },
    };

    service = new TwoFactorService(mockConfigService as ConfigService);
  });

  describe('Encryption & Decryption (AES-256-GCM)', () => {
    it('should encrypt and decrypt a string accurately', () => {
      const originalText = 'JBSWY3DPEHPK3PXP';
      const encrypted = service.encrypt(originalText);

      expect(encrypted).not.toBe(originalText);
      expect(encrypted.split(':')).toHaveLength(3); // iv:tag:ciphertext

      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(originalText);
    });

    it('should throw an exception when decrypting corrupted ciphertext', () => {
      expect(() => service.decrypt('invalid:encrypted:format')).toThrow();
    });
  });

  describe('Secret & QR Code Generation', () => {
    it('should generate a valid Base32 secret and QR code data URL', async () => {
      const result = await service.generateSecret('user@example.com');

      expect(result.plainSecret).toBeDefined();
      expect(result.plainSecret.length).toBeGreaterThan(10);
      expect(result.encryptedSecret).toBeDefined();
      expect(result.encryptedSecret).toContain(':');
      expect(result.otpauthUrl).toContain('otpauth://totp/');
      expect(result.otpauthUrl).toContain('user%40example.com');
      expect(result.qrCodeUrl).toMatch(/^data:image\/png;base64,/);

      // Verify encrypted secret can be decrypted back to plainSecret
      expect(service.decrypt(result.encryptedSecret)).toBe(result.plainSecret);
    });
  });

  describe('TOTP Verification & Anti-Replay', () => {
    it('should verify a valid TOTP code generated for the secret', async () => {
      const { plainSecret, encryptedSecret } =
        await service.generateSecret('user@example.com');

      const totp = new OTPAuth.TOTP({
        issuer: 'TravelPhotoJournal',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(plainSecret),
      });

      const currentCode = totp.generate();
      const verifyResult = service.verifyTotpCode(currentCode, encryptedSecret);

      expect(verifyResult.valid).toBe(true);
      expect(verifyResult.step).toBeDefined();
    });

    it('should reject an incorrect TOTP code', async () => {
      const { encryptedSecret } =
        await service.generateSecret('user@example.com');

      const verifyResult = service.verifyTotpCode('000000', encryptedSecret);
      expect(verifyResult.valid).toBe(false);
      expect(verifyResult.reason).toBe('Invalid authenticator code');
    });

    it('should enforce anti-replay (reject reusing code in the same window)', async () => {
      const { plainSecret, encryptedSecret } =
        await service.generateSecret('user@example.com');

      const totp = new OTPAuth.TOTP({
        issuer: 'TravelPhotoJournal',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(plainSecret),
      });

      const currentCode = totp.generate();
      const firstResult = service.verifyTotpCode(currentCode, encryptedSecret);
      expect(firstResult.valid).toBe(true);

      // Re-submit the same code with lastStep set to the accepted step
      const replayResult = service.verifyTotpCode(
        currentCode,
        encryptedSecret,
        firstResult.step,
      );

      expect(replayResult.valid).toBe(false);
      expect(replayResult.reason).toContain('already used');
    });
  });

  describe('Recovery Codes', () => {
    it('should generate 8 plain and hashed recovery codes', () => {
      const { plainCodes, hashedCodes } = service.generateRecoveryCodes();

      expect(plainCodes).toHaveLength(8);
      expect(hashedCodes).toHaveLength(8);
      expect(plainCodes[0]).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
    });

    it('should verify and consume a valid recovery code', () => {
      const { plainCodes, hashedCodes } = service.generateRecoveryCodes();
      const codeToUse = plainCodes[2];

      const result = service.verifyAndConsumeRecoveryCode(
        codeToUse,
        hashedCodes,
      );

      expect(result.valid).toBe(true);
      expect(result.remainingCodes).toHaveLength(7);
      expect(result.remainingCodes).not.toContain(hashedCodes[2]);
    });

    it('should reject invalid recovery codes', () => {
      const { hashedCodes } = service.generateRecoveryCodes();

      const result = service.verifyAndConsumeRecoveryCode(
        'INVALID-CODE',
        hashedCodes,
      );

      expect(result.valid).toBe(false);
      expect(result.remainingCodes).toBeUndefined();
    });
  });
});
