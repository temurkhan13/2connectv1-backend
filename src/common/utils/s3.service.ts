import {
  Injectable,
  InternalServerErrorException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  S3ClientConfig,
} from '@aws-sdk/client-s3';
import * as crypto from 'crypto';
import type { Response } from 'express';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { pipeline } from 'stream/promises';

/**
 * S3Service
 * ---------
 * Purpose:
 * - Upload, delete, and stream files with AWS S3.
 *
 * Summary:
 * - Uses AWS SDK v3 S3Client.
 * - `uploadBuffer()`: uploads a buffer and returns bucket, key, url, etag.
 * - `deleteByUrl()`: deletes an object by its S3/CDN URL.
 * - `streamToResponseByUrl()`: streams an object to the HTTP response.
 * - Helper methods build public URLs, sanitize names, and parse URLs.
 */

type UploadBufferOptions = {
  buffer: Buffer; // file data
  contentType: string; // e.g. 'image/png'
  originalName: string; // original file name
  keyPrefix?: string; // e.g. 'users/123/resumes/'
  cacheControl?: string; // e.g. 'public, max-age=31536000'
  acl?: 'private' | 'public-read'; // object ACL
};

type UploadResult = {
  bucket: string;
  key: string; // S3 object key
  url: string; // public or CDN URL
  etag?: string; // S3 ETag
};

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);

  // Required environment variables
  private readonly bucket = process.env.AWS_S3_BUCKET!;
  private readonly region = process.env.AWS_REGION!;

  // Optional CDN/CloudFront base (e.g., https://cdn.example.com)
  private readonly publicBaseUrl = process.env.AWS_S3_PUBLIC_BASE_URL;

  // AWS SDK v3 client
  private readonly s3: S3Client;

  constructor() {
    // Build S3 client config
    const clientCfg: S3ClientConfig = { region: this.region };

    // Use static keys if provided; otherwise rely on IAM role
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const sessionToken = process.env.AWS_SESSION_TOKEN;

    if (accessKeyId && secretAccessKey) {
      clientCfg.credentials = {
        accessKeyId,
        secretAccessKey,
        ...(sessionToken ? { sessionToken } : {}),
      };
    }

    this.s3 = new S3Client(clientCfg);
  }

  /**
   * Upload a file buffer to S3.
   * - Creates a unique key with UUID + sanitized original name.
   * - Returns bucket, key, url, and etag.
   */
  async uploadBuffer(opts: UploadBufferOptions): Promise<UploadResult> {
    try {
      const safeName = this.sanitizeName(opts.originalName);
      const key = `${opts.keyPrefix ?? ''}${crypto.randomUUID()}-${safeName}`;

      const cmd = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: opts.buffer,
        ContentType: opts.contentType,
        CacheControl: opts.cacheControl,
        ACL: opts.acl,
      });

      const out = await this.s3.send(cmd);
      const url = this.buildPublicUrl(this.bucket, key);

      return { bucket: this.bucket, key, url, etag: out.ETag };
    } catch (err) {
      this.logger.error(`uploadBuffer failed: ${String(err)}`);
      throw new InternalServerErrorException('Failed to upload file to S3');
    }
  }

  /**
   * Delete an object using its URL.
   * - Supports CDN base, virtual-hosted, and path-style URLs.
   */
  async deleteByUrl(url: string): Promise<{ bucket: string; key: string }> {
    const parsed = this.parseS3Url(url);
    if (!parsed) throw new BadRequestException('Unsupported S3 URL format');

    const { bucket, key } = parsed;
    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      return { bucket, key };
    } catch (err) {
      this.logger.error(`deleteByUrl failed for ${bucket}/${key}: ${String(err)}`);
      throw new InternalServerErrorException('Failed to delete file from S3');
    }
  }

  /**
   * Stream an S3 object (by URL) to the HTTP response.
   * - `inline=true` displays in browser.
   * - `inline=false` downloads as attachment.
   * - Uses pipeline(...) to stream.
   */
  async streamToResponseByUrl(
    res: Response,
    fileUrl: string,
    opts: { inline?: boolean; downloadName?: string; extraCacheControl?: string } = {},
  ): Promise<void> {
    const { inline = true, downloadName, extraCacheControl } = opts;

    const parsed = this.parseS3Url(fileUrl);
    if (!parsed) {
      res.status(400).send('Unsupported S3 URL format');
      return;
    }

    const { bucket, key } = parsed;

    try {
      const out = await this.s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

      const contentType = out.ContentType ?? 'application/octet-stream';
      const contentLength = out.ContentLength ?? undefined;
      const etag = out.ETag ?? undefined;
      const lastModified = out.LastModified?.toUTCString();

      const cacheControl =
        extraCacheControl ?? out.CacheControl ?? (inline ? 'public, max-age=300' : 'no-store');

      const safeName =
        downloadName ??
        key.split('/').pop() ??
        (contentType.startsWith('image/') ? 'image' : 'file');

      const disposition = inline
        ? `inline; filename="${safeName}"`
        : `attachment; filename="${safeName}"`;

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', disposition);
      if (cacheControl) res.setHeader('Cache-Control', cacheControl);
      if (etag) res.setHeader('ETag', etag);
      if (lastModified) res.setHeader('Last-Modified', lastModified);
      if (typeof contentLength === 'number')
        res.setHeader('Content-Length', contentLength.toString());

      await pipeline(out.Body as NodeJS.ReadableStream, res);
    } catch (err) {
      this.logger.error(`streamToResponseByUrl failed for ${bucket}/${key}: ${String(err)}`);
      if (!res.headersSent) res.status(404).send('File not found or access denied');
    }
  }

  // ── helpers ───────────────────────────────────────────────────────────────────

  /**
   * Build a public URL for the object.
   * - Uses CDN base when set; otherwise uses AWS virtual-hosted URL.
   */
  private buildPublicUrl(bucket: string, key: string): string {
    if (this.publicBaseUrl) return `${this.publicBaseUrl.replace(/\/+$/, '')}/${key}`;
    return `https://${bucket}.s3.${this.region}.amazonaws.com/${encodeURI(key)}`;
  }

  /**
   * Sanitize file names for URLs/keys.
   * - Trim and normalize.
   * - Replace spaces and unsafe characters with underscores.
   */
  private sanitizeName(name: string): string {
    return name
      .trim()
      .normalize('NFKC')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_');
  }

  /**
   * Parse S3 or CDN URL into { bucket, key }.
   * - CDN base (AWS_S3_PUBLIC_BASE_URL).
   * - Virtual-hosted: https://<bucket>.s3.<region>.amazonaws.com/<key>
   * - Path-style:     https://s3.<region>.amazonaws.com/<bucket>/<key>
   */
  private parseS3Url(urlStr: string): { bucket: string; key: string } | null {
    try {
      const u = new URL(urlStr);

      // CDN case
      if (this.publicBaseUrl) {
        const base = new URL(this.publicBaseUrl);
        if (u.host === base.host) {
          const key = u.pathname.replace(/^\/+/, '');
          return { bucket: this.bucket, key };
        }
      }

      // Virtual-hosted-style
      const vh = u.host.match(/^([^.]*)\.s3(?:[.-]([a-z0-9-]+))?\.amazonaws\.com$/i);
      if (vh) return { bucket: vh[1], key: u.pathname.replace(/^\/+/, '') };

      // Path-style
      const ps = u.host.match(/^s3[.-]([a-z0-9-]+)\.amazonaws\.com$/i);
      if (ps) {
        const path = u.pathname.replace(/^\/+/, '');
        const i = path.indexOf('/');
        if (i > 0) return { bucket: path.substring(0, i), key: path.substring(i + 1) };
      }
      return null;
    } catch {
      return null;
    }
  }
}
