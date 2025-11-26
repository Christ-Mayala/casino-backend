import { Request, Response } from 'express';
import { getCloudinarySignature } from '../services/cloudinary';

export const uploadController = {
  getSignature: async (req: Request, res: Response) => {
    try {
      const { folder, public_id } = req.body as { folder?: string; public_id?: string };
      const sig = getCloudinarySignature({ folder, public_id });
      if (!sig) return res.status(500).json({ success: false, error: 'Failed to generate signature' });
      res.json({ success: true, data: sig });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to generate signature' });
    }
  },
};
