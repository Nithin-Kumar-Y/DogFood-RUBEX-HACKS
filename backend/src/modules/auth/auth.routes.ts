import { Router } from 'express';
import { AuthController } from './auth.controller';
import { authenticateToken } from '../../middleware/auth';
import { rateLimiter } from '../../middleware/rate-limiter';

const router = Router();
const controller = new AuthController();

// Auth rate limiting: 30 requests per minute
const authLimiter = rateLimiter({ windowMs: 60 * 1000, max: 30 });

router.post('/register', authLimiter, controller.register);
router.post('/login', authLimiter, controller.login);
router.post('/logout', authenticateToken, controller.logout);
router.get('/me', authenticateToken, controller.me);

export default router;
