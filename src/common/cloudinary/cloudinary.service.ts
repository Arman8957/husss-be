import { Injectable, Inject } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  constructor(
    @Inject('CLOUDINARY') private readonly cloudinaryInstance: typeof cloudinary,
  ) {}

  /**
   * Uploads an image buffer to Cloudinary using a stream.
   * @param buffer - The file buffer (e.g., from Multer)
   * @param folderName - Cloudinary folder (will be created if missing)
   * @param fileName - Desired public_id (without extension; Cloudinary appends format)
   * @returns Promise<UploadApiResponse> - Cloudinary upload result
   * @throws Error if upload fails
   */
  async uploadImageFromBuffer(
    buffer: Buffer,
    folderName: string,
    fileName: string,
  ): Promise<UploadApiResponse> {
    return new Promise<UploadApiResponse>((resolve, reject) => {
      const uploadStream = this.cloudinaryInstance.uploader.upload_stream(
        {
          folder: folderName,
          public_id: fileName,
          // Optional: add more options if needed
          // resource_type: 'image',
          // overwrite: true,
          // tags: ['exercise', 'bfr'],
        },
        (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
          if (error) {
            reject(error); // Cloudinary error object with http_code, message, etc.
            return;
          }

          if (!result) {
            reject(new Error('Cloudinary upload succeeded but returned no result'));
            return;
          }

          resolve(result);
        },
      );

      // Pipe the buffer into the stream
      uploadStream.end(buffer);
    });
  }
}