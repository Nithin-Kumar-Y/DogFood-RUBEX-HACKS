import { Response, NextFunction } from 'express';
import { SubmissionsService } from './submissions.service';
import { AuthenticatedRequest } from '../../middleware/auth';

const submissionsService = new SubmissionsService();

export class SubmissionsController {
  async submitProject(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await submissionsService.submitProject(req.user!.id, req.params.projectId, req.body);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async listSubmissions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const organizerId = req.user?.role === 'ADMIN' ? undefined : req.user?.id;
      const eventId = req.query.eventId as string | undefined;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const result = await submissionsService.listSubmissions({
        organizerId,
        eventId,
        page,
        limit
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}
