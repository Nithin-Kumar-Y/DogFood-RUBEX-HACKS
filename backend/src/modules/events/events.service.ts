import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../../database/connection';
import { AppError } from '../../middleware/error-handler';

export interface CreateEventDTO {
  name: string;
  slug?: string;
  description: string;
  banner_url?: string;
  start_date: string;
  end_date: string;
  submission_deadline: string;
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  tracks?: Array<{ name: string; description?: string }>;
  prizes?: Array<{ name: string; description?: string; amount?: string; rank?: number }>;
}

export interface UpdateEventDTO extends Partial<CreateEventDTO> {}

export class EventsService {
  private db = getDatabase();

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async listEvents(options: {
    status?: string;
    organizerId?: string;
    isPublic?: boolean;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];

    if (options.isPublic) {
      conditions.push("e.status = 'PUBLISHED'");
    } else if (options.status) {
      conditions.push('e.status = ?');
      params.push(options.status);
    }

    if (options.organizerId) {
      conditions.push('e.organizer_id = ?');
      params.push(options.organizerId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `SELECT count(*) as total FROM events e ${whereClause}`;
    const countResult = await this.db.get<{ total: number }>(countSql, params);
    const total = Number(countResult?.total || 0);

    const sql = `
      SELECT
        e.*,
        u.full_name as organizer_name,
        u.email as organizer_email,
        (SELECT count(*) FROM teams t WHERE t.event_id = e.id) as team_count,
        (SELECT count(*) FROM projects p WHERE p.event_id = e.id) as project_count,
        (SELECT count(*) FROM projects p WHERE p.event_id = e.id AND p.status = 'SUBMITTED') as submission_count
      FROM events e
      JOIN users u ON e.organizer_id = u.id
      ${whereClause}
      ORDER BY e.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const events = await this.db.query(sql, [...params, limit, offset]);

    return {
      events,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async getEventByIdOrSlug(idOrSlug: string, isPublic = false) {
    const sql = `
      SELECT
        e.*,
        u.full_name as organizer_name,
        u.email as organizer_email,
        (SELECT count(*) FROM teams t WHERE t.event_id = e.id) as team_count,
        (SELECT count(*) FROM projects p WHERE p.event_id = e.id) as project_count,
        (SELECT count(*) FROM projects p WHERE p.event_id = e.id AND p.status = 'SUBMITTED') as submission_count
      FROM events e
      JOIN users u ON e.organizer_id = u.id
      WHERE (e.id = ? OR e.slug = ?)
      ${isPublic ? "AND e.status = 'PUBLISHED'" : ''}
    `;

    const event = await this.db.get(sql, [idOrSlug, idOrSlug]);
    if (!event) {
      throw new AppError('Event not found or not published.', 404);
    }

    // Attach tracks
    event.tracks = await this.db.query(
      'SELECT id, name, description FROM event_tracks WHERE event_id = ? ORDER BY name ASC',
      [event.id]
    );

    // Attach prizes
    event.prizes = await this.db.query(
      'SELECT id, name, description, amount, rank FROM prizes WHERE event_id = ? ORDER BY rank ASC',
      [event.id]
    );

    return event;
  }

  async createEvent(organizerId: string, data: CreateEventDTO) {
    if (!data.name || !data.description || !data.start_date || !data.end_date || !data.submission_deadline) {
      throw new AppError('Name, description, start_date, end_date, and submission_deadline are required.', 400);
    }

    const start = new Date(data.start_date).getTime();
    const end = new Date(data.end_date).getTime();
    const deadline = new Date(data.submission_deadline).getTime();

    if (isNaN(start) || isNaN(end) || isNaN(deadline)) {
      throw new AppError('Invalid date format provided.', 400);
    }

    if (start >= end) {
      throw new AppError('Start date must be strictly before end date.', 400);
    }

    if (deadline < start || deadline > end) {
      throw new AppError('Submission deadline must be between start date and end date.', 400);
    }

    let slug = data.slug ? this.slugify(data.slug) : this.slugify(data.name);
    if (!slug) slug = `event-${Date.now()}`;

    // Verify slug uniqueness
    const existingSlug = await this.db.get('SELECT id FROM events WHERE slug = ?', [slug]);
    if (existingSlug) {
      slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const eventId = uuidv4();
    const status = data.status || 'DRAFT';

    await this.db.run(
      `INSERT INTO events (id, organizer_id, name, slug, description, banner_url, start_date, end_date, submission_deadline, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventId,
        organizerId,
        data.name.trim(),
        slug,
        data.description.trim(),
        data.banner_url || 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=1200&q=80',
        new Date(start).toISOString(),
        new Date(end).toISOString(),
        new Date(deadline).toISOString(),
        status
      ]
    );

    // Insert tracks
    if (data.tracks && Array.isArray(data.tracks)) {
      for (const track of data.tracks) {
        if (track.name) {
          await this.db.run(
            'INSERT INTO event_tracks (id, event_id, name, description) VALUES (?, ?, ?, ?)',
            [uuidv4(), eventId, track.name.trim(), track.description || '']
          );
        }
      }
    }

    // Insert prizes
    if (data.prizes && Array.isArray(data.prizes)) {
      for (const prize of data.prizes) {
        if (prize.name) {
          await this.db.run(
            'INSERT INTO prizes (id, event_id, name, description, amount, rank) VALUES (?, ?, ?, ?, ?, ?)',
            [uuidv4(), eventId, prize.name.trim(), prize.description || '', prize.amount || '', prize.rank || 1]
          );
        }
      }
    }

    return this.getEventByIdOrSlug(eventId);
  }

  async updateEvent(eventId: string, userId: string, userRole: string, data: UpdateEventDTO) {
    const event = await this.db.get<any>('SELECT * FROM events WHERE id = ?', [eventId]);
    if (!event) {
      throw new AppError('Event not found.', 404);
    }

    // Organizer ownership check
    if (userRole !== 'ADMIN' && event.organizer_id !== userId) {
      throw new AppError('Unauthorized: You can only edit events you organized.', 403);
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (data.name) {
      updates.push('name = ?');
      params.push(data.name.trim());
    }
    if (data.description) {
      updates.push('description = ?');
      params.push(data.description.trim());
    }
    if (data.banner_url !== undefined) {
      updates.push('banner_url = ?');
      params.push(data.banner_url);
    }
    if (data.status) {
      updates.push('status = ?');
      params.push(data.status);
    }

    // Date validations
    const start = data.start_date ? new Date(data.start_date).getTime() : new Date(event.start_date).getTime();
    const end = data.end_date ? new Date(data.end_date).getTime() : new Date(event.end_date).getTime();
    const deadline = data.submission_deadline ? new Date(data.submission_deadline).getTime() : new Date(event.submission_deadline).getTime();

    if (data.start_date || data.end_date || data.submission_deadline) {
      if (start >= end) {
        throw new AppError('Start date must be strictly before end date.', 400);
      }
      if (deadline < start || deadline > end) {
        throw new AppError('Submission deadline must be between start date and end date.', 400);
      }
      if (data.start_date) {
        updates.push('start_date = ?');
        params.push(new Date(start).toISOString());
      }
      if (data.end_date) {
        updates.push('end_date = ?');
        params.push(new Date(end).toISOString());
      }
      if (data.submission_deadline) {
        updates.push('submission_deadline = ?');
        params.push(new Date(deadline).toISOString());
      }
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");

    if (updates.length > 0) {
      const sql = `UPDATE events SET ${updates.join(', ')} WHERE id = ?`;
      await this.db.run(sql, [...params, eventId]);
    }

    // If tracks are provided, replace them
    if (data.tracks && Array.isArray(data.tracks)) {
      await this.db.run('DELETE FROM event_tracks WHERE event_id = ?', [eventId]);
      for (const track of data.tracks) {
        if (track.name) {
          await this.db.run(
            'INSERT INTO event_tracks (id, event_id, name, description) VALUES (?, ?, ?, ?)',
            [uuidv4(), eventId, track.name.trim(), track.description || '']
          );
        }
      }
    }

    // If prizes are provided, replace them
    if (data.prizes && Array.isArray(data.prizes)) {
      await this.db.run('DELETE FROM prizes WHERE event_id = ?', [eventId]);
      for (const prize of data.prizes) {
        if (prize.name) {
          await this.db.run(
            'INSERT INTO prizes (id, event_id, name, description, amount, rank) VALUES (?, ?, ?, ?, ?, ?)',
            [uuidv4(), eventId, prize.name.trim(), prize.description || '', prize.amount || '', prize.rank || 1]
          );
        }
      }
    }

    return this.getEventByIdOrSlug(eventId);
  }

  async togglePublish(eventId: string, userId: string, userRole: string) {
    const event = await this.db.get<any>('SELECT * FROM events WHERE id = ?', [eventId]);
    if (!event) throw new AppError('Event not found.', 404);

    if (userRole !== 'ADMIN' && event.organizer_id !== userId) {
      throw new AppError('Unauthorized: You can only publish/unpublish events you organized.', 403);
    }

    const newStatus = event.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    await this.db.run('UPDATE events SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newStatus, eventId]);
    return { status: newStatus };
  }
}
