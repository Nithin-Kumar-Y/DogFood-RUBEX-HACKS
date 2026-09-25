import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../../database/connection';
import { AppError } from '../../middleware/error-handler';

export interface SubmitProjectDTO {
  notes?: string;
}

export class SubmissionsService {
  private db = getDatabase();

  async submitProject(userId: string, projectId: string, data: SubmitProjectDTO = {}) {
    const project = await this.db.get<any>(
      `SELECT p.*, e.id as event_id, e.name as event_name, e.submission_deadline, e.status as event_status
       FROM projects p
       JOIN events e ON p.event_id = e.id
       WHERE p.id = ?`,
      [projectId]
    );

    if (!project) {
      throw new AppError('Project not found.', 404);
    }

    // 1. Authorize: Submitter must be an active team member of this project
    const membership = await this.db.get(
      'SELECT id, role FROM team_members WHERE team_id = ? AND user_id = ?',
      [project.team_id, userId]
    );
    if (!membership) {
      throw new AppError('Unauthorized: You must be a member of the project team to submit.', 403);
    }

    // 2. Validate Event Status
    if (project.event_status !== 'PUBLISHED') {
      throw new AppError('Cannot submit a project to an unpublished event.', 400);
    }

    // 3. Backend Deadline Enforcement: Compare current timestamp against submission_deadline!
    const now = new Date().getTime();
    const deadline = new Date(project.submission_deadline).getTime();

    if (now > deadline) {
      throw new AppError(
        `Submission deadline passed at ${new Date(deadline).toUTCString()}. Late submissions are strictly rejected.`,
        400
      );
    }

    // 4. Validate required project fields before submission
    if (!project.title || project.title.trim() === 'Untitled Project' || project.title.trim().length < 3) {
      throw new AppError('A valid project title (at least 3 characters) is required for submission.', 400);
    }

    if (!project.description || project.description.trim().length < 20) {
      throw new AppError('A comprehensive project description (at least 20 characters) is required.', 400);
    }

    // Check project links (at least 1 required)
    const links = await this.db.query('SELECT id, url FROM project_links WHERE project_id = ?', [projectId]);
    if (links.length === 0) {
      throw new AppError('At least one project link (e.g. GitHub repository or Live Demo) is required to submit.', 400);
    }

    const submissionTimestamp = new Date().toISOString();
    const submissionId = uuidv4();

    // Check if previous submission existed (e.g. resubmission before deadline)
    const existingSubmission = await this.db.get('SELECT id FROM submissions WHERE project_id = ?', [projectId]);

    if (existingSubmission) {
      await this.db.run(
        `UPDATE submissions
         SET submitted_by_user_id = ?, submitted_at = ?, notes = ?, is_final = 1
         WHERE id = ?`,
        [userId, submissionTimestamp, data.notes || '', existingSubmission.id]
      );
    } else {
      await this.db.run(
        `INSERT INTO submissions (id, project_id, submitted_by_user_id, submitted_at, notes, is_final)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [submissionId, projectId, userId, submissionTimestamp, data.notes || '']
      );
    }

    // Update project status to SUBMITTED
    await this.db.run(
      "UPDATE projects SET status = 'SUBMITTED', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [projectId]
    );

    return {
      submissionId: existingSubmission ? existingSubmission.id : submissionId,
      projectId,
      submittedAt: submissionTimestamp,
      status: 'SUBMITTED',
      message: 'Project successfully submitted before the deadline!'
    };
  }

  async listSubmissions(options: {
    eventId?: string;
    organizerId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = ["p.status = 'SUBMITTED'"];
    const params: any[] = [];

    if (options.eventId) {
      conditions.push('p.event_id = ?');
      params.push(options.eventId);
    }

    if (options.organizerId) {
      conditions.push('e.organizer_id = ?');
      params.push(options.organizerId);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countSql = `
      SELECT count(*) as total
      FROM submissions s
      JOIN projects p ON s.project_id = p.id
      JOIN events e ON p.event_id = e.id
      ${whereClause}
    `;
    const countRes = await this.db.get<{ total: number }>(countSql, params);
    const total = Number(countRes?.total || 0);

    const sql = `
      SELECT
        s.id as submission_id,
        s.submitted_at,
        s.notes as submission_notes,
        s.is_final,
        p.id as project_id,
        p.title as project_title,
        p.tagline,
        p.description,
        p.status as project_status,
        t.name as team_name,
        e.name as event_name,
        e.slug as event_slug,
        et.name as track_name,
        u.full_name as submitter_name,
        u.email as submitter_email
      FROM submissions s
      JOIN projects p ON s.project_id = p.id
      JOIN teams t ON p.team_id = t.id
      JOIN events e ON p.event_id = e.id
      JOIN users u ON s.submitted_by_user_id = u.id
      LEFT JOIN event_tracks et ON p.track_id = et.id
      ${whereClause}
      ORDER BY s.submitted_at DESC
      LIMIT ? OFFSET ?
    `;

    const submissions = await this.db.query(sql, [...params, limit, offset]);

    return {
      submissions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}
