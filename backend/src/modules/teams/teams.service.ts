import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../../database/connection';
import { AppError } from '../../middleware/error-handler';

export class TeamsService {
  private db = getDatabase();

  private generateTeamCode(teamName: string): string {
    const prefix = teamName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase() || 'TM';
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${rand}`;
  }

  async getMyTeams(userId: string) {
    const sql = `
      SELECT
        t.*,
        e.name as event_name,
        e.slug as event_slug,
        e.submission_deadline,
        e.status as event_status,
        tm.role as my_role,
        (SELECT count(*) FROM team_members WHERE team_id = t.id) as member_count,
        (SELECT id FROM projects WHERE team_id = t.id) as project_id,
        (SELECT title FROM projects WHERE team_id = t.id) as project_title,
        (SELECT status FROM projects WHERE team_id = t.id) as project_status
      FROM teams t
      JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = ?
      JOIN events e ON t.event_id = e.id
      ORDER BY t.created_at DESC
    `;
    const teams = await this.db.query(sql, [userId]);
    return teams;
  }

  async getTeamById(teamId: string, currentUserId?: string) {
    const team = await this.db.get<any>(
      `SELECT t.*, e.name as event_name, e.slug as event_slug, e.submission_deadline, e.status as event_status
       FROM teams t
       JOIN events e ON t.event_id = e.id
       WHERE t.id = ?`,
      [teamId]
    );

    if (!team) {
      throw new AppError('Team not found.', 404);
    }

    // Fetch members
    team.members = await this.db.query(
      `SELECT tm.id as membership_id, tm.role, tm.joined_at, u.id as user_id, u.full_name, u.email, u.avatar_url
       FROM team_members tm
       JOIN users u ON tm.user_id = u.id
       WHERE tm.team_id = ?
       ORDER BY tm.role DESC, tm.joined_at ASC`,
      [teamId]
    );

    // Fetch project if exists
    team.project = await this.db.get(
      `SELECT p.*, s.submitted_at, s.is_final
       FROM projects p
       LEFT JOIN submissions s ON s.project_id = p.id
       WHERE p.team_id = ?`,
      [teamId]
    );

    if (team.project) {
      team.project.links = await this.db.query(
        'SELECT * FROM project_links WHERE project_id = ? ORDER BY created_at ASC',
        [team.project.id]
      );
    }

    // Pending invitations (only accessible to team members)
    const isMember = team.members.some((m: any) => m.user_id === currentUserId);
    if (isMember) {
      team.invitations = await this.db.query(
        "SELECT id, email, token, status, expires_at, created_at FROM team_invitations WHERE team_id = ? AND status = 'PENDING' ORDER BY created_at DESC",
        [teamId]
      );
    }

    return team;
  }

  async createTeam(userId: string, data: { event_id: string; name: string }) {
    if (!data.event_id || !data.name || !data.name.trim()) {
      throw new AppError('Event ID and Team Name are required.', 400);
    }

    const event = await this.db.get<any>('SELECT * FROM events WHERE id = ?', [data.event_id]);
    if (!event) {
      throw new AppError('Event not found.', 404);
    }

    if (event.status !== 'PUBLISHED') {
      throw new AppError('Cannot create a team for an unpublished event.', 400);
    }

    // Check if user is ALREADY in a team for this event! (Prevent duplicate membership)
    const existingMembership = await this.db.get(
      `SELECT tm.id, t.name as team_name
       FROM team_members tm
       JOIN teams t ON tm.team_id = t.id
       WHERE t.event_id = ? AND tm.user_id = ?`,
      [data.event_id, userId]
    );

    if (existingMembership) {
      throw new AppError(`You are already a member of team '${existingMembership.team_name}' for this event. You cannot join multiple teams.`, 409);
    }

    const teamId = uuidv4();
    let code = this.generateTeamCode(data.name);

    // Check code uniqueness
    const codeConflict = await this.db.get('SELECT id FROM teams WHERE code = ?', [code]);
    if (codeConflict) {
      code = `${code}-${Math.floor(10 + Math.random() * 90)}`;
    }

    await this.db.run(
      `INSERT INTO teams (id, event_id, creator_id, name, code) VALUES (?, ?, ?, ?, ?)`,
      [teamId, data.event_id, userId, data.name.trim(), code]
    );

    // Add creator as LEADER
    await this.db.run(
      `INSERT INTO team_members (id, team_id, user_id, role) VALUES (?, ?, ?, ?)`,
      [uuidv4(), teamId, userId, 'LEADER']
    );

    return this.getTeamById(teamId, userId);
  }

  async inviteMember(currentUserId: string, teamId: string, email: string) {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      throw new AppError('A valid email address is required.', 400);
    }

    const team = await this.db.get<any>('SELECT * FROM teams WHERE id = ?', [teamId]);
    if (!team) throw new AppError('Team not found.', 404);

    // Verify current user is in team
    const membership = await this.db.get<any>(
      'SELECT * FROM team_members WHERE team_id = ? AND user_id = ?',
      [teamId, currentUserId]
    );
    if (!membership) {
      throw new AppError('Unauthorized: You must be a member of this team to invite others.', 403);
    }

    // Check if target user exists and already in a team for this event
    const targetUser = await this.db.get<any>('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (targetUser) {
      const alreadyInEvent = await this.db.get(
        `SELECT t.name FROM team_members tm
         JOIN teams t ON tm.team_id = t.id
         WHERE t.event_id = ? AND tm.user_id = ?`,
        [team.event_id, targetUser.id]
      );
      if (alreadyInEvent) {
        throw new AppError(`User ${cleanEmail} is already a member of team '${alreadyInEvent.name}' in this event.`, 409);
      }
    }

    const inviteToken = uuidv4().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    const invitationId = uuidv4();
    await this.db.run(
      `INSERT INTO team_invitations (id, team_id, email, token, status, expires_at)
       VALUES (?, ?, ?, ?, 'PENDING', ?)`,
      [invitationId, teamId, cleanEmail, inviteToken, expiresAt]
    );

    return {
      invitationId,
      email: cleanEmail,
      token: inviteToken,
      inviteLink: `/teams/join?token=${inviteToken}&code=${team.code}`
    };
  }

  async acceptInvite(userId: string, tokenOrCode: string) {
    // Lookup invitation by token or team by code
    const invitation = await this.db.get<any>(
      `SELECT ti.*, t.event_id, t.name as team_name, t.id as resolved_team_id
       FROM team_invitations ti
       JOIN teams t ON ti.team_id = t.id
       WHERE ti.token = ? AND ti.status = 'PENDING'`,
      [tokenOrCode]
    );

    let teamId: string;
    let eventId: string;

    if (invitation) {
      // Check expiration
      if (new Date(invitation.expires_at).getTime() < Date.now()) {
        await this.db.run("UPDATE team_invitations SET status = 'EXPIRED' WHERE id = ?", [invitation.id]);
        throw new AppError('This invitation has expired.', 400);
      }
      teamId = invitation.resolved_team_id;
      eventId = invitation.event_id;
    } else {
      // Check if it's a team code
      const team = await this.db.get<any>('SELECT id, event_id, name FROM teams WHERE code = ?', [tokenOrCode]);
      if (!team) {
        throw new AppError('Invalid invitation token or team code.', 404);
      }
      teamId = team.id;
      eventId = team.event_id;
    }

    // Verify user is not ALREADY on a team in this event
    const existingMembership = await this.db.get(
      `SELECT t.name FROM team_members tm
       JOIN teams t ON tm.team_id = t.id
       WHERE t.event_id = ? AND tm.user_id = ?`,
      [eventId, userId]
    );

    if (existingMembership) {
      throw new AppError(`You are already a member of team '${existingMembership.name}' for this event. Cannot join another team.`, 409);
    }

    // Add member
    await this.db.run(
      `INSERT INTO team_members (id, team_id, user_id, role) VALUES (?, ?, ?, 'MEMBER')`,
      [uuidv4(), teamId, userId]
    );

    if (invitation) {
      await this.db.run("UPDATE team_invitations SET status = 'ACCEPTED' WHERE id = ?", [invitation.id]);
    }

    return this.getTeamById(teamId, userId);
  }

  async leaveTeam(userId: string, teamId: string) {
    const member = await this.db.get<any>(
      'SELECT * FROM team_members WHERE team_id = ? AND user_id = ?',
      [teamId, userId]
    );
    if (!member) {
      throw new AppError('You are not a member of this team.', 404);
    }

    const members = await this.db.query('SELECT * FROM team_members WHERE team_id = ?', [teamId]);

    if (member.role === 'LEADER') {
      if (members.length > 1) {
        // Transfer leadership to the oldest joined member before leaving
        const nextLeader = members.find(m => m.user_id !== userId);
        await this.db.run("UPDATE team_members SET role = 'LEADER' WHERE id = ?", [nextLeader.id]);
      } else {
        // If leader is the sole member, leaving deletes the team and associated draft project
        await this.db.run('DELETE FROM teams WHERE id = ?', [teamId]);
        return { message: 'Team disbanded as sole member departed.' };
      }
    }

    await this.db.run('DELETE FROM team_members WHERE id = ?', [member.id]);
    return { message: 'Successfully left the team.' };
  }
}
