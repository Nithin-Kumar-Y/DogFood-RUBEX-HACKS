import { getDatabase } from '../../database/connection';
import { AppError } from '../../middleware/error-handler';

export interface GalleryFilterOptions {
  search?: string;
  eventId?: string;
  trackId?: string;
  page?: number;
  limit?: number;
}

export class GalleryService {
  private db = getDatabase();

  async getPublicProjects(options: GalleryFilterOptions) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(50, Math.max(1, options.limit || 12));
    const offset = (page - 1) * limit;

    const conditions: string[] = ["p.status = 'SUBMITTED'", "e.status = 'PUBLISHED'"];
    const params: any[] = [];

    if (options.eventId) {
      conditions.push('(e.id = ? OR e.slug = ?)');
      params.push(options.eventId, options.eventId);
    }

    if (options.trackId) {
      conditions.push('p.track_id = ?');
      params.push(options.trackId);
    }

    if (options.search && options.search.trim()) {
      const searchTerm = `%${options.search.trim().toLowerCase()}%`;
      conditions.push(
        '(LOWER(p.title) LIKE ? OR LOWER(p.description) LIKE ? OR LOWER(p.tagline) LIKE ? OR LOWER(t.name) LIKE ?)'
      );
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Total count for pagination
    const countSql = `
      SELECT count(*) as total
      FROM projects p
      JOIN teams t ON p.team_id = t.id
      JOIN events e ON p.event_id = e.id
      ${whereClause}
    `;
    const countResult = await this.db.get<{ total: number }>(countSql, params);
    const total = Number(countResult?.total || 0);

    // Paginated projects query with efficient joins
    const sql = `
      SELECT
        p.id,
        p.title,
        p.tagline,
        p.description,
        p.created_at,
        p.updated_at,
        t.id as team_id,
        t.name as team_name,
        e.id as event_id,
        e.name as event_name,
        e.slug as event_slug,
        et.id as track_id,
        et.name as track_name,
        s.submitted_at
      FROM projects p
      JOIN teams t ON p.team_id = t.id
      JOIN events e ON p.event_id = e.id
      LEFT JOIN event_tracks et ON p.track_id = et.id
      JOIN submissions s ON s.project_id = p.id
      ${whereClause}
      ORDER BY s.submitted_at DESC
      LIMIT ? OFFSET ?
    `;

    const projects = await this.db.query(sql, [...params, limit, offset]);

    // Attach links for each project card
    for (const project of projects) {
      project.links = await this.db.query(
        'SELECT id, title, url, type FROM project_links WHERE project_id = ?',
        [project.id]
      );
    }

    return {
      projects,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async getPublicProjectDetails(projectId: string) {
    const sql = `
      SELECT
        p.id,
        p.title,
        p.tagline,
        p.description,
        p.status,
        p.created_at,
        p.updated_at,
        t.id as team_id,
        t.name as team_name,
        e.id as event_id,
        e.name as event_name,
        e.slug as event_slug,
        e.banner_url as event_banner_url,
        et.id as track_id,
        et.name as track_name,
        s.submitted_at,
        s.notes as submission_notes
      FROM projects p
      JOIN teams t ON p.team_id = t.id
      JOIN events e ON p.event_id = e.id
      LEFT JOIN event_tracks et ON p.track_id = et.id
      LEFT JOIN submissions s ON s.project_id = p.id
      WHERE p.id = ? AND e.status = 'PUBLISHED'
    `;

    const project = await this.db.get(sql, [projectId]);
    if (!project) {
      throw new AppError('Public project not found or not published.', 404);
    }

    project.links = await this.db.query(
      'SELECT id, title, url, type FROM project_links WHERE project_id = ? ORDER BY created_at ASC',
      [projectId]
    );

    project.team_members = await this.db.query(
      `SELECT u.id, u.full_name, u.avatar_url, u.bio, tm.role
       FROM team_members tm
       JOIN users u ON tm.user_id = u.id
       WHERE tm.team_id = ?
       ORDER BY tm.role DESC`,
      [project.team_id]
    );

    return project;
  }
}
