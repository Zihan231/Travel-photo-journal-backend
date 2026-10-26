import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import crypto from 'node:crypto';

export interface GeneratedSecret {
  plainSecret: string;
  encryptedSecret: string;
  otpauthUrl: string;
  qrCodeUrl: string;
}

export interface VerificationResult {
  valid: boolean;
  step?: number;
  consumedRecoveryCode?: boolean;
  remainingRecoveryCodes?: string[];
  reason?: string;
}

@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);
  private readonly issuer = 'TravelPhotoJournal';
  private readonly encryptionKey: Buffer;

  constructor(private readonly configService: ConfigService) {
    const rawKey =
      this.configService.get<string>('TWO_FACTOR_ENCRYPTION_KEY') ||
      this.configService.get<string>('JWT_SECRET') ||
      'fallback_insecure_jwt_secret_dev_key';

    // Derive a fixed 32-byte key for AES-256-GCM
    this.encryptionKey = crypto
      .createHash('sha256')
      .update(rawKey + '_totp_encryption')
      .digest();
  }

  /**
   * Encrypts plaintext using AES-256-GCM.
   * Format: iv:authTag:ciphertext (hex encoded)
   */
  encrypt(text: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Decrypts AES-256-GCM ciphertext.
   */
  decrypt(encryptedPayload: string): string {
    try {
      const parts = encryptedPayload.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted payload format');
      }
      const [ivHex, authTagHex, encryptedText] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err: any) {
      this.logger.error(`Failed to decrypt TOTP secret: ${err.message}`);
      throw new BadRequestException('Failed to decrypt two-factor secret');
    }
  }

  /**
   * Generates a new TOTP secret, otpauth URL, and base64 PNG QR code data URL.
   */
  async generateSecret(email: string): Promise<GeneratedSecret> {
    const totp = new OTPAuth.TOTP({
      issuer: this.issuer,
      label: email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: new OTPAuth.Secret({ size: 20 }),
    });

    const plainSecret = totp.secret.base32;
    const encryptedSecret = this.encrypt(plainSecret);
    const otpauthUrl = totp.toString();
    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);

    return {
      plainSecret,
      encryptedSecret,
      otpauthUrl,
      qrCodeUrl,
    };
  }

  /**
   * Validates a TOTP 6-digit code against an encrypted secret.
   * Enforces anti-replay protection (cannot reuse same code in current 30s window).
   */
  verifyTotpCode(
    code: string,
    encryptedSecret: string,
    lastStep: number | null = null,
  ): { valid: boolean; step?: number; reason?: string } {
    try {
      const plainSecret = this.decrypt(encryptedSecret);
      const totp = new OTPAuth.TOTP({
        issuer: this.issuer,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(plainSecret),
      });

      // Window 1 allows +/- 1 step (30 seconds) clock drift
      const delta = totp.validate({
        token: code,
        window: 1,
      });

      if (delta === null) {
        return { valid: false, reason: 'Invalid authenticator code' };
      }

      // Calculate step number for anti-replay
      const currentStep = Math.floor(Date.now() / 1000 / 30);
      const matchingStep = currentStep + delta;

      if (lastStep !== null && BigInt(matchingStep) <= BigInt(lastStep)) {
        return {
          valid: false,
          reason: 'This code was already used. Please wait for the next 30-second code in your app.',
        };
      }

      return { valid: true, step: matchingStep };
    } catch {
      return { valid: false, reason: 'Invalid two-factor code or secret' };
    }
  }

  /**
   * Generates 8 random one-time recovery codes.
   * Returns plain codes for the user and SHA-256 hashed codes for the database.
   */
  generateRecoveryCodes(): { plainCodes: string[]; hashedCodes: string[] } {
    const plainCodes: string[] = [];
    const hashedCodes: string[] = [];

    for (let i = 0; i < 8; i++) {
      const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
      const part2 = crypto.randomBytes(2).toString('hex').toUpperCase();
      const code = `${part1}-${part2}`;
      plainCodes.push(code);

      const hash = this.hashRecoveryCode(code);
      hashedCodes.push(hash);
    }

    return { plainCodes, hashedCodes };
  }

  /**
   * Hashes a recovery code using SHA-256 (normalized by trimming and removing dashes/whitespace).
   */
  hashRecoveryCode(code: string): string {
    const normalized = code.trim().toUpperCase().replace(/[\s-]/g, '');
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Checks if input code matches a stored hashed recovery code.
   * If valid, returns the remaining unconsumed recovery codes.
   */
  verifyAndConsumeRecoveryCode(
    inputCode: string,
    storedHashedCodes: string[] | null,
  ): { valid: boolean; remainingCodes?: string[] } {
    if (!storedHashedCodes || storedHashedCodes.length === 0) {
      return { valid: false };
    }

    const inputHash = this.hashRecoveryCode(inputCode);
    const index = storedHashedCodes.indexOf(inputHash);

    if (index === -1) {
      return { valid: false };
    }

    // Remove the used recovery code
    const remainingCodes = [...storedHashedCodes];
    remainingCodes.splice(index, 1);

    return { valid: true, remainingCodes };
  }
}
