import { Controller, Get, Param, Res, HttpStatus } from '@nestjs/common';
import express from 'express';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Controller('invite')
export class InviteRedirectController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * GET /invite/:code
   *
   * Smart HTML page that:
   *   1. Validates the code
   *   2. Tries to open the app via custom scheme (husss://invite/CODE)
   *   3. If app not installed → redirects to Play Store / App Store
   *   4. If code invalid/expired → shows error message
   *
   * This URL is what goes in emails and SMS messages.
   */
  @Get(':code')
  async handleInvite(
    @Param('code') code: string,
    @Res() res: express.Response,
  ) {
    // Validate code
    const invitation = await this.prisma.coachInvitation.findUnique({
      where: { code },
      include: {
        coach: { include: { user: { select: { name: true, avatar: true } } } },
      },
    });

    const appScheme = this.config.get('APP_SCHEME') ?? 'husss';
    const playStoreUrl = this.config.get('PLAY_STORE_URL') ?? '#';
    const appStoreUrl = this.config.get('APP_STORE_URL') ?? '#';
    const deepLinkUrl = `${appScheme}://invite/${code}`;

    // ── Invalid / expired / used ─────────────────────────────────────────
    if (!invitation) {
      return res
        .status(HttpStatus.OK)
        .send(
          this.errorPage(
            'Invalid Invitation',
            'This invitation link is not valid. Please ask your coach to send a new one.',
          ),
        );
    }
    if (invitation.isUsed) {
      return res
        .status(HttpStatus.OK)
        .send(
          this.errorPage(
            'Already Used',
            'This invitation has already been used. Contact your coach if you need a new one.',
          ),
        );
    }
    if (invitation.expiresAt < new Date()) {
      return res
        .status(HttpStatus.OK)
        .send(
          this.errorPage(
            'Invitation Expired',
            'This invitation link has expired. Please ask your coach to send a new one.',
          ),
        );
    }

    // ── Valid invitation — render smart redirect page ────────────────────
    const coachName = invitation.coach.user.name ?? 'Your Coach';
    const gymName = invitation.coach.gymName ?? '';
    const expiryDate = invitation.expiresAt.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    return res
      .status(HttpStatus.OK)
      .send(
        this.redirectPage({
          code,
          coachName,
          gymName,
          expiryDate,
          deepLinkUrl,
          playStoreUrl,
          appStoreUrl,
        }),
      );
  }

  // ── HTML: Smart redirect page ────────────────────────────────────────────

  private redirectPage(data: {
    code: string;
    coachName: string;
    gymName: string;
    expiryDate: string;
    deepLinkUrl: string;
    playStoreUrl: string;
    appStoreUrl: string;
  }): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Join ${data.coachName} on HUSSS</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0a0a0a; color: #fff;
      min-height: 100vh; display: flex; flex-direction: column;
      align-items: center; justify-content: center; padding: 24px;
    }
    .card {
      background: #1a1a1a; border-radius: 20px;
      padding: 40px 32px; max-width: 400px; width: 100%;
      text-align: center; border: 1px solid #333;
    }
    .logo { font-size: 32px; font-weight: 800; color: #E5B94B; margin-bottom: 8px; }
    .subtitle { color: #888; font-size: 14px; margin-bottom: 32px; }
    .coach-section { margin-bottom: 28px; }
    .coach-name { font-size: 22px; font-weight: 700; color: #fff; }
    .gym-name { color: #888; font-size: 14px; margin-top: 4px; }
    .invite-label { color: #888; font-size: 13px; margin-bottom: 12px; }
    .code-box {
      background: #252525; border-radius: 12px; padding: 16px;
      font-size: 28px; font-weight: 800; letter-spacing: 6px;
      color: #E5B94B; margin-bottom: 8px;
    }
    .expiry { color: #666; font-size: 12px; margin-bottom: 32px; }
    .btn {
      display: block; width: 100%; padding: 16px;
      border-radius: 12px; font-size: 16px; font-weight: 700;
      cursor: pointer; border: none; text-decoration: none;
      margin-bottom: 12px;
    }
    .btn-primary { background: #E5B94B; color: #000; }
    .btn-android { background: #34A853; color: #fff; }
    .btn-ios     { background: #007AFF; color: #fff; }
    .btn-secondary {
      background: transparent; color: #888;
      border: 1px solid #333; font-size: 14px; padding: 12px;
    }
    .divider { color: #444; font-size: 12px; margin: 16px 0; }
    #status { color: #888; font-size: 13px; margin-top: 16px; min-height: 20px; }
    .store-row { display: flex; gap: 12px; margin-bottom: 12px; }
    .store-row .btn { margin-bottom: 0; flex: 1; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">HUSSS</div>
    <div class="subtitle">Fitness Coaching Platform</div>
 
    <div class="coach-section">
      <div class="invite-label">You've been invited by</div>
      <div class="coach-name">${data.coachName}</div>
      ${data.gymName ? `<div class="gym-name">${data.gymName}</div>` : ''}
    </div>
 
    <div class="invite-label">Your invitation code</div>
    <div class="code-box">${data.code}</div>
    <div class="expiry">Expires ${data.expiryDate}</div>
 
    <!-- Open in app (if installed) -->
    <button class="btn btn-primary" onclick="openApp()">
      Open in HUSSS App
    </button>
 
    <div class="divider">— or download the app —</div>
 
    <div class="store-row">
      <a href="${data.playStoreUrl}" class="btn btn-android">▶ Google Play</a>
      <a href="${data.appStoreUrl}"  class="btn btn-ios">  App Store</a>
    </div>
 
    <div class="divider">— don't have the app? —</div>
    <a href="#" class="btn btn-secondary" onclick="copyCode()">Copy Code: ${data.code}</a>
 
    <div id="status"></div>
  </div>
 
  <script>
    const DEEP_LINK    = '${data.deepLinkUrl}';
    const PLAY_STORE   = '${data.playStoreUrl}';
    const APP_STORE    = '${data.appStoreUrl}';
    const INVITE_CODE  = '${data.code}';
 
    // Detect platform
    const ua         = navigator.userAgent;
    const isAndroid  = /android/i.test(ua);
    const isIOS      = /iphone|ipad|ipod/i.test(ua);
 
    function setStatus(msg) {
      document.getElementById('status').textContent = msg;
    }
 
    function openApp() {
      setStatus('Opening HUSSS app...');
 
      // Try custom scheme deeplink
      window.location.href = DEEP_LINK;
 
      // If app not installed, redirect to store after 2.5s
      // (if app opens, this timeout won't matter — page goes to background)
      const fallbackTimer = setTimeout(() => {
        setStatus('App not found. Redirecting to store...');
        if (isAndroid) {
          window.location.href = PLAY_STORE;
        } else if (isIOS) {
          window.location.href = APP_STORE;
        } else {
          // Desktop — just show the code
          setStatus('Download HUSSS on Android or iOS to accept this invitation.');
        }
      }, 2500);
 
      // Cancel fallback if page goes to background (app opened)
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) clearTimeout(fallbackTimer);
      });
    }
 
    function copyCode() {
      navigator.clipboard?.writeText(INVITE_CODE)
        .then(() => setStatus('Code copied! Open HUSSS and enter it.'))
        .catch(() => setStatus('Your code: ' + INVITE_CODE));
      return false;
    }
 
    // Auto-attempt deeplink on page load for mobile
    if (isAndroid || isIOS) {
      setTimeout(() => openApp(), 800);
    }
  </script>
</body>
</html>`;
  }

  // ── HTML: Error page ──────────────────────────────────────────────────────

  private errorPage(title: string, message: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — HUSSS</title>
  <style>
    body { font-family: -apple-system, sans-serif; background:#0a0a0a; color:#fff;
           min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
    .card { background:#1a1a1a; border-radius:20px; padding:40px 32px;
            max-width:400px; text-align:center; border:1px solid #333; }
    .icon { font-size:48px; margin-bottom:16px; }
    h2 { color:#E5B94B; margin-bottom:12px; }
    p  { color:#888; font-size:14px; line-height:1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⚠️</div>
    <h2>${title}</h2>
    <p>${message}</p>
  </div>
</body>
</html>`;
  }
}
