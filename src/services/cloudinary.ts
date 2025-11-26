import { v2 as cloudinary } from 'cloudinary';

export function initializeCloudinaryService(): boolean {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    console.warn('⚠️ Cloudinary credentials not configured. Image upload service disabled.');
    console.warn('Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env');
    return false;
  }

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
  console.log('✅ Cloudinary service initialized');
  return true;
}

export function getCloudinarySignature(params?: { folder?: string; public_id?: string }) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return null;

  const timestamp = Math.round(Date.now() / 1000);
  const folder = params?.folder || 'products';
  const toSign: Record<string, any> = { timestamp, folder };
  if (params?.public_id) toSign.public_id = params.public_id;
  const signature = cloudinary.utils.api_sign_request(toSign, apiSecret);

  return { signature, timestamp, cloudName, apiKey, folder };
}
