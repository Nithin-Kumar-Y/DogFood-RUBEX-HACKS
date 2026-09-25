import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';

export type UserRole = 'PARTICIPANT' | 'ORGANIZER' | 'JUDGE' | 'ADMIN';

/**
 * Backend-enforced Role-Based Access Control (RBAC) Guard
 * Never rely solely on client-side routing. All sensitive actions are guarded here.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    // ADMIN has superuser privileges across management endpoints
    if (req.user.role === 'ADMIN') {
      return next();
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Access denied. Role '${req.user.role}' lacks permission for this resource. Required: [${allowedRoles.join(', ')}]`
      });
      return;
    }

    next();
  };
}
