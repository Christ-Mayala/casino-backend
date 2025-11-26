import { Router } from 'express';
import { stockController } from '../controllers/stockController';
import { authJWT, requireRole } from '../middlewares/authJWT';

const router = Router();

router.post('/in', authJWT, requireRole('admin','preparateur'), stockController.in);
router.post('/out', authJWT, requireRole('admin','preparateur'), stockController.out);
router.post('/adjust', authJWT, requireRole('admin','preparateur'), stockController.adjust);
router.get('/movements', authJWT, requireRole('admin','preparateur'), stockController.movements);
router.get('/inventory/levels', authJWT, requireRole('admin','preparateur'), stockController.inventoryLevels);

export default router;
