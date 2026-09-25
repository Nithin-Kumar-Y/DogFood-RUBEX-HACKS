import { Router } from 'express';
import { AdminController } from './admin.controller';
import { authenticateToken } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';

const router = Router();
const controller = new AdminController();

router.use(authenticateToken);
router.use(requireRole('ADMIN'));

router.get('/stats', controller.getStats);
router.get('/users', controller.getUsers);

export default router;
