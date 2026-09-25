import { Router } from 'express';
import { EventsController } from './events.controller';
import { authenticateToken } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';

const router = Router();
const controller = new EventsController();

// Public routes
router.get('/public', controller.listPublic);
router.get('/public/:idOrSlug', controller.getPublicEvent);

// Authenticated organizer / admin routes
router.get('/organizer', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), controller.listOrganizerEvents);
router.get('/:idOrSlug', authenticateToken, controller.getEvent);
router.post('/', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), controller.create);
router.put('/:id', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), controller.update);
router.patch('/:id/publish', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), controller.togglePublish);

export default router;
