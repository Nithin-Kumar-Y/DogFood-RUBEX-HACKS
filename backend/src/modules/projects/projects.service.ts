import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../../database/connection';
import { AppError } from '../../middleware/error-handler';

export interface ProjectLinkDTO {
  title: string;
  url: string;
  type?: 'GITHUB' | 'DEMO' | 'VIDEO' | 'SLIDES' | 'OTHER';
}

export interface SaveProjectDTO {
  team_id: string;
  title: string;
  tagline?: string;
  description: string;
  track_id?: string;
  links?: ProjectLinkDTO[];
}

export class ProjectsService {
  private db = getDatabase();

  async getMyProjects(userId: string) {
    const sql = `
      SELECT
        p.*,
        t.name as team_name,
        e.name as event_name,
        e.slug as event_slug,
        e.submission_deadline,
        e.status as event_status,
        et.name as track_name,
        s.submitted_at,
        s.submitted_by_user_id
      FROM projects p
      JOIN teams t ON p.team_id = t.id
      JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = ?
      JOIN events e ON p.event_id = e.id
      LEFT JOIN event_tracks et ON p.track_id = et.id
      LEFT JOIN submissions s ON s.project_id = p.id
      ORDER BY p.updated_at DESC
    `;
    const projects = await this.db.query(sql, [userId]);

    for (const project of projects) {
      project.links = await this.db.query(
        'SELECT * FROM project_links WHERE project_id = ?',
        [project.id]
      );
    }

    return projects;
  }

  async getProjectById(projectId: string, currentUserId?: string) {
    const project = await this.db.get<any>(
      `SELECT
        p.*,
        t.name as team_name,
        t.creator_id as team_creator_id,
        e.name as event_name,
        e.slug as event_slug,
        e.submission_deadline,
        e.status as event_status,
        et.name as track_name,
        s.submitted_at,
        s.notes as submission_notes,
        s.submitted_by_user_id,
        u.full_name as submitter_name
       FROM projects p
       JOIN teams t ON p.team_id = t.id
       JOIN events e ON p.event_id = e.id
       LEFT JOIN event_tracks et ON p.track_id = et.id
       LEFT JOIN submissions s ON s.project_id = p.id
       LEFT JOIN users u ON s.submitted_by_user_id = u.id
       WHERE p.id = ?`,
      [projectId]
    );

    if (!project) {
      throw new AppError('Project not found.', 404);
    }

    project.links = await this.db.query(
      'SELECT * FROM project_links WHERE project_id = ? ORDER BY created_at ASC',
      [projectId]
    );

    project.team_members = await this.db.query(
      `SELECT u.id, u.full_name, u.email, u.avatar_url, tm.role
       FROM team_members tm
       JOIN users u ON tm.user_id = u.id
       WHERE tm.team_id = ?
       ORDER BY tm.role DESC`,
      [project.team_id]
    );

    // Check if the current user is a team member
    project.is_member = currentUserId
      ? project.team_members.some((m: any) => m.id === currentUserId)
      : false;

    return project;
  }

  async saveDraft(userId: string, data: SaveProjectDTO, projectId?: string) {
    if (!data.team_id) {
      throw new AppError('Team ID is required.', 400);
    }

    // Verify user is a member of the team
    const membership = await this.db.get(
      'SELECT id, role FROM team_members WHERE team_id = ? AND user_id = ?',
      [data.team_id, userId]
    );
    if (!membership) {
      throw new AppError('Unauthorized: You must be a member of this team to manage its project.', 403);
    }

    // Verify team and event
    const team = await this.db.get<any>(
      `SELECT t.*, e.status as event_status, e.submission_deadline
       FROM teams t
       JOIN events e ON t.event_id = e.id
       WHERE t.id = ?`,
      [data.team_id]
    );
    if (!team) throw new AppError('Team not found.', 404);

    let project: any;
    if (projectId) {
      project = await this.db.get<any>('SELECT * FROM projects WHERE id = ?', [projectId]);
      if (!project) throw new AppError('Project not found.', 404);

      if (project.status === 'LOCKED') {
        throw new AppError('This project is locked and cannot be edited.', 403);
      }
    } else {
      // Check if project already exists for this team
      project = await this.db.get<any>('SELECT * FROM projects WHERE team_id = ?', [data.team_id]);
    }

    const title = (data.title || '').trim() || 'Untitled Project';
    const description = (data.description || '').trim();
    const tagline = (data.tagline || '').trim();
    const trackId = data.track_id || null;

    if (project) {
      // Update existing draft
      await this.db.run(
        `UPDATE projects
         SET title = ?, tagline = ?, description = ?, track_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [title, tagline, description, trackId, project.id]
      );
      projectId = project.id;
    } else {
      // Create new draft project
      projectId = uuidv4();
      await this.db.run(
        `INSERT INTO projects (id, event_id, team_id, track_id, title, tagline, description, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT')`,
        [projectId, team.event_id, data.team_id, trackId, title, tagline, description]
      );
    }

    // Update project links
    if (data.links && Array.isArray(data.links)) {
      await this.db.run('DELETE FROM project_links WHERE project_id = ?', [projectId]);
      for (const link of data.links) {
        if (link.url && link.url.trim()) {
          await this.db.run(
            `INSERT INTO project_links (id, project_id, title, url, type)
             VALUES (?, ?, ?, ?, ?)`,
            [uuidv4(), projectId, (link.title || 'Link').trim(), link.url.trim(), link.type || 'OTHER']
          );
        }
      }
    }

    return this.getProjectById(projectId!, userId);
  }
}
