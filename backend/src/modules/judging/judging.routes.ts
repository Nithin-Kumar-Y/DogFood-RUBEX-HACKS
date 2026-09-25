import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';

const router = Router();

router.use(authenticateToken);
router.use(requireRole('JUDGE', 'ORGANIZER', 'ADMIN'));

router.get('/status', (req, res) => {
  res.json({
    status: 'TIER_1_ACTIVE',
    judgingEngineState: 'PREPARED_FOR_TIER_2',
    message: 'Judging engine contracts and database extension points are configured. Scored evaluation workflow activates in Tier 2.'
  });
});

export default router;
