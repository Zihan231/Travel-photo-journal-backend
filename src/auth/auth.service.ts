import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service.js';
import { MailService } from '../mail/mail.service.js';
import { TwoFactorService } from './two-factor.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { ResendCodeDto } from './dto/resend-code.dto.js';

@Injectable()
export class AuthService {
  private readonly MAX_ATTEMPTS = 5;
  private readonly CODE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
  private readonly RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute (60 seconds)

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly twoFactorService: TwoFactorService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { name, email, password } = registerDto;

    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const verificationCode = Math.floor(
      100000 + Math.random() * 900000,
    ).toString();
    const codeExpiresAt = new Date(Date.now() + this.CODE_EXPIRY_MS);
    const lastCodeSentAt = new Date();

    const newUser = await this.usersService.create({
      name,
      email,
      password: hashedPassword,
      isEmailVerified: false,
      verificationCode,
      codeExpiresAt,
      verificationAttempts: 0,
      lastCodeSentAt,
    });

    await this.mailService.sendVerificationCode(email, verificationCode);

    return {
      message:
        'Registration successful. A 6-digit verification code has been sent to your email.',
      email: newUser.email,
      isEmailVerified: false,
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.usersService.findByEmailWithAuthDetails(email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isEmailVerified) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'EMAIL_NOT_VERIFIED',
        message:
          'Email is not verified. Please verify your email with the 6-digit verification code sent to your inbox.',
        email: user.email,
      });
    }

    // Strict Two-Step Login: If 2FA is enabled, issue a temporary 2FA token
    if (user.isTwoFactorEnabled) {
      const twoFactorToken = await this.jwtService.signAsync(
        {
          sub: user.id,
          email: user.email,
          type: '2fa_ticket',
          is2faPending: true,
        },
        { expiresIn: '5m' },
      );

      return {
        requires2fa: true,
        twoFactorToken,
        message:
          'Two-factor authentication required. Please provide your 6-digit authenticator code or a recovery code.',
      };
    }

    const payload = { sub: user.id, email: user.email, type: 'access_token' };
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      message: 'Login successful',
      token_type: 'Bearer',
      access_token: accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        bio: user.bio,
        avatar: user.avatar,
      },
    };
  }

  async verifyEmail(verifyEmailDto: VerifyEmailDto) {
    const { email, code } = verifyEmailDto;

    const user = await this.usersService.findByEmailWithAuthDetails(email);
    if (!user) {
      throw new BadRequestException('No account found with this email');
    }

    if (user.isEmailVerified) {
      throw new BadRequestException(
        'Email is already verified. You can log in directly.',
      );
    }

    if (!user.verificationCode || !user.codeExpiresAt) {
      throw new BadRequestException(
        'No active verification code found. Please request a new code.',
      );
    }

    const now = new Date();
    if (now > new Date(user.codeExpiresAt)) {
      throw new BadRequestException(
        'Verification code has expired. Please request a new code.',
      );
    }

    if (user.verificationAttempts >= this.MAX_ATTEMPTS) {
      await this.usersService.update(user.id, {
        verificationCode: null,
        codeExpiresAt: null,
      });
      throw new BadRequestException(
        'Too many failed attempts. This verification code has been invalidated. Please request a new code.',
      );
    }

    if (user.verificationCode !== code) {
      const nextAttempts = user.verificationAttempts + 1;
      if (nextAttempts >= this.MAX_ATTEMPTS) {
        await this.usersService.update(user.id, {
          verificationCode: null,
          codeExpiresAt: null,
          verificationAttempts: nextAttempts,
        });
        throw new BadRequestException(
          'Invalid verification code. Maximum attempts reached. Code has been invalidated. Please request a new code.',
        );
      }

      await this.usersService.update(user.id, {
        verificationAttempts: nextAttempts,
      });
      const remaining = this.MAX_ATTEMPTS - nextAttempts;
      throw new BadRequestException(
        `Invalid verification code. ${remaining} attempt(s) remaining.`,
      );
    }

    await this.usersService.update(user.id, {
      isEmailVerified: true,
      verificationCode: null,
      codeExpiresAt: null,
      verificationAttempts: 0,
    });

    return {
      message: 'Email verified successfully. You can now log in.',
      email: user.email,
      isEmailVerified: true,
    };
  }

  async resendCode(resendCodeDto: ResendCodeDto) {
    const { email } = resendCodeDto;

    const user = await this.usersService.findByEmailWithAuthDetails(email);
    if (!user) {
      throw new BadRequestException('No account found with this email');
    }

    if (user.isEmailVerified) {
      throw new BadRequestException(
        'Email is already verified. You can log in directly.',
      );
    }

    if (user.lastCodeSentAt) {
      const elapsed = Date.now() - new Date(user.lastCodeSentAt).getTime();
      if (elapsed < this.RESEND_COOLDOWN_MS) {
        const remainingSeconds = Math.ceil(
          (this.RESEND_COOLDOWN_MS - elapsed) / 1000,
        );
        throw new BadRequestException(
          `Please wait ${remainingSeconds} seconds before requesting a new code.`,
        );
      }
    }

    const verificationCode = Math.floor(
      100000 + Math.random() * 900000,
    ).toString();
    const codeExpiresAt = new Date(Date.now() + this.CODE_EXPIRY_MS);
    const lastCodeSentAt = new Date();

    await this.usersService.update(user.id, {
      verificationCode,
      codeExpiresAt,
      verificationAttempts: 0,
      lastCodeSentAt,
    });

    await this.mailService.sendVerificationCode(user.email, verificationCode);

    return {
      message:
        'A new 6-digit verification code has been sent to your email. It expires in 5 minutes.',
    };
  }

  async getTwoFactorStatus(userId: number) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return {
      isTwoFactorEnabled: user.isTwoFactorEnabled,
    };
  }

  async generateTwoFactorSecret(userId: number) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const { plainSecret, encryptedSecret, otpauthUrl, qrCodeUrl } =
      await this.twoFactorService.generateSecret(user.email);

    // Save encrypted secret, leaving isTwoFactorEnabled false until verified
    await this.usersService.update(user.id, {
      twoFactorSecret: encryptedSecret,
      twoFactorAttempts: 0,
      twoFactorLockoutUntil: null,
      twoFactorLastStep: null,
    });

    return {
      secret: plainSecret,
      qrCodeUrl,
      otpauthUrl,
      message:
        'Scan this QR code in your authenticator app (Google Authenticator, Authy, etc.), then submit a 6-digit code to /auth/2fa/enable to complete setup.',
    };
  }

  async enableTwoFactor(userId: number, code: string) {
    const user = await this.usersService.findByIdWithTwoFactorDetails(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.twoFactorSecret) {
      throw new BadRequestException(
        'Please generate a two-factor secret first via POST /auth/2fa/generate',
      );
    }

    const verifyResult = this.twoFactorService.verifyTotpCode(
      code,
      user.twoFactorSecret,
    );

    if (!verifyResult.valid) {
      throw new BadRequestException(
        verifyResult.reason || 'Invalid authenticator code. Verification failed.',
      );
    }

    // Generate 8 one-time backup recovery codes
    const { plainCodes, hashedCodes } =
      this.twoFactorService.generateRecoveryCodes();

    await this.usersService.update(user.id, {
      isTwoFactorEnabled: true,
      twoFactorRecoveryCodes: hashedCodes,
      twoFactorAttempts: 0,
      twoFactorLockoutUntil: null,
      twoFactorLastStep: verifyResult.step ?? null,
    });

    return {
      message:
        'Two-factor authentication enabled successfully. Save your recovery codes in a safe place.',
      isTwoFactorEnabled: true,
      recoveryCodes: plainCodes,
    };
  }

  async authenticateTwoFactor(twoFactorToken: string, code: string) {
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(twoFactorToken);
    } catch {
      throw new UnauthorizedException(
        'Invalid or expired two-factor session token. Please log in again.',
      );
    }

    if (payload.type !== '2fa_ticket' || !payload.is2faPending) {
      throw new UnauthorizedException('Invalid token type for 2FA verification');
    }

    const user = await this.usersService.findByIdWithTwoFactorDetails(
      payload.sub,
    );
    if (!user || !user.isTwoFactorEnabled || !user.twoFactorSecret) {
      throw new UnauthorizedException(
        'Invalid account or two-factor authentication is not active',
      );
    }

    // Rate-limit check: lockout check
    if (
      user.twoFactorLockoutUntil &&
      new Date() < new Date(user.twoFactorLockoutUntil)
    ) {
      const remainingMinutes = Math.ceil(
        (new Date(user.twoFactorLockoutUntil).getTime() - Date.now()) /
          (60 * 1000),
      );
      throw new ForbiddenException(
        `Too many failed 2FA attempts. Account 2FA is temporarily locked. Please try again in ${remainingMinutes} minute(s).`,
      );
    }

    // 1. Try TOTP verification
    const totpResult = this.twoFactorService.verifyTotpCode(
      code,
      user.twoFactorSecret,
      user.twoFactorLastStep,
    );

    let isSuccess = false;
    let updatedRecoveryCodes: string[] | null = null;
    let newStep: number | null = null;

    if (totpResult.valid) {
      isSuccess = true;
      newStep = totpResult.step ?? null;
    } else {
      // 2. Try recovery code verification
      const recoveryResult = this.twoFactorService.verifyAndConsumeRecoveryCode(
        code,
        user.twoFactorRecoveryCodes,
      );
      if (recoveryResult.valid) {
        isSuccess = true;
        updatedRecoveryCodes = recoveryResult.remainingCodes ?? null;
      }
    }

    if (!isSuccess) {
      const nextAttempts = user.twoFactorAttempts + 1;
      if (nextAttempts >= this.MAX_ATTEMPTS) {
        const lockoutUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 min
        await this.usersService.update(user.id, {
          twoFactorAttempts: nextAttempts,
          twoFactorLockoutUntil: lockoutUntil,
        });
        throw new ForbiddenException(
          'Too many failed attempts. Two-factor authentication is locked for 15 minutes.',
        );
      }

      await this.usersService.update(user.id, {
        twoFactorAttempts: nextAttempts,
      });

      const remaining = this.MAX_ATTEMPTS - nextAttempts;
      throw new UnauthorizedException(
        totpResult.reason ===
          'This code was already used. Please wait for the next 30-second code in your app.'
          ? totpResult.reason
          : `Invalid 6-digit code or recovery code. ${remaining} attempt(s) remaining.`,
      );
    }

    // Reset attempts and update step or recovery codes
    const updateData: Partial<any> = {
      twoFactorAttempts: 0,
      twoFactorLockoutUntil: null,
    };
    if (newStep !== null) {
      updateData.twoFactorLastStep = newStep;
    }
    if (updatedRecoveryCodes !== null) {
      updateData.twoFactorRecoveryCodes = updatedRecoveryCodes;
    }
    await this.usersService.update(user.id, updateData);

    // Issue full access token
    const fullPayload = {
      sub: user.id,
      email: user.email,
      type: 'access_token',
    };
    const accessToken = await this.jwtService.signAsync(fullPayload);

    return {
      message: 'Two-factor authentication verified successfully',
      token_type: 'Bearer',
      access_token: accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        bio: user.bio,
        avatar: user.avatar,
      },
    };
  }

  async disableTwoFactor(
    userId: number,
    code: string,
    password: string,
  ) {
    const user = await this.usersService.findByIdWithTwoFactorDetails(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.isTwoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException(
        'Two-factor authentication is not currently enabled for this account',
      );
    }

    // 1. Validate password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid account password');
    }

    // 2. Validate OTP code or recovery code
    const totpResult = this.twoFactorService.verifyTotpCode(
      code,
      user.twoFactorSecret,
      user.twoFactorLastStep,
    );

    let isCodeValid = totpResult.valid;
    if (!isCodeValid) {
      const recoveryResult = this.twoFactorService.verifyAndConsumeRecoveryCode(
        code,
        user.twoFactorRecoveryCodes,
      );
      isCodeValid = recoveryResult.valid;
    }

    if (!isCodeValid) {
      throw new BadRequestException(
        'Invalid authenticator code or recovery code. Cannot disable 2FA.',
      );
    }

    await this.usersService.update(user.id, {
      isTwoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorRecoveryCodes: null,
      twoFactorAttempts: 0,
      twoFactorLockoutUntil: null,
      twoFactorLastStep: null,
    });

    return {
      message: 'Two-factor authentication disabled successfully',
      isTwoFactorEnabled: false,
    };
  }
}
