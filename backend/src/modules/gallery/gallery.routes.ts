import { Router } from 'express';
import { GalleryController } from './gallery.controller';
import { rateLimiter } from '../../middleware/rate-limiter';

const router = Router();
const controller = new GalleryController();

// High throughput rate limit for gallery (up to 300 req/min)
const galleryLimiter = rateLimiter({ windowMs: 60 * 1000, max: 300 });

router.get('/projects', galleryLimiter, controller.getProjects);
router.get('/projects/:id', galleryLimiter, controller.getProjectDetails);

export default router;
