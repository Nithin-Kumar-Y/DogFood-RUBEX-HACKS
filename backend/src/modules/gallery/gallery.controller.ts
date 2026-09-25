import { Request, Response, NextFunction } from 'express';
import { GalleryService } from './gallery.service';

const galleryService = new GalleryService();

export class GalleryController {
  async getProjects(req: Request, res: Response, next: NextFunction) {
    try {
      const search = req.query.search as string | undefined;
      const eventId = req.query.eventId as string | undefined;
      const trackId = req.query.trackId as string | undefined;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 12;

      const result = await galleryService.getPublicProjects({
        search,
        eventId,
        trackId,
        page,
        limit
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async getProjectDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const project = await galleryService.getPublicProjectDetails(req.params.id);
      res.json({ project });
    } catch (err) {
      next(err);
    }
  }
}
