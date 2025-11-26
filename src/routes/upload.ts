import { Router } from 'express';
import { uploadController } from '../controllers/uploadController';
import { authJWT, requireRole } from '../middlewares/authJWT';

const router = Router();

router.post('/signature', authJWT, requireRole('admin'), uploadController.getSignature);

export default router;
