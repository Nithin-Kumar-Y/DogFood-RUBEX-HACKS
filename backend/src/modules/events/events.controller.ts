import { Request, Response, NextFunction } from 'express';
import { EventsService } from './events.service';
import { AuthenticatedRequest } from '../../middleware/auth';

const eventsService = new EventsService();

export class EventsController {
  async listPublic(req: Request, res: Response, next: NextFunction) {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const result = await eventsService.listEvents({ isPublic: true, page, limit });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async listOrganizerEvents(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const organizerId = req.user?.role === 'ADMIN' ? undefined : req.user?.id;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const result = await eventsService.listEvents({ organizerId, page, limit });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async getPublicEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const event = await eventsService.getEventByIdOrSlug(req.params.idOrSlug, true);
      res.json({ event });
    } catch (err) {
      next(err);
    }
  }

  async getEvent(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const isPublic = req.user?.role === 'PARTICIPANT' || !req.user;
      const event = await eventsService.getEventByIdOrSlug(req.params.idOrSlug, isPublic);
      res.json({ event });
    } catch (err) {
      next(err);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const event = await eventsService.createEvent(req.user!.id, req.body);
      res.status(201).json({ event });
    } catch (err) {
      next(err);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const event = await eventsService.updateEvent(req.params.id, req.user!.id, req.user!.role, req.body);
      res.json({ event });
    } catch (err) {
      next(err);
    }
  }

  async togglePublish(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await eventsService.togglePublish(req.params.id, req.user!.id, req.user!.role);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}
