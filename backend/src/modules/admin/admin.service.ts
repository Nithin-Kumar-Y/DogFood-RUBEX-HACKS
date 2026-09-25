import { getDatabase } from '../../database/connection';

export class AdminService {
  private db = getDatabase();

  async getSystemStats() {
    const userCount = await this.db.get<{ count: number }>('SELECT count(*) as count FROM users');
    const eventCount = await this.db.get<{ count: number }>('SELECT count(*) as count FROM events');
    const teamCount = await this.db.get<{ count: number }>('SELECT count(*) as count FROM teams');
    const projectCount = await this.db.get<{ count: number }>('SELECT count(*) as count FROM projects');
    const submissionCount = await this.db.get<{ count: number }>("SELECT count(*) as count FROM projects WHERE status = 'SUBMITTED'");

    const usersByRole = await this.db.query(
      'SELECT role, count(*) as count FROM users GROUP BY role'
    );

    return {
      totalUsers: Number(userCount?.count || 0),
      totalEvents: Number(eventCount?.count || 0),
      totalTeams: Number(teamCount?.count || 0),
      totalProjects: Number(projectCount?.count || 0),
      totalSubmissions: Number(submissionCount?.count || 0),
      usersByRole,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version,
      databaseType: process.env.DATABASE_TYPE || 'sqlite'
    };
  }

  async listUsers(options: { page?: number; limit?: number }) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 25));
    const offset = (page - 1) * limit;

    const countRes = await this.db.get<{ total: number }>('SELECT count(*) as total FROM users');
    const total = Number(countRes?.total || 0);

    const users = await this.db.query(
      `SELECT id, email, full_name, role, avatar_url, bio, created_at,
        (SELECT count(*) FROM team_members WHERE user_id = users.id) as team_count
       FROM users
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}
