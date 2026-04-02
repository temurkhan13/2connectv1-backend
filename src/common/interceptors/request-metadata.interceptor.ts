import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * RequestMetadataInterceptor
 * --------------------------
 * Extracts client metadata from request headers and attaches it to req.clientMetadata.
 * This data is used to enrich activity logs with device, location, and platform info.
 *
 * Headers consumed:
 * - X-Platform: "web" | "mobile-app" | "mobile-browser"
 * - X-App-Version: client build version
 * - X-Screen: "1920x1080" screen dimensions
 * - X-Timezone: "America/New_York" IANA timezone
 * - X-Language: "en-US" browser/device language
 * - X-Network: "4g" | "wifi" connection quality
 * - User-Agent: parsed into device, os, browser
 * - X-Forwarded-For: client IP address
 */
@Injectable()
export class RequestMetadataInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();

    const userAgent = req.headers['user-agent'] || '';
    const forwarded = req.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : req.ip || req.connection?.remoteAddress || null;

    // Parse User-Agent into device/os/browser without external dependency
    const parsed = this.parseUserAgent(userAgent);

    req.clientMetadata = {
      ip: ip || null,
      platform: req.headers['x-platform'] || this.inferPlatform(userAgent),
      device: parsed.device,
      os: parsed.os,
      browser: parsed.browser,
      app_version: req.headers['x-app-version'] || null,
      screen: req.headers['x-screen'] || null,
      timezone: req.headers['x-timezone'] || null,
      language: req.headers['x-language'] || null,
      network: req.headers['x-network'] || null,
      user_agent: userAgent.substring(0, 300), // truncate long UAs
    };

    return next.handle();
  }

  /**
   * Simple User-Agent parser — no external dependency needed.
   * Covers the common cases: Chrome, Safari, Firefox, mobile devices.
   */
  private parseUserAgent(ua: string): { device: string; os: string; browser: string } {
    let device = 'Unknown';
    let os = 'Unknown';
    let browser = 'Unknown';

    // OS detection
    if (/iPhone/.test(ua)) { os = 'iOS'; device = 'iPhone'; }
    else if (/iPad/.test(ua)) { os = 'iOS'; device = 'iPad'; }
    else if (/Android/.test(ua)) {
      os = 'Android';
      const match = ua.match(/Android\s[\d.]+;\s*([^)]+)\)/);
      device = match ? match[1].split('Build')[0].trim() : 'Android Device';
    }
    else if (/Mac OS X/.test(ua)) { os = 'macOS'; device = 'Mac'; }
    else if (/Windows/.test(ua)) { os = 'Windows'; device = 'PC'; }
    else if (/Linux/.test(ua)) { os = 'Linux'; device = 'PC'; }

    // Browser detection
    if (/Expo/.test(ua) || /okhttp/.test(ua)) { browser = 'Expo/React Native'; }
    else if (/Edg\//.test(ua)) { browser = 'Edge'; }
    else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) { browser = 'Chrome'; }
    else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) { browser = 'Safari'; }
    else if (/Firefox\//.test(ua)) { browser = 'Firefox'; }

    return { device, os, browser };
  }

  /**
   * Infer platform from User-Agent if X-Platform header not sent
   */
  private inferPlatform(ua: string): string {
    if (/Expo/.test(ua) || /okhttp/.test(ua)) return 'mobile-app';
    if (/Mobile|Android|iPhone|iPad/.test(ua)) return 'mobile-browser';
    return 'web';
  }
}
