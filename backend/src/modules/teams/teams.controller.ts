import { Response, NextFunction } from 'express';
import { TeamsService } from './teams.service';
import { AuthenticatedRequest } from '../../middleware/auth';

const teamsService = new TeamsService();

export class TeamsController {
  async getMyTeams(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const teams = await teamsService.getMyTeams(req.user!.id);
      res.json({ teams });
    } catch (err) {
      next(err);
    }
  }

  async getTeam(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const team = await teamsService.getTeamById(req.params.id, req.user?.id);
      res.json({ team });
    } catch (err) {
      next(err);
    }
  }

  async createTeam(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const team = await teamsService.createTeam(req.user!.id, req.body);
      res.status(201).json({ team });
    } catch (err) {
      next(err);
    }
  }

  async inviteMember(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await teamsService.inviteMember(req.user!.id, req.params.id, req.body.email);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  async acceptInvite(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const codeOrToken = req.body.token || req.body.code;
      const team = await teamsService.acceptInvite(req.user!.id, codeOrToken);
      res.json({ team, message: 'Successfully joined team!' });
    } catch (err) {
      next(err);
    }
  }

  async leaveTeam(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await teamsService.leaveTeam(req.user!.id, req.params.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}
