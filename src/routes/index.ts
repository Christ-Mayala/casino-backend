import { Router } from 'express';
import auth from './auth';
import products from './products';
import categories from './categories';
import stock from './stock';
import activity from './activity';
import maintenance from './maintenance';
import upload from './upload';
import staffAuth from './staffAuth';

const router = Router();

router.use('/auth', auth);
router.use('/products', products);
router.use('/categories', categories);
router.use('/stock', stock);
router.use('/upload', upload);
router.use('/staff/auth', staffAuth);
router.use('/staff/activity', activity);
router.use('/staff/maintenance', maintenance);

export default router;
