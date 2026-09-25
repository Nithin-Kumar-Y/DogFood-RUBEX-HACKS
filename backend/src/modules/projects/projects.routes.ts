import { Router } from 'express';
import { ProjectsController } from './projects.controller';
import { authenticateToken } from '../../middleware/auth';

const router = Router();
const controller = new ProjectsController();

router.use(authenticateToken);

router.get('/my', controller.getMyProjects);
router.get('/:id', controller.getProject);
router.post('/draft', controller.saveDraft);
router.put('/:id/draft', controller.saveDraft);

export default router;
