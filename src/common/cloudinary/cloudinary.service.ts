// src/common/cloudinary/cloudinary.service.ts
//
// ── FIXES ────────────────────────────────────────────────────────────────────
// Fix 1: uploadImageFromBuffer used resource_type:'image' for ALL uploads.
//        MP4/WebM/MOV files need resource_type:'video' — Cloudinary rejects videos
//        sent as resource_type:'image' with "Invalid image file" error.
//
// Fix 2: Added uploadFileFromBuffer() which auto-detects resource_type from extension.
//        The controller now uses this method instead of uploadImageFromBuffer for videos.
//
// Fix 3: Added uploadFromUrl() — stores a remote URL in Cloudinary (fetch upload).
//        Used when admin passes exerciseImageUrl/exerciseAnimationUrl as URLs,
//        not as file uploads. This ensures all media is stored in your Cloudinary account.
// ─────────────────────────────────────────────────────────────────────────────

import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

export type CloudinaryUploadResult = {
  public_id:   string;
  secure_url:  string;
  url:         string;
  format:      string;
  resource_type: string;
  bytes:       number;
  width?:      number;
  height?:     number;
  duration?:   number; // seconds, for video
};

// File extensions that require resource_type:'video'
const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|avi|mkv|m4v|flv)$/i;
// File extensions that require resource_type:'image' (includes gif)
const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|webp|gif|bmp|tiff|svg)$/i;

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(private readonly config: ConfigService) {
    cloudinary.config({
      cloud_name: this.config.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key:    this.config.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.config.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  // ── Detect resource type from filename ───────────────────────────────────

  private getResourceType(filename: string): 'image' | 'video' | 'raw' {
    if (VIDEO_EXTENSIONS.test(filename)) return 'video';
    if (IMAGE_EXTENSIONS.test(filename)) return 'image';
    return 'raw';
  }

  // ── Upload from Buffer (file upload) ─────────────────────────────────────

  /**
   * Upload any file buffer to Cloudinary.
   * Automatically detects resource_type from filename extension.
   *
   * @param buffer     - File buffer (from multer memoryStorage)
   * @param folder     - Cloudinary folder (e.g. 'exercises/images', 'exercises/videos')
   * @param publicId   - Public ID for the asset (without extension)
   * @param filename   - Original filename (used to detect resource_type)
   */
  async uploadFileFromBuffer(
    buffer:   Buffer,
    folder:   string,
    publicId: string,
    filename: string,
  ): Promise<CloudinaryUploadResult> {
    const resourceType = this.getResourceType(filename);

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id:     publicId,
          resource_type: resourceType,
          // For videos: generate thumbnail automatically
          ...(resourceType === 'video' && {
            eager: [{ format: 'jpg', transformation: [{ width: 400, crop: 'scale' }] }],
          }),
          // For images: auto-optimize quality
          ...(resourceType === 'image' && {
            quality:          'auto',
            fetch_format:     'auto',
          }),
        },
        (error, result) => {
          if (error || !result) {
            this.logger.error(`Cloudinary upload failed for ${filename}: ${error?.message}`);
            reject(
              new InternalServerErrorException(
                `Media upload failed: ${error?.message ?? 'Unknown error'}`,
              ),
            );
          } else {
            resolve({
              public_id:     result.public_id,
              secure_url:    result.secure_url,
              url:           result.url,
              format:        result.format,
              resource_type: result.resource_type,
              bytes:         result.bytes,
              width:         result.width,
              height:        result.height,
              duration:      (result as any).duration,
            });
          }
        },
      );

      uploadStream.end(buffer);
    });
  }

  /**
   * Upload image buffer to Cloudinary (backward-compat alias).
   * For new code, prefer uploadFileFromBuffer() which handles both images and videos.
   */
  async uploadImageFromBuffer(
    buffer:   Buffer,
    folder:   string,
    publicId: string,
  ): Promise<CloudinaryUploadResult> {
    return this.uploadFileFromBuffer(buffer, folder, publicId, `${publicId}.jpg`);
  }

  // ── Upload from URL (fetch upload) ────────────────────────────────────────

  /**
   * Store a remote URL in Cloudinary (fetch upload).
   * Used when admin passes a CDN URL directly instead of uploading a file.
   * This proxies the URL through Cloudinary so you have a copy in your account.
   *
   * Set CLOUDINARY_STORE_REMOTE_URLS=false in .env to skip this and use the URL as-is.
   *
   * @param url      - Remote URL to fetch and store
   * @param folder   - Cloudinary folder
   * @param publicId - Public ID for the asset
   */
  async uploadFromUrl(
    url:      string,
    folder:   string,
    publicId: string,
  ): Promise<CloudinaryUploadResult> {
    const storeRemote = this.config.get<string>('CLOUDINARY_STORE_REMOTE_URLS') !== 'false';

    // If storing is disabled, return the original URL in the expected shape
    if (!storeRemote) {
      return {
        public_id:     publicId,
        secure_url:    url,
        url:           url,
        format:        url.split('.').pop() ?? '',
        resource_type: VIDEO_EXTENSIONS.test(url) ? 'video' : 'image',
        bytes:         0,
      };
    }

    const resourceType = this.getResourceType(url);

    try {
      const result = await cloudinary.uploader.upload(url, {
        folder,
        public_id:     publicId,
        resource_type: resourceType,
      });

      return {
        public_id:     result.public_id,
        secure_url:    result.secure_url,
        url:           result.url,
        format:        result.format,
        resource_type: result.resource_type,
        bytes:         result.bytes,
        width:         result.width,
        height:        result.height,
        duration:      (result as any).duration,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not fetch remote URL into Cloudinary: ${msg}. Using original URL.`);
      // Fallback: return original URL (non-fatal)
      return {
        public_id:     publicId,
        secure_url:    url,
        url:           url,
        format:        url.split('.').pop()?.split('?')[0] ?? '',
        resource_type: resourceType,
        bytes:         0,
      };
    }
  }

  // ── Delete asset ──────────────────────────────────────────────────────────

  async deleteFile(publicId: string, resourceType: 'image' | 'video' | 'raw' = 'image') {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to delete Cloudinary asset ${publicId}: ${msg}`);
    }
  }
}