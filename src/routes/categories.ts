import { Router } from 'express';
import { categoryController } from '../controllers/categoryController';
import { authJWT, requireRole } from '../middlewares/authJWT';

const router = Router();

router.get('/', categoryController.list);
router.get('/:id', categoryController.get);
router.post('/', authJWT, requireRole('admin'), categoryController.create);
router.put('/:id', authJWT, requireRole('admin'), categoryController.update);
router.delete('/:id', authJWT, requireRole('admin'), categoryController.remove);

export default router;
