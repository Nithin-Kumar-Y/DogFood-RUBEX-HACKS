import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { AuthenticatedRequest } from '../../middleware/auth';

const authService = new AuthService();

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const clientInfo = {
        userAgent: req.headers['user-agent'],
        ip: req.ip
      };
      const result = await authService.register(req.body, clientInfo);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const clientInfo = {
        userAgent: req.headers['user-agent'],
        ip: req.ip
      };
      const result = await authService.login(req.body, clientInfo);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async logout(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (req.token) {
        await authService.logout(req.token);
      }
      res.status(200).json({ message: 'Successfully logged out.' });
    } catch (err) {
      next(err);
    }
  }

  async me(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated.' });
        return;
      }
      const user = await authService.getCurrentUser(req.user.id);
      res.status(200).json({ user });
    } catch (err) {
      next(err);
    }
  }
}
