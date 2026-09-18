import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { REGISTER_OTP_TTL_SEC } from '../auth/registration-otp';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('mail.host') || '';
    const user = this.config.get<string>('mail.user') || '';
    const pass = this.config.get<string>('mail.pass') || '';
    if (!host) return;
    this.transporter = nodemailer.createTransport({
      host,
      port: this.config.get<number>('mail.port') || 587,
      secure: this.config.get<boolean>('mail.secure') === true,
      auth: user ? { user, pass } : undefined,
    });
  }

  async sendRegistrationOtp(to: string, otp: string) {
    const minutes = Math.max(1, Math.round(REGISTER_OTP_TTL_SEC / 60));
    const from = this.config.get<string>('mail.from') || 'noreply@walkingtree.tech';
    const subject = 'Your Walking Tree attendance verification code';
    const text =
      `Your verification code is ${otp}. It expires in ${minutes} minutes.\n\n` +
      'Enter this code in the registration form to verify your official company email. ' +
      'If you did not request this, you can ignore this message.';
    const html = `
      <p>Your verification code is:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px">${otp}</p>
      <p>It expires in ${minutes} minutes. Enter it in the registration form to verify
      <strong>${to}</strong>.</p>
      <p>If you did not request this, you can ignore this message.</p>
    `;

    if (!this.transporter) {
      if (this.isProduction()) {
        throw new ServiceUnavailableException('Email delivery is not configured');
      }
      this.logger.warn(`SMTP not configured. Registration OTP for ${to}: ${otp}`);
      return;
    }

    try {
      await this.transporter.sendMail({ from, to, subject, text, html });
      this.logger.log(`Sent registration OTP to ${to}`);
    } catch (err) {
      this.logger.error(`Failed to send registration OTP to ${to}: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        'Could not send the verification code to your company email. Try again in a moment.',
      );
    }
  }

  private isProduction() {
    const env = (this.config.get<string>('nodeEnv') || '').toLowerCase();
    return env === 'prod' || env === 'production';
  }
}
