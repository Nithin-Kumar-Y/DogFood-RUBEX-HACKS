import { Router } from 'express';
import { SubmissionsController } from './submissions.controller';
import { authenticateToken } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';

const router = Router();
const controller = new SubmissionsController();

// Participants submit project
router.post('/projects/:projectId/submit', authenticateToken, controller.submitProject);

// Organizers / Admins review all submissions
router.get('/', authenticateToken, requireRole('ORGANIZER', 'ADMIN'), controller.listSubmissions);

export default router;
