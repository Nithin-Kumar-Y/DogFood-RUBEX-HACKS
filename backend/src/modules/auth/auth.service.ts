import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../config';
import { getDatabase } from '../../database/connection';
import { AppError } from '../../middleware/error-handler';

export interface RegisterDTO {
  email: string;
  password: string;
  full_name: string;
  role?: 'PARTICIPANT' | 'ORGANIZER' | 'JUDGE' | 'ADMIN';
  bio?: string;
  avatar_url?: string;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export class AuthService {
  private db = getDatabase();

  async register(data: RegisterDTO, clientInfo?: { userAgent?: string; ip?: string }) {
    const email = data.email.trim().toLowerCase();
    if (!email || !data.password || !data.full_name) {
      throw new AppError('Email, password, and full name are required.', 400);
    }

    if (data.password.length < 6) {
      throw new AppError('Password must be at least 6 characters long.', 400);
    }

    // Role safety: default to PARTICIPANT, disallow self-granting ADMIN unless first user
    let role = data.role || 'PARTICIPANT';
    if (role === 'ADMIN') {
      const existingUsers = await this.db.get<{ count: number }>('SELECT count(*) as count FROM users');
      if (Number(existingUsers?.count || 0) > 0) {
        throw new AppError('Cannot self-register as ADMIN.', 403);
      }
    }

    const existing = await this.db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      throw new AppError('An account with this email address already exists.', 409);
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(data.password, salt);
    const userId = uuidv4();

    await this.db.run(
      `INSERT INTO users (id, email, password_hash, full_name, role, avatar_url, bio)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        email,
        password_hash,
        data.full_name.trim(),
        role,
        data.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(data.full_name)}`,
        data.bio || ''
      ]
    );

    const token = this.generateToken(userId, email, role);
    await this.createSession(userId, token, clientInfo);

    const user = await this.db.get(
      'SELECT id, email, full_name, role, avatar_url, bio, created_at FROM users WHERE id = ?',
      [userId]
    );

    return { user, token };
  }

  async login(data: LoginDTO, clientInfo?: { userAgent?: string; ip?: string }) {
    const email = data.email.trim().toLowerCase();
    const user = await this.db.get<any>(
      'SELECT id, email, password_hash, full_name, role, avatar_url, bio, created_at FROM users WHERE email = ?',
      [email]
    );

    if (!user) {
      throw new AppError('Invalid email or password.', 401);
    }

    const isMatch = await bcrypt.compare(data.password, user.password_hash);
    if (!isMatch) {
      throw new AppError('Invalid email or password.', 401);
    }

    const token = this.generateToken(user.id, user.email, user.role);
    await this.createSession(user.id, token, clientInfo);

    const { password_hash, ...safeUser } = user;
    return { user: safeUser, token };
  }

  async logout(token: string) {
    if (token) {
      await this.db.run('DELETE FROM sessions WHERE token = ?', [token]);
    }
    return { success: true };
  }

  async getCurrentUser(userId: string) {
    const user = await this.db.get(
      'SELECT id, email, full_name, role, avatar_url, bio, created_at FROM users WHERE id = ?',
      [userId]
    );
    if (!user) {
      throw new AppError('User not found.', 404);
    }
    return user;
  }

  private generateToken(userId: string, email: string, role: string): string {
    return jwt.sign(
      { userId, email, role, jti: uuidv4() },
      config.jwtSecret,
      { expiresIn: '7d' }
    );
  }

  private async createSession(userId: string, token: string, clientInfo?: { userAgent?: string; ip?: string }) {
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    await this.db.run(
      `INSERT INTO sessions (id, user_id, token, expires_at, user_agent, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        userId,
        token,
        expiresAt,
        clientInfo?.userAgent || 'unknown',
        clientInfo?.ip || 'unknown'
      ]
    );
  }
}
