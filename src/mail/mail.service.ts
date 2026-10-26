import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter;

  constructor(private readonly configService: ConfigService) {
    const host =
      this.configService.get<string>('SMTP_Server') ||
      this.configService.get<string>('SMTP_HOST');

    const port = parseInt(
      this.configService.get<string>('SMTP_PORT') ||
        this.configService.get<string>('Port') ||
        '587',
      10,
    );

    const user =
      this.configService.get<string>('Login') ||
      this.configService.get<string>('SMTP_USER');

    const pass =
      this.configService.get<string>('SMTP_key') ||
      this.configService.get<string>('SMTP_PASS');

    if (!host || !user || !pass) {
      this.logger.warn(
        'Brevo SMTP credentials are not fully configured. Email sending might fail.',
      );
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });
  }

  async sendVerificationCode(to: string, code: string): Promise<void> {
    const fromAddress =
      this.configService.get<string>('SMTP_FROM') ||
      this.configService.get<string>('Login') ||
      'zihanislam231@gmail.com';

    const brevoApiKey =
      this.configService.get<string>('BREVO_API_KEY') ||
      (this.configService.get<string>('SMTP_key')?.startsWith('xkeysib-')
        ? this.configService.get<string>('SMTP_key')
        : null);

    const resendApiKey = this.configService.get<string>('RESEND_API_KEY');

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #1e293b; text-align: center; margin-bottom: 24px;">Verify Your Email Address</h2>
        <p style="color: #475569; font-size: 16px; line-height: 1.5;">Hello,</p>
        <p style="color: #475569; font-size: 16px; line-height: 1.5;">Thank you for registering with Travel Photo Journal. Please use the following 6-digit verification code to complete your registration:</p>
        <div style="text-align: center; margin: 32px 0;">
          <span style="display: inline-block; font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #2563eb; background: #eff6ff; padding: 12px 28px; border-radius: 8px; border: 1px dashed #93c5fd;">
            ${code}
          </span>
        </div>
        <p style="color: #64748b; font-size: 14px; line-height: 1.5; text-align: center;">
          <strong>This code will expire in 5 minutes.</strong> For your security, there is a maximum of 5 attempts before this code is invalidated.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; text-align: center;">
          If you did not request this email, please ignore it.
        </p>
      </div>
    `;

    // 1. Try Brevo HTTPS REST API (Port 443 - Never blocked on Render)
    if (brevoApiKey) {
      try {
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': brevoApiKey,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            sender: { name: 'Travel Photo Journal', email: fromAddress },
            to: [{ email: to }],
            subject: 'Your Travel Photo Journal Verification Code',
            textContent: `Your verification code is: ${code}. It expires in 5 minutes.`,
            htmlContent,
          }),
        });

        if (res.ok) {
          this.logger.log(`Verification code dispatched to ${to} via Brevo REST API`);
          return;
        }

        const errData = await res.text();
        this.logger.warn(`Brevo REST API returned status ${res.status}: ${errData}`);
      } catch (err: any) {
        this.logger.warn(`Brevo REST API failed: ${err.message}`);
      }
    }

    // 2. Try Resend HTTPS REST API (Port 443 - Never blocked on Render)
    if (resendApiKey) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `Travel Photo Journal <${fromAddress}>`,
            to: [to],
            subject: 'Your Travel Photo Journal Verification Code',
            text: `Your verification code is: ${code}. It expires in 5 minutes.`,
            html: htmlContent,
          }),
        });

        if (res.ok) {
          this.logger.log(`Verification code dispatched to ${to} via Resend REST API`);
          return;
        }

        const errData = await res.text();
        this.logger.warn(`Resend REST API returned status ${res.status}: ${errData}`);
      } catch (err: any) {
        this.logger.warn(`Resend REST API failed: ${err.message}`);
      }
    }

    // 3. Fallback to standard Nodemailer SMTP
    try {
      await this.transporter.sendMail({
        from: {
          name: 'Travel Photo Journal',
          address: fromAddress,
        },
        to,
        subject: 'Your Travel Photo Journal Verification Code',
        text: `Your verification code is: ${code}. It expires in 5 minutes.`,
        html: htmlContent,
      });
      this.logger.log(`Verification code successfully dispatched to ${to} via SMTP`);
    } catch (error: any) {
      this.logger.error(
        `Failed to send verification email to ${to}: ${error.message}. (Note: Render free tier blocks outbound SMTP ports 25/465/587).`,
      );
      // Prominently log code so testing/evaluation is never blocked
      this.logger.warn(
        `[VERIFICATION CODE FALLBACK for ${to}]: ${code} (Expires in 5 minutes)`,
      );
      throw new InternalServerErrorException(
        `Email dispatch failed (${error.message}). Check Render logs for fallback code or configure BREVO_API_KEY (HTTPS port 443).`,
      );
    }
  }
}
