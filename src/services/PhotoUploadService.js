const cloudinary = require('../utils/cloudinary');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

/**
 * PhotoUploadService
 * 
 * Handles photo uploads for reviews, including validation, compression, and storage.
 * Photos are uploaded to Cloudinary with automatic compression and resizing.
 */
class PhotoUploadService {
  /**
   * Upload review photos to Cloudinary
   * 
   * @param {Array<Object>} photos - Array of photo file objects from multer
   * @param {string} reviewId - Review ID for folder organization
   * @returns {Promise<Object>} Result with uploaded URLs and any errors
   */
  async uploadPhotos(photos, reviewId) {
    const results = [];
    const errors = [];

    if (!photos || photos.length === 0) {
      return { urls: [], errors: [] };
    }

    // Validate photos first
    const validation = this.validatePhotos(photos);
    if (!validation.valid) {
      return { urls: [], errors: validation.errors };
    }

    for (const photo of photos) {
      try {
        // Compress photo before upload
        const compressedBuffer = await this.compressPhoto(photo);

        // Upload to Cloudinary
        const result = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: `reviews/${reviewId}`,
              resource_type: 'image',
              transformation: [
                { width: 1200, crop: 'limit' },
                { quality: 'auto:good' },
                { fetch_format: 'auto' }
              ]
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );

          uploadStream.end(compressedBuffer);
        });

        results.push(result.secure_url);

        // Clean up temporary file if it exists
        if (photo.path) {
          try {
            await fs.unlink(photo.path);
          } catch (unlinkError) {
            console.error('[PhotoUpload] Failed to delete temp file:', unlinkError);
          }
        }

      } catch (error) {
        console.error('[PhotoUpload] Upload failed:', error);
        errors.push({
          file: photo.originalname || photo.name,
          error: error.message || 'Upload failed'
        });
      }
    }

    return { urls: results, errors };
  }

  /**
   * Validate photo files
   * 
   * @param {Array<Object>} photos - Array of photo file objects
   * @returns {Object} Validation result with valid flag and errors array
   */
  validatePhotos(photos) {
    const errors = [];

    // Check photo count
    if (photos.length > 5) {
      errors.push({
        type: 'count',
        message: 'Maximum 5 photos allowed per review'
      });
      return { valid: false, errors };
    }

    // Validate each photo
    for (const photo of photos) {
      const fileName = photo.originalname || photo.name || 'unknown';

      // Validate file size (5MB max)
      const maxSize = 5 * 1024 * 1024; // 5MB in bytes
      if (photo.size > maxSize) {
        errors.push({
          file: fileName,
          type: 'size',
          message: `File size exceeds 5MB (${(photo.size / 1024 / 1024).toFixed(2)}MB)`
        });
      }

      // Validate file format
      const validMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      const mimeType = photo.mimetype || photo.type;
      
      if (!mimeType || !validMimeTypes.includes(mimeType.toLowerCase())) {
        errors.push({
          file: fileName,
          type: 'format',
          message: 'Invalid file type. Only JPG, PNG, and WEBP are allowed'
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Compress photo using sharp
   * 
   * @param {Object} photo - Photo file object
   * @returns {Promise<Buffer>} Compressed photo buffer
   */
  async compressPhoto(photo) {
    try {
      let inputBuffer;

      // Get buffer from file
      if (photo.buffer) {
        inputBuffer = photo.buffer;
      } else if (photo.path) {
        inputBuffer = await fs.readFile(photo.path);
      } else {
        throw new Error('No photo data available');
      }

      // Compress and resize using sharp
      const compressed = await sharp(inputBuffer)
        .resize(1200, null, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({
          quality: 85,
          progressive: true
        })
        .toBuffer();

      return compressed;

    } catch (error) {
      console.error('[PhotoUpload] Compression failed:', error);
      throw new Error(`Photo compression failed: ${error.message}`);
    }
  }

  /**
   * Delete photos from Cloudinary
   * 
   * @param {Array<string>} photoUrls - Array of Cloudinary photo URLs
   * @returns {Promise<Object>} Deletion results
   */
  async deletePhotos(photoUrls) {
    const results = [];
    const errors = [];

    if (!photoUrls || photoUrls.length === 0) {
      return { deleted: [], errors: [] };
    }

    for (const url of photoUrls) {
      try {
        // Extract public_id from Cloudinary URL
        const publicId = this.extractPublicId(url);
        
        if (!publicId) {
          errors.push({
            url,
            error: 'Invalid Cloudinary URL'
          });
          continue;
        }

        // Delete from Cloudinary
        const result = await cloudinary.uploader.destroy(publicId);
        
        if (result.result === 'ok') {
          results.push(url);
        } else {
          errors.push({
            url,
            error: result.result || 'Deletion failed'
          });
        }

      } catch (error) {
        console.error('[PhotoUpload] Delete failed:', error);
        errors.push({
          url,
          error: error.message || 'Deletion failed'
        });
      }
    }

    return { deleted: results, errors };
  }

  /**
   * Extract Cloudinary public_id from URL
   * 
   * @param {string} url - Cloudinary URL
   * @returns {string|null} Public ID or null if invalid
   */
  extractPublicId(url) {
    try {
      // Cloudinary URL format: https://res.cloudinary.com/{cloud_name}/image/upload/v{version}/{public_id}.{format}
      const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/);
      return match ? match[1] : null;
    } catch (error) {
      console.error('[PhotoUpload] Failed to extract public_id:', error);
      return null;
    }
  }
}

module.exports = new PhotoUploadService();
