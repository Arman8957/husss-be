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

  //===========================couch template ===========================

  // ─── Coach invitation emails ──────────────────────────────────────────────

  /**
   * Sends an invitation email to a prospective client.
   * isExistingUser=true  → "log in and use this code"
   * isExistingUser=false → "register then use this code"
   */
  async sendCoachInvitationEmail(
    recipientEmail: string,
    coachName: string,
    gymName: string | null,
    code: string,
    link: string,
    expiresAt: Date,
    isExistingUser: boolean,
  ): Promise<boolean> {
    const expiryStr = expiresAt.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const actionBlock = isExistingUser
      ? `
        <p style="color:#374151;">Since you already have an account, simply log in and use your invitation code:</p>
        <div style="text-align:center;margin:24px 0;">
          <span style="display:inline-block;background:#f3f4f6;border:2px dashed #6b7280;border-radius:8px;padding:14px 32px;font-size:28px;font-weight:700;letter-spacing:6px;color:#111827;">${code}</span>
        </div>
        <div style="text-align:center;margin:16px 0;">
          <a href="${link}" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px;">
            Accept Invitation →
          </a>
        </div>
      `
      : `
        <p style="color:#374151;">You're just a few steps away from your first session:</p>
        <ol style="color:#374151;line-height:2.2;padding-left:20px;">
          <li>Download the app or visit our website</li>
          <li>Create your free account</li>
          <li>Enter your invitation code below to join <strong>${coachName}</strong></li>
        </ol>
        <div style="text-align:center;margin:24px 0;">
          <span style="display:inline-block;background:#f3f4f6;border:2px dashed #6b7280;border-radius:8px;padding:14px 32px;font-size:28px;font-weight:700;letter-spacing:6px;color:#111827;">${code}</span>
        </div>
        <div style="text-align:center;margin:16px 0;">
          <a href="${link}" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px;">
            Get Started →
          </a>
        </div>
      `;

    return this.sendEmail({
      from: this.configService.get('smtp.from'),
      to: recipientEmail,
      subject: `${coachName} invited you to train together — HUSSS`,
      html: `
        <!DOCTYPE html><html><head><style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        </style></head><body style="background:#f3f4f6;padding:32px 0;">
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
            <div style="background:linear-gradient(135deg,#10b981,#059669);padding:36px;text-align:center;">
              <div style="font-size:48px;margin-bottom:8px;">🏋️</div>
              <h1 style="color:#fff;margin:0;font-size:26px;">You've Been Invited!</h1>
              <p style="color:#d1fae5;margin:8px 0 0;font-size:15px;">${coachName}${gymName ? ` · ${gymName}` : ''}</p>
            </div>
            <div style="padding:36px;">
              <p style="color:#374151;font-size:16px;margin-top:0;">Hi there,</p>
              <p style="color:#374151;">
                <strong>${coachName}</strong> has personally invited you to join${gymName ? ` <strong>${gymName}</strong>` : ' their coaching team'} as a client on HUSSS.
              </p>
              ${actionBlock}
              <div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:4px;padding:12px 16px;margin:24px 0;">
                <p style="margin:0;color:#92400e;font-size:14px;">
                  ⏰ This invitation expires on <strong>${expiryStr}</strong> and can only be used once.
                </p>
              </div>
              <p style="color:#6b7280;font-size:13px;">If you weren't expecting this invitation, you can safely ignore this email.</p>
            </div>
            <div style="background:#f9fafb;padding:16px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} HUSSS. All rights reserved.</p>
            </div>
          </div>
        </body></html>`,
      text: `${coachName} invited you to join HUSSS. Code: ${code} | Link: ${link} | Expires: ${expiryStr}`,
    });
  }

  // ─── Trainee restricted / unrestricted ───────────────────────────────────
  /** Coach receives email when a client submits their PAR-Q */
  async sendParqSubmittedEmail(
    coachEmail: string,
    coachName: string,
    clientName: string,
    dashboardUrl: string,
  ): Promise<boolean> {
    return this.sendEmail({
      from: this.configService.get('smtp.from'),
      to: coachEmail,
      subject: `📋 ${clientName} submitted their PAR-Q — review required`,
      html: `
        <!DOCTYPE html><html><head></head><body style="background:#f3f4f6;padding:32px 0;font-family:Arial,sans-serif;">
          <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
            <div style="background:linear-gradient(135deg,#3b82f6,#1d4ed8);padding:28px;text-align:center;">
              <div style="font-size:40px;">📋</div>
              <h1 style="color:#fff;margin:8px 0 0;font-size:22px;">New PAR-Q Submission</h1>
            </div>
            <div style="padding:32px;">
              <p style="color:#374151;margin-top:0;">Hi <strong>${coachName}</strong>,</p>
              <p style="color:#374151;">
                <strong>${clientName}</strong> has submitted their PAR-Q health questionnaire and is waiting for your review before they can book sessions.
              </p>
              <div style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:4px;padding:12px 16px;margin:20px 0;">
                <p style="margin:0;color:#1e40af;font-size:14px;">⏳ Action required: Review and approve or reject the submission from your dashboard.</p>
              </div>
              <div style="text-align:center;margin:28px 0;">
                <a href="${dashboardUrl}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;">
                  Review PAR-Q →
                </a>
              </div>
            </div>
            <div style="background:#f9fafb;padding:16px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} HUSSS</p>
            </div>
          </div>
        </body></html>`,
      text: `${clientName} submitted their PAR-Q. Review at: ${dashboardUrl}`,
    });
  }

  /** Client receives email after coach approves or rejects their PAR-Q */
  async sendParqReviewedEmail(
    clientEmail: string,
    clientName: string,
    coachName: string,
    approved: boolean,
    notes?: string,
  ): Promise<boolean> {
    const headerBg = approved
      ? 'linear-gradient(135deg,#10b981,#059669)'
      : 'linear-gradient(135deg,#f59e0b,#d97706)';

    return this.sendEmail({
      from: this.configService.get('smtp.from'),
      to: clientEmail,
      subject: approved
        ? `✅ Your PAR-Q has been approved — you can now book sessions!`
        : `⚠️ Your PAR-Q needs attention — ${coachName}`,
      html: `
        <!DOCTYPE html><html><head></head><body style="background:#f3f4f6;padding:32px 0;font-family:Arial,sans-serif;">
          <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
            <div style="background:${headerBg};padding:28px;text-align:center;">
              <div style="font-size:40px;">${approved ? '✅' : '⚠️'}</div>
              <h1 style="color:#fff;margin:8px 0 0;font-size:22px;">${approved ? 'PAR-Q Approved!' : 'PAR-Q Needs Attention'}</h1>
            </div>
            <div style="padding:32px;">
              <p style="color:#374151;margin-top:0;">Hi <strong>${clientName}</strong>,</p>
              ${
                approved
                  ? `<p style="color:#374151;">Great news! Your coach <strong>${coachName}</strong> has reviewed and <strong style="color:#10b981;">approved</strong> your PAR-Q health questionnaire.</p>
                   <p style="color:#374151;">You can now browse available time slots and book your first session!</p>
                   <div style="background:#ecfdf5;border-left:4px solid #10b981;border-radius:4px;padding:12px 16px;margin:20px 0;">
                     <p style="margin:0;color:#065f46;font-size:14px;">🎉 Open the app to book your first training session.</p>
                   </div>`
                  : `<p style="color:#374151;">Your coach <strong>${coachName}</strong> has reviewed your PAR-Q and it requires some follow-up before you can begin training.</p>
                   ${notes ? `<div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:4px;padding:12px 16px;margin:20px 0;"><p style="margin:0;color:#92400e;font-size:14px;"><strong>Coach's notes:</strong> ${notes}</p></div>` : ''}
                   <p style="color:#374151;">Please contact your coach directly for next steps.</p>`
              }
            </div>
            <div style="background:#f9fafb;padding:16px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} HUSSS</p>
            </div>
          </div>
        </body></html>`,
      text: approved
        ? `Your PAR-Q was approved by ${coachName}. You can now book sessions!`
        : `Your PAR-Q needs attention. Coach notes: ${notes ?? 'Contact your coach.'}`,
    });
  }

  async sendClientJoinedEmail(
    coachEmail: string,
    coachName: string,
    clientName: string,
    clientEmail: string,
    dashboardUrl: string,
  ): Promise<boolean> {
    return this.sendEmail({
      from: this.configService.get('smtp.from'),
      to: coachEmail,
      subject: `🎉 ${clientName} joined your coaching team`,
      html: `
        <!DOCTYPE html><html><head></head><body style="background:#f3f4f6;padding:32px 0;font-family:Arial,sans-serif;">
          <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
            <div style="background:linear-gradient(135deg,#10b981,#059669);padding:28px;text-align:center;">
              <div style="font-size:40px;">🎉</div>
              <h1 style="color:#fff;margin:8px 0 0;font-size:22px;">New Client Joined!</h1>
            </div>
            <div style="padding:32px;">
              <p style="color:#374151;margin-top:0;">Hi <strong>${coachName}</strong>,</p>
              <p style="color:#374151;">
                <strong>${clientName}</strong> has accepted your invitation and joined your coaching team.
              </p>
              <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:20px 0;">
                <p style="margin:0 0 6px;color:#6b7280;font-size:13px;">CLIENT DETAILS</p>
                <p style="margin:4px 0;color:#111827;"><strong>${clientName}</strong></p>
                <p style="margin:4px 0;color:#6b7280;font-size:14px;">${clientEmail}</p>
              </div>
              <div style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:4px;padding:12px 16px;margin:20px 0;">
                <p style="margin:0;color:#1e40af;font-size:14px;">⏳ They need to complete their PAR-Q health questionnaire before booking sessions.</p>
              </div>
              <div style="text-align:center;margin:28px 0;">
                <a href="${dashboardUrl}" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;">
                  View Dashboard →
                </a>
              </div>
            </div>
            <div style="background:#f9fafb;padding:16px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} HUSSS</p>
            </div>
          </div>
        </body></html>`,
      text: `${clientName} (${clientEmail}) joined your HUSSS coaching team. View dashboard: ${dashboardUrl}`,
    });
  }

  async sendTraineeStatusEmail(
    clientEmail: string,
    clientName: string,
    coachName: string,
    restricted: boolean,
    reason?: string,
  ): Promise<boolean> {
    const headerBg = restricted
      ? 'linear-gradient(135deg,#ef4444,#dc2626)'
      : 'linear-gradient(135deg,#10b981,#059669)';

    return this.sendEmail({
      from: this.configService.get('smtp.from'),
      to: clientEmail,
      subject: restricted
        ? `🚫 Your HUSSS access has been restricted by ${coachName}`
        : `✅ Your HUSSS access has been restored by ${coachName}`,
      html: `
        <!DOCTYPE html><html><head></head><body style="background:#f3f4f6;padding:32px 0;font-family:Arial,sans-serif;">
          <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
            <div style="background:${headerBg};padding:28px;text-align:center;">
              <div style="font-size:40px;">${restricted ? '🚫' : '✅'}</div>
              <h1 style="color:#fff;margin:8px 0 0;font-size:22px;">${restricted ? 'Access Restricted' : 'Access Restored'}</h1>
            </div>
            <div style="padding:32px;">
              <p style="color:#374151;margin-top:0;">Hi <strong>${clientName}</strong>,</p>
              ${
                restricted
                  ? `<p style="color:#374151;">Your coach <strong>${coachName}</strong> has temporarily restricted your access to book sessions.</p>
                   ${reason ? `<div style="background:#fee2e2;border-left:4px solid #ef4444;border-radius:4px;padding:12px 16px;margin:20px 0;"><p style="margin:0;color:#991b1b;font-size:14px;"><strong>Reason:</strong> ${reason}</p></div>` : ''}
                   <p style="color:#374151;">Please contact your coach directly for more information.</p>`
                  : `<p style="color:#374151;">Your coach <strong>${coachName}</strong> has restored your access. You can now log in and book sessions again.</p>`
              }
            </div>
            <div style="background:#f9fafb;padding:16px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} HUSSS</p>
            </div>
          </div>
        </body></html>`,
      text: restricted
        ? `Your HUSSS access was restricted by ${coachName}. ${reason ?? 'Contact your coach.'}`
        : `Your HUSSS access was restored by ${coachName}. You can now book sessions.`,
    });
  }

  // ─── Private helper ───────────────────────────────────────────────────────

  private async sendEmail(
    mailOptions: nodemailer.SendMailOptions,
  ): Promise<boolean> {
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
