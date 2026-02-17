import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private logger = new Logger(EmailService.name);

  constructor(private configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get('smtp.host'),
      port: this.configService.get('smtp.port'),
      secure: this.configService.get('smtp.port') === 465,
      auth: {
        user: this.configService.get('smtp.user'),
        pass: this.configService.get('smtp.password'),
      },
    });

    // Verify connection
    this.transporter.verify((error) => {
      if (error) {
        this.logger.error('SMTP connection error:', error);
      } else {
        this.logger.log('SMTP server is ready to send emails');
      }
    });
  }

  async sendVerificationEmail(email: string, name: string, token: string) {
    const verificationUrl = `${this.configService.get('verificationUrl')}?token=${token}`;
    
    const mailOptions = {
      from: this.configService.get('smtp.from'),
      to: email,
      subject: 'Verify Your Email - FocusFlow',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; }
            .footer { margin-top: 30px; text-align: center; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="color: white; margin: 0;">Welcome to FocusFlow!</h1>
            </div>
            <div class="content">
              <h2>Hi ${name},</h2>
              <p>Thank you for registering with FocusFlow! Please verify your email address to complete your registration and start improving your focus.</p>
              <p style="text-align: center; margin: 40px 0;">
                <a href="${verificationUrl}" class="button">Verify Email Address</a>
              </p>
              <p>If the button doesn't work, copy and paste this link into your browser:</p>
              <p><a href="${verificationUrl}">${verificationUrl}</a></p>
              <p>This verification link will expire in 24 hours.</p>
              <p>If you didn't create an account with FocusFlow, you can safely ignore this email.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} FocusFlow. All rights reserved.</p>
              <p>This email was sent to ${email}</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Welcome to FocusFlow! Please verify your email by visiting: ${verificationUrl}`,
    };

    return this.sendEmail(mailOptions);
  }

  async sendPasswordResetEmail(email: string, name: string, token: string) {
    const resetUrl = `${this.configService.get('resetPasswordUrl')}?token=${token}`;
    
    const mailOptions = {
      from: this.configService.get('smtp.from'),
      to: email,
      subject: 'Reset Your Password - FocusFlow',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; }
            .footer { margin-top: 30px; text-align: center; color: #666; font-size: 12px; }
            .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="color: white; margin: 0;">Password Reset Request</h1>
            </div>
            <div class="content">
              <h2>Hi ${name},</h2>
              <p>We received a request to reset your FocusFlow account password. Click the button below to create a new password:</p>
              <p style="text-align: center; margin: 40px 0;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </p>
              <div class="warning">
                <p><strong>Important:</strong> If you didn't request a password reset, please ignore this email or contact our support team if you're concerned about your account security.</p>
              </div>
              <p>If the button doesn't work, copy and paste this link into your browser:</p>
              <p><a href="${resetUrl}">${resetUrl}</a></p>
              <p>This password reset link will expire in 1 hour for security reasons.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} FocusFlow. All rights reserved.</p>
              <p>This email was sent to ${email}</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Reset your FocusFlow password: ${resetUrl}`,
    };

    return this.sendEmail(mailOptions);
  }

  async sendWelcomeEmail(email: string, name: string) {
    const mailOptions = {
      from: this.configService.get('smtp.from'),
      to: email,
      subject: 'Welcome to FocusFlow! 🎉',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 40px; border-radius: 0 0 10px 10px; }
            .feature { background: white; padding: 20px; margin: 15px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .icon { font-size: 24px; margin-right: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to FocusFlow! 🚀</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Your journey to better focus starts now</p>
            </div>
            <div class="content">
              <h2>Hi ${name},</h2>
              <p>Congratulations! Your email has been successfully verified and your FocusFlow account is now fully activated.</p>
              
              <div class="feature">
                <p><span class="icon">🎯</span> <strong>Start with our Focus Timer:</strong> Begin with 25-minute focused sessions</p>
              </div>
              <div class="feature">
                <p><span class="icon">📱</span> <strong>Block Distracting Apps:</strong> Set up app restrictions during focus sessions</p>
              </div>
              <div class="feature">
                <p><span class="icon">🧘</span> <strong>Try Breathing Exercises:</strong> Use our guided breathing for quick focus resets</p>
              </div>
              
              <p style="margin-top: 30px;">Ready to get started? Open the FocusFlow app and begin your first focus session!</p>
              
              <p style="font-size: 12px; color: #666; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee;">
                <strong>Tips for success:</strong><br>
                1. Start with just 25 minutes per day<br>
                2. Gradually increase your focus time<br>
                3. Use app blocking during important tasks<br>
                4. Take regular breaks with breathing exercises
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    return this.sendEmail(mailOptions);
  }

  private async sendEmail(mailOptions: nodemailer.SendMailOptions): Promise<boolean> {
    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email sent successfully to ${mailOptions.to}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${mailOptions.to}:`, error);
      return false;
    }
  }
}