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
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { ResendCodeDto } from './dto/resend-code.dto.js';

@Injectable()
export class AuthService {
  private readonly MAX_ATTEMPTS = 5;
  private readonly CODE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
  private readonly RESEND_COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
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

    const payload = { sub: user.id, email: user.email };
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
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;
        const timeStr =
          minutes > 0
            ? `${minutes} minute(s) and ${seconds} second(s)`
            : `${seconds} seconds`;
        throw new BadRequestException(
          `Please wait ${timeStr} before requesting a new code.`,
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
}
