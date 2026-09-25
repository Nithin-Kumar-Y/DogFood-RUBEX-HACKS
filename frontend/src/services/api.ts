const API_BASE = '/api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('dogfood_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    let errorMsg = 'An unexpected error occurred';
    try {
      const errorData = await response.json();
      errorMsg = errorData.error || errorData.message || errorMsg;
    } catch {
      errorMsg = response.statusText || errorMsg;
    }
    throw new ApiError(errorMsg, response.status);
  }

  return response.json();
}

export const api = {
  // Auth
  register: (data: any) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: any) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getCurrentUser: () => request('/auth/me'),

  // Events
  getPublicEvents: (params?: { page?: number; limit?: number }) => {
    const query = new URLSearchParams(params as any).toString();
    return request(`/events/public?${query}`);
  },
  getPublicEvent: (idOrSlug: string) => request(`/events/public/${idOrSlug}`),
  getOrganizerEvents: (params?: { page?: number; limit?: number }) => {
    const query = new URLSearchParams(params as any).toString();
    return request(`/events/organizer?${query}`);
  },
  getEvent: (idOrSlug: string) => request(`/events/${idOrSlug}`),
  createEvent: (data: any) => request('/events', { method: 'POST', body: JSON.stringify(data) }),
  updateEvent: (id: string, data: any) => request(`/events/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  togglePublishEvent: (id: string) => request(`/events/${id}/publish`, { method: 'PATCH' }),

  // Teams
  getMyTeams: () => request('/teams/my'),
  getTeam: (id: string) => request(`/teams/${id}`),
  createTeam: (data: { event_id: string; name: string }) => request('/teams', { method: 'POST', body: JSON.stringify(data) }),
  inviteMember: (teamId: string, email: string) => request(`/teams/${teamId}/invite`, { method: 'POST', body: JSON.stringify({ email }) }),
  joinTeam: (data: { token?: string; code?: string }) => request('/teams/join', { method: 'POST', body: JSON.stringify(data) }),
  leaveTeam: (teamId: string) => request(`/teams/${teamId}/leave`, { method: 'POST' }),

  // Projects
  getMyProjects: () => request('/projects/my'),
  getProject: (id: string) => request(`/projects/${id}`),
  saveDraft: (data: any, projectId?: string) => {
    if (projectId) {
      return request(`/projects/${projectId}/draft`, { method: 'PUT', body: JSON.stringify(data) });
    }
    return request('/projects/draft', { method: 'POST', body: JSON.stringify(data) });
  },

  // Submissions
  submitProject: (projectId: string, data?: { notes?: string }) =>
    request(`/submissions/projects/${projectId}/submit`, { method: 'POST', body: JSON.stringify(data || {}) }),
  listSubmissions: (params?: { eventId?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams(params as any).toString();
    return request(`/submissions?${query}`);
  },

  // Gallery
  getGalleryProjects: (params?: { search?: string; eventId?: string; trackId?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams(params as any).toString();
    return request(`/gallery/projects?${query}`);
  },
  getGalleryProjectDetails: (id: string) => request(`/gallery/projects/${id}`),

  // Admin
  getAdminStats: () => request('/admin/stats'),
  getAdminUsers: (params?: { page?: number; limit?: number }) => {
    const query = new URLSearchParams(params as any).toString();
    return request(`/admin/users?${query}`);
  }
};
