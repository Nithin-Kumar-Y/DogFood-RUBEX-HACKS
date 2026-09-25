import { Response, NextFunction } from 'express';
import { ProjectsService } from './projects.service';
import { AuthenticatedRequest } from '../../middleware/auth';

const projectsService = new ProjectsService();

export class ProjectsController {
  async getMyProjects(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const projects = await projectsService.getMyProjects(req.user!.id);
      res.json({ projects });
    } catch (err) {
      next(err);
    }
  }

  async getProject(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const project = await projectsService.getProjectById(req.params.id, req.user?.id);
      res.json({ project });
    } catch (err) {
      next(err);
    }
  }

  async saveDraft(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const project = await projectsService.saveDraft(req.user!.id, req.body, req.params.id);
      res.json({ project, message: 'Draft saved successfully.' });
    } catch (err) {
      next(err);
    }
  }
}
