import { Router } from 'express';
import { TeamsController } from './teams.controller';
import { authenticateToken } from '../../middleware/auth';

const router = Router();
const controller = new TeamsController();

// All team routes require authentication
router.use(authenticateToken);

router.get('/my', controller.getMyTeams);
router.post('/join', controller.acceptInvite);
router.get('/:id', controller.getTeam);
router.post('/', controller.createTeam);
router.post('/:id/invite', controller.inviteMember);
router.post('/:id/leave', controller.leaveTeam);

export default router;
