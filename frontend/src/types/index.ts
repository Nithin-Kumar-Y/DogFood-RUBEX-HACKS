export type UserRole = 'PARTICIPANT' | 'ORGANIZER' | 'JUDGE' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  avatar_url?: string;
  bio?: string;
  created_at?: string;
}

export interface Track {
  id: string;
  event_id?: string;
  name: string;
  description?: string;
}

export interface Prize {
  id: string;
  event_id?: string;
  name: string;
  description?: string;
  amount?: string;
  rank?: number;
}

export interface Event {
  id: string;
  organizer_id: string;
  name: string;
  slug: string;
  description: string;
  banner_url?: string;
  start_date: string;
  end_date: string;
  submission_deadline: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  organizer_name?: string;
  organizer_email?: string;
  team_count?: number;
  project_count?: number;
  submission_count?: number;
  tracks?: Track[];
  prizes?: Prize[];
  created_at?: string;
}

export interface TeamMember {
  id?: string;
  membership_id?: string;
  user_id: string;
  full_name: string;
  email?: string;
  avatar_url?: string;
  bio?: string;
  role: 'LEADER' | 'MEMBER';
  joined_at?: string;
}

export interface TeamInvitation {
  id: string;
  email: string;
  token: string;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
  expires_at: string;
  created_at: string;
}

export interface Team {
  id: string;
  event_id: string;
  creator_id: string;
  name: string;
  code: string;
  event_name?: string;
  event_slug?: string;
  submission_deadline?: string;
  event_status?: string;
  member_count?: number;
  my_role?: 'LEADER' | 'MEMBER';
  project_id?: string;
  project_title?: string;
  project_status?: 'DRAFT' | 'SUBMITTED' | 'LOCKED';
  members?: TeamMember[];
  project?: Project;
  invitations?: TeamInvitation[];
  created_at?: string;
}

export interface ProjectLink {
  id?: string;
  project_id?: string;
  title: string;
  url: string;
  type: 'GITHUB' | 'DEMO' | 'VIDEO' | 'SLIDES' | 'OTHER';
}

export interface Project {
  id: string;
  event_id: string;
  team_id: string;
  track_id?: string;
  title: string;
  tagline?: string;
  description: string;
  status: 'DRAFT' | 'SUBMITTED' | 'LOCKED';
  links?: ProjectLink[];
  team_name?: string;
  team_creator_id?: string;
  track_name?: string;
  event_name?: string;
  event_slug?: string;
  event_banner_url?: string;
  submission_deadline?: string;
  submitted_at?: string;
  submitter_name?: string;
  submission_notes?: string;
  team_members?: TeamMember[];
  is_member?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SubmissionRecord {
  submission_id: string;
  submitted_at: string;
  submission_notes?: string;
  project_id: string;
  project_title: string;
  tagline?: string;
  description?: string;
  project_status: string;
  team_name: string;
  event_name: string;
  event_slug: string;
  track_name?: string;
  submitter_name: string;
  submitter_email: string;
}
