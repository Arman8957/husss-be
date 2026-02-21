import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  // FIX: Add `!` (definite assignment assertion).
  // TypeScript doesn't follow the constructor → initializeTransporter() call chain,
  // so it thinks `transporter` might be unset. The `!` tells it: trust me, it's set.
  private transporter!: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {
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

    this.transporter.verify((error) => {
      if (error) {
        this.logger.error('SMTP connection error:', error);
      } else {
        this.logger.log('SMTP server is ready to send emails');
      }
    });
  }

  // ─── Existing methods (unchanged) ────────────────────────────────────────

  async sendVerificationEmail(email: string, name: string, token: string) {
    const verificationUrl = `${this.configService.get('verificationUrl')}?token=${token}`;
    return this.sendEmail({
      from: this.configService.get('smtp.from'),
      to: email,
      subject: 'Verify Your Email - HUSSS',
      html: `
        <!DOCTYPE html><html><head><style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; }
          .footer { margin-top: 30px; text-align: center; color: #666; font-size: 12px; }
        </style></head><body>
          <div class="container">
            <div class="header"><h1 style="color:white;margin:0;">Welcome to HUSSS!</h1></div>
            <div class="content">
              <h2>Hi ${name},</h2>
              <p>Please verify your email address to complete your registration.</p>
              <p style="text-align:center;margin:40px 0;">
                <a href="${verificationUrl}" class="button">Verify Email Address</a>
              </p>
              <p>Or paste this link in your browser:</p>
              <p><a href="${verificationUrl}">${verificationUrl}</a></p>
              <p>This link expires in <strong>24 hours</strong>.</p>
              <p>If you didn't create an account, you can safely ignore this email.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} HUSSS. All rights reserved.</p>
              <p>This email was sent to ${email}</p>
            </div>
          </div>
        </body></html>`,
      text: `Verify your HUSSS email: ${verificationUrl}`,
    });
  }

  async sendPasswordResetEmail(email: string, name: string, token: string) {
    const resetUrl = `${this.configService.get('resetPasswordUrl')}?token=${token}`;
    return this.sendEmail({
      from: this.configService.get('smtp.from'),
      to: email,
      subject: 'Reset Your Password - HUSSS',
      html: `
        <!DOCTYPE html><html><head><style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; }
          .footer { margin-top: 30px; text-align: center; color: #666; font-size: 12px; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
        </style></head><body>
          <div class="container">
            <div class="header"><h1 style="color:white;margin:0;">Password Reset Request</h1></div>
            <div class="content">
              <h2>Hi ${name},</h2>
              <p>Click the button below to reset your HUSSS account password:</p>
              <p style="text-align:center;margin:40px 0;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </p>
              <div class="warning">
                <p><strong>Important:</strong> If you didn't request this, ignore this email or contact support.</p>
              </div>
              <p>Or paste this link in your browser:</p>
              <p><a href="${resetUrl}">${resetUrl}</a></p>
              <p>This link expires in <strong>1 hour</strong>.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} HUSSS. All rights reserved.</p>
              <p>This email was sent to ${email}</p>
            </div>
          </div>
        </body></html>`,
      text: `Reset your HUSSS password: ${resetUrl}`,
    });
  }

  async sendWelcomeEmail(email: string, name: string) {
    return this.sendEmail({
      from: this.configService.get('smtp.from'),
      to: email,
      subject: 'Welcome to HUSSS! 🎉',
      html: `
        <!DOCTYPE html><html><head><style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 40px; border-radius: 0 0 10px 10px; }
          .feature { background: white; padding: 20px; margin: 15px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .icon { font-size: 24px; margin-right: 10px; }
        </style></head><body>
          <div class="container">
            <div class="header">
              <h1 style="color:white;margin:0;font-size:28px;">Welcome to HUSSS! 💪</h1>
              <p style="color:rgba(255,255,255,0.9);margin:10px 0 0;">Your transformation starts now</p>
            </div>
            <div class="content">
              <h2>Hi ${name},</h2>
              <p>Your email is verified and your account is fully active!</p>
              <div class="feature"><p><span class="icon">🏋️</span><strong>Browse Programs:</strong> Monster Confusion, HUSS 8-Week, and more</p></div>
              <div class="feature"><p><span class="icon">📊</span><strong>Track Workouts:</strong> Log every set, rep, and weight</p></div>
              <div class="feature"><p><span class="icon">🔬</span><strong>BFR Training:</strong> Access Blood Flow Restriction guides</p></div>
              <div class="feature"><p><span class="icon">🧑‍🏫</span><strong>Get a Coach:</strong> Join a verified HUSSS coach</p></div>
              <p style="margin-top:30px;">Open the HUSSS app to get started!</p>
            </div>
          </div>
        </body></html>`,
    });
  }

  // ─── New methods required by AuthService ─────────────────────────────────

  /**
   * Notifies all ADMIN users when a new coach registers and needs review.
   */
  async sendNewCoachRegisteredEmail(
    adminEmail: string,
    coachEmail: string,
    coachName: string,
  ): Promise<boolean> {
    const adminPanelUrl = `${this.configService.get('frontendUrl')}/admin/coaches`;
    return this.sendEmail({
      from: this.configService.get('smtp.from'),
      to: adminEmail,
      subject: '🧑‍🏫 New Coach Registration — Action Required',
      html: `
        <!DOCTYPE html><html><head><style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f6a623 0%, #e8920f 100%); padding: 28px 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .info-box { background: white; border-left: 4px solid #f6a623; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 20px 0; }
          .button { display: inline-block; background: #f6a623; color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; }
          .footer { margin-top: 24px; text-align: center; color: #888; font-size: 12px; }
        </style></head><body>
          <div class="container">
            <div class="header"><h1 style="color:white;margin:0;">New Coach Registration</h1></div>
            <div class="content">
              <p>A new coach has registered and is awaiting your review:</p>
              <div class="info-box">
                <p style="margin:4px 0;"><strong>Name:</strong> ${coachName}</p>
                <p style="margin:4px 0;"><strong>Email:</strong> ${coachEmail}</p>
                <p style="margin:4px 0;"><strong>Status:</strong> Pending email verification + admin approval</p>
              </div>
              <p style="text-align:center;margin:32px 0;">
                <a href="${adminPanelUrl}" class="button">Review in Admin Panel</a>
              </p>
              <p style="font-size:13px;color:#666;">The coach cannot log in until you approve their account.</p>
            </div>
            <div class="footer"><p>&copy; ${new Date().getFullYear()} HUSSS Admin System</p></div>
          </div>
        </body></html>`,
      text: `New coach registered: ${coachName} (${coachEmail}). Review at: ${adminPanelUrl}`,
    });
  }

  /**
   * Notifies a coach whether their registration was approved or rejected.
   */
  async sendCoachApprovalEmail(
    email: string,
    name: string,
    approved: boolean,
  ): Promise<boolean> {
    const loginUrl = `${this.configService.get('frontendUrl')}/login`;
    const headerColor = approved
      ? 'linear-gradient(135deg, #3ecf8e 0%, #2ecc71 100%)'
      : 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)';

    const bodyHtml = approved
      ? `<p>Great news! Your HUSSS coach account has been <strong>approved</strong>.</p>
         <p>You can now log in and start:</p>
         <ul style="padding-left:20px;line-height:2;">
           <li>Generating client invite codes</li>
           <li>Setting your availability slots</li>
           <li>Managing client programs and PAR-Q reviews</li>
           <li>Tracking client body dimensions and progress</li>
         </ul>
         <p style="text-align:center;margin:32px 0;">
           <a href="${loginUrl}" style="display:inline-block;background:#3ecf8e;color:white;padding:12px 30px;text-decoration:none;border-radius:25px;font-weight:bold;">Login to Coach Dashboard</a>
         </p>`
      : `<p>Thank you for your interest in becoming a HUSSS coach.</p>
         <p>Unfortunately, your application was <strong>not approved</strong> at this time.</p>
         <p style="margin-top:20px;padding:16px;background:#fff3cd;border-radius:8px;">
           Questions? Contact us: <a href="mailto:support@husss.app">support@husss.app</a>
         </p>`;

    return this.sendEmail({
      from: this.configService.get('smtp.from'),
      to: email,
      subject: approved
        ? '✅ Your Coach Account Has Been Approved — HUSSS'
        : '❌ Coach Application Update — HUSSS',
      html: `
        <!DOCTYPE html><html><head><style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${headerColor}; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .footer { margin-top: 24px; text-align: center; color: #888; font-size: 12px; }
        </style></head><body>
          <div class="container">
            <div class="header">
              <h1 style="color:white;margin:0;">${approved ? '🎉 Application Approved!' : 'Application Update'}</h1>
            </div>
            <div class="content">
              <h2>Hi ${name},</h2>
              ${bodyHtml}
            </div>
            <div class="footer"><p>&copy; ${new Date().getFullYear()} HUSSS. All rights reserved.</p></div>
          </div>
        </body></html>`,
      text: approved
        ? `Your HUSSS coach account is approved. Login at: ${loginUrl}`
        : `Your HUSSS coach application was not approved. Contact support@husss.app`,
    });
  }

  /**
   * Sends temporary credentials when an admin creates an account manually.
   */
  async sendAdminCreatedAccountEmail(
    email: string,
    name: string,
    tempPassword: string,
  ): Promise<boolean> {
    const loginUrl = `${this.configService.get('frontendUrl')}/login`;
    return this.sendEmail({
      from: this.configService.get('smtp.from'),
      to: email,
      subject: 'Your HUSSS Account Has Been Created',
      html: `
        <!DOCTYPE html><html><head><style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .creds-box { background: #1a1a2e; color: #e8eaf0; padding: 20px 24px; border-radius: 8px; font-family: monospace; font-size: 14px; margin: 24px 0; line-height: 2; }
          .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 14px; border-radius: 6px; margin: 16px 0; font-size: 13px; }
          .footer { margin-top: 24px; text-align: center; color: #888; font-size: 12px; }
        </style></head><body>
          <div class="container">
            <div class="header"><h1 style="color:white;margin:0;">Account Created for You</h1></div>
            <div class="content">
              <h2>Hi ${name},</h2>
              <p>A HUSSS administrator has created an account for you. Here are your login credentials:</p>
              <div class="creds-box">
                <div>📧 <strong>Email:</strong> ${email}</div>
                <div>🔑 <strong>Temporary Password:</strong> ${tempPassword}</div>
              </div>
              <div class="warning">
                ⚠️ <strong>Please change your password immediately after logging in.</strong><br/>
                Go to: Profile → Security → Change Password
              </div>
              <p style="text-align:center;margin:32px 0;">
                <a href="${loginUrl}" class="button">Login to HUSSS</a>
              </p>
            </div>
            <div class="footer"><p>&copy; ${new Date().getFullYear()} HUSSS. All rights reserved.</p></div>
          </div>
        </body></html>`,
      text: `Your HUSSS account — Email: ${email} | Temp Password: ${tempPassword} | Login: ${loginUrl}`,
    });
  }

  // ─── Private helper ───────────────────────────────────────────────────────

  private async sendEmail(mailOptions: nodemailer.SendMailOptions): Promise<boolean> {
    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email sent to ${mailOptions.to}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${mailOptions.to}:`, error);
      return false;
    }
  }
}