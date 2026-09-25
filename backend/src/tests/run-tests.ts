import request from 'supertest';
import { createApp } from '../server';
import { getDatabase } from '../database/connection';
import { initializeDatabase } from '../database/schema';
import { seedDatabase } from '../database/seed';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, errorDetail?: any) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    if (errorDetail) console.error('    Details:', errorDetail);
    failed++;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log(' RUNNING DOGFOOD TIER 1 AUTOMATED ACCEPTANCE TESTS');
  console.log('======================================================\n');

  // Initialize and seed database
  const db = getDatabase();
  await initializeDatabase(db);
  await seedDatabase(db);

  const app = createApp();

  // Test state
  let participantToken = '';
  let participant2Token = '';
  let organizerToken = '';
  let adminToken = '';
  let createdEventId = '';
  let createdTeamId = '';
  let teamCode = '';
  let inviteToken = '';
  let createdProjectId = '';

  // -----------------------------------------------------------------
  // 1. AUTHENTICATION & SESSIONS
  // -----------------------------------------------------------------
  console.log('--- TEST GROUP 1: AUTHENTICATION & LOGIN ---');

  // 1.1 Register participant
  const testEmail = `test.dev.${Date.now()}@dogfood.local`;
  const regRes = await request(app)
    .post('/api/auth/register')
    .send({
      email: testEmail,
      password: 'SecurePassword123!',
      full_name: 'Test Engineer',
      role: 'PARTICIPANT'
    });
  assert(regRes.status === 201 && regRes.body.token, 'Participant registration returns 201 & token', regRes.body);
  participantToken = regRes.body.token;

  // 1.2 Prevent duplicate email registration
  const dupReg = await request(app)
    .post('/api/auth/register')
    .send({
      email: testEmail,
      password: 'AnotherPassword123!',
      full_name: 'Duplicate Guy'
    });
  assert(dupReg.status === 409, 'Registration with duplicate email rejected with 409');

  // 1.3 Login participant
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: testEmail,
      password: 'SecurePassword123!'
    });
  assert(loginRes.status === 200 && loginRes.body.token, 'Login with correct password returns 200');

  // 1.4 Login with incorrect password
  const badLogin = await request(app)
    .post('/api/auth/login')
    .send({
      email: testEmail,
      password: 'WrongPassword!'
    });
  assert(badLogin.status === 401, 'Login with bad password rejected with 401');

  // 1.5 Get current profile
  const meRes = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${participantToken}`);
  assert(meRes.status === 200 && meRes.body.user.email === testEmail, 'GET /api/auth/me returns valid user object');

  // 1.6 Unauthenticated request to /api/auth/me
  const unauthMe = await request(app).get('/api/auth/me');
  assert(unauthMe.status === 401, 'Unauthenticated request rejected with 401');

  // Login Organizer
  const orgLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'organizer@dogfood.local', password: 'Dogfood123!' });
  organizerToken = orgLogin.body.token;

  // Login Admin
  const adminLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@dogfood.local', password: 'Dogfood123!' });
  adminToken = adminLogin.body.token;

  // Register Participant 2
  const p2Res = await request(app)
    .post('/api/auth/register')
    .send({
      email: `test.partner.${Date.now()}@dogfood.local`,
      password: 'SecurePassword123!',
      full_name: 'Partner Dev',
      role: 'PARTICIPANT'
    });
  participant2Token = p2Res.body.token;

  // -----------------------------------------------------------------
  // 2. ROLE ISOLATION & RBAC
  // -----------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: ROLE ISOLATION & RBAC GUARDS ---');

  // 2.1 Participant attempting to create event -> Forbidden (403)
  const partCreateEvent = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${participantToken}`)
    .send({
      name: 'Illegal Participant Hackathon',
      description: 'Should not be allowed',
      start_date: new Date().toISOString(),
      end_date: new Date(Date.now() + 86400000).toISOString(),
      submission_deadline: new Date(Date.now() + 40000000).toISOString()
    });
  assert(partCreateEvent.status === 403, 'Participant cannot create events (403 Forbidden)');

  // 2.2 Participant attempting to view admin stats -> Forbidden (403)
  const partAdminStats = await request(app)
    .get('/api/admin/stats')
    .set('Authorization', `Bearer ${participantToken}`);
  assert(partAdminStats.status === 403, 'Participant cannot access admin stats (403 Forbidden)');

  // 2.3 Organizer attempting to view admin stats -> Forbidden (403)
  const orgAdminStats = await request(app)
    .get('/api/admin/stats')
    .set('Authorization', `Bearer ${organizerToken}`);
  assert(orgAdminStats.status === 403, 'Organizer cannot access admin stats (403 Forbidden)');

  // 2.4 Admin successfully accesses admin stats -> 200
  const adminStatsRes = await request(app)
    .get('/api/admin/stats')
    .set('Authorization', `Bearer ${adminToken}`);
  assert(adminStatsRes.status === 200 && adminStatsRes.body.stats.totalUsers > 0, 'Admin can access system stats (200 OK)');

  // -----------------------------------------------------------------
  // 3. EVENT CREATION & MANAGEMENT
  // -----------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: EVENT MANAGEMENT ---');

  // 3.1 Organizer creates event with invalid dates (start >= end)
  const badDateEvent = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${organizerToken}`)
    .send({
      name: 'Chronologically Impossible Hack',
      description: 'Invalid dates',
      start_date: new Date(Date.now() + 10000000).toISOString(),
      end_date: new Date(Date.now() + 5000000).toISOString(),
      submission_deadline: new Date(Date.now() + 8000000).toISOString()
    });
  assert(badDateEvent.status === 400, 'Event with start_date >= end_date rejected with 400');

  // 3.2 Organizer creates valid event
  const now = Date.now();
  const validEventRes = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${organizerToken}`)
    .send({
      name: 'Autumn Systems Hackathon 2026',
      description: 'High-performance offline software challenge with real prizes.',
      start_date: new Date(now - 3600000).toISOString(),
      end_date: new Date(now + 7 * 86400000).toISOString(),
      submission_deadline: new Date(now + 5 * 86400000).toISOString(),
      status: 'PUBLISHED',
      tracks: [
        { name: 'Core Engine Track', description: 'Systems engineering' },
        { name: 'UI & Polish Track', description: 'Design engineering' }
      ],
      prizes: [
        { name: 'First Place', amount: '$5,000', rank: 1 }
      ]
    });
  assert(validEventRes.status === 201 && validEventRes.body.event.id, 'Organizer successfully creates event (201 Created)');
  createdEventId = validEventRes.body.event.id;

  // 3.3 Public can view published event
  const pubEventRes = await request(app).get(`/api/events/public/${createdEventId}`);
  assert(pubEventRes.status === 200 && pubEventRes.body.event.tracks.length === 2, 'Public can view published event with tracks');

  // -----------------------------------------------------------------
  // 4. TEAM MANAGEMENT & MEMBERSHIP INTEGRITY
  // -----------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: TEAM MANAGEMENT & MEMBERSHIP INTEGRITY ---');

  // 4.1 Participant creates team
  const teamRes = await request(app)
    .post('/api/teams')
    .set('Authorization', `Bearer ${participantToken}`)
    .send({
      event_id: createdEventId,
      name: 'Vanguard Engineers'
    });
  assert(teamRes.status === 201 && teamRes.body.team.code, 'Participant creates team with auto-generated code', teamRes.body);
  createdTeamId = teamRes.body.team.id;
  teamCode = teamRes.body.team.code;

  // 4.2 Prevent duplicate membership in same event: Participant tries to create second team
  const dupTeamRes = await request(app)
    .post('/api/teams')
    .set('Authorization', `Bearer ${participantToken}`)
    .send({
      event_id: createdEventId,
      name: 'Greedy Second Team'
    });
  assert(dupTeamRes.status === 409, 'User cannot join/create multiple teams in same event (409 Conflict)');

  // 4.3 Invite member to team
  const inviteRes = await request(app)
    .post(`/api/teams/${createdTeamId}/invite`)
    .set('Authorization', `Bearer ${participantToken}`)
    .send({ email: 'newmember@dogfood.local' });
  assert(inviteRes.status === 201 && inviteRes.body.token, 'Team leader invites member and receives token');
  inviteToken = inviteRes.body.token;

  // 4.4 Participant 2 joins team via invite token
  const joinRes = await request(app)
    .post('/api/teams/join')
    .set('Authorization', `Bearer ${participant2Token}`)
    .send({ token: inviteToken });
  assert(joinRes.status === 200 && joinRes.body.team.members.length === 2, 'Invited participant joins team (200 OK)');

  // 4.5 Participant 2 attempts to join another team in same event
  const dupJoinRes = await request(app)
    .post('/api/teams/join')
    .set('Authorization', `Bearer ${participant2Token}`)
    .send({ code: teamCode });
  assert(dupJoinRes.status === 409, 'Participant cannot join duplicate team in same event (409 Conflict)');

  // -----------------------------------------------------------------
  // 5. PROJECT MANAGEMENT & DRAFT EDITING
  // -----------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: PROJECT DRAFTS & EDITING ---');

  // 5.1 Save initial draft
  const draftRes = await request(app)
    .post('/api/projects/draft')
    .set('Authorization', `Bearer ${participantToken}`)
    .send({
      team_id: createdTeamId,
      title: 'Vanguard Offline Engine',
      tagline: 'High speed local sync architecture',
      description: 'Initial draft: architecting local indexing routines and binary caching.',
      links: [
        { title: 'Repo', url: 'https://github.com/vanguard/engine', type: 'GITHUB' }
      ]
    });
  assert(draftRes.status === 200 && draftRes.body.project.status === 'DRAFT', 'Project draft created with status DRAFT');
  createdProjectId = draftRes.body.project.id;

  // 5.2 Edit draft with expanded content
  const editDraftRes = await request(app)
    .put(`/api/projects/${createdProjectId}/draft`)
    .set('Authorization', `Bearer ${participantToken}`)
    .send({
      team_id: createdTeamId,
      title: 'Vanguard Offline Engine (Revised)',
      tagline: 'High speed local sync architecture with WAL support',
      description: 'Comprehensive description: Complete offline relational synchronization engine designed for edge deployments without cloud dependencies.',
      links: [
        { title: 'GitHub', url: 'https://github.com/vanguard/engine', type: 'GITHUB' },
        { title: 'Live Demo', url: 'https://demo.vanguard.local', type: 'DEMO' }
      ]
    });
  assert(editDraftRes.status === 200 && editDraftRes.body.project.links.length === 2, 'Project draft successfully edited');

  // -----------------------------------------------------------------
  // 6. SUBMISSION SYSTEM & BACKEND DEADLINE ENFORCEMENT
  // -----------------------------------------------------------------
  console.log('\n--- TEST GROUP 6: SUBMISSION SYSTEM & DEADLINE ENFORCEMENT ---');

  // 6.1 Non-member attempting to submit project -> Forbidden (403)
  const nonMemberSubmit = await request(app)
    .post(`/api/submissions/projects/${createdProjectId}/submit`)
    .set('Authorization', `Bearer ${organizerToken}`)
    .send({ notes: 'Sneaky organizer submission' });
  assert(nonMemberSubmit.status === 403, 'Non-team member cannot submit project (403 Forbidden)');

  // 6.2 Submit project before deadline
  const validSubmitRes = await request(app)
    .post(`/api/submissions/projects/${createdProjectId}/submit`)
    .set('Authorization', `Bearer ${participantToken}`)
    .send({ notes: 'Final validated submission before deadline.' });
  assert(validSubmitRes.status === 200 && validSubmitRes.body.status === 'SUBMITTED', 'Project successfully submitted before deadline');

  // 6.3 DEADLINE ENFORCEMENT TEST:
  // Create an event with a deadline in the PAST
  const pastEventRes = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${organizerToken}`)
    .send({
      name: 'Past Hackathon Event',
      description: 'An event whose submission window has closed.',
      start_date: new Date(now - 100000000).toISOString(),
      end_date: new Date(now + 10000000).toISOString(),
      submission_deadline: new Date(now - 5000000).toISOString(), // Deadline passed!
      status: 'PUBLISHED'
    });
  const pastEventId = pastEventRes.body.event.id;

  // New participant creates team in past event
  const p3Res = await request(app)
    .post('/api/auth/register')
    .send({
      email: `late.dev.${Date.now()}@dogfood.local`,
      password: 'SecurePassword123!',
      full_name: 'Late Dev'
    });
  const lateToken = p3Res.body.token;

  const lateTeamRes = await request(app)
    .post('/api/teams')
    .set('Authorization', `Bearer ${lateToken}`)
    .send({ event_id: pastEventId, name: 'Tardy Team' });
  const lateTeamId = lateTeamRes.body.team.id;

  // Create draft in past event
  const lateDraft = await request(app)
    .post('/api/projects/draft')
    .set('Authorization', `Bearer ${lateToken}`)
    .send({
      team_id: lateTeamId,
      title: 'Late Project Submission',
      description: 'A project that attempts to submit after the deadline.',
      links: [{ title: 'Code', url: 'https://github.com/late/code', type: 'GITHUB' }]
    });
  const lateProjectId = lateDraft.body.project.id;

  // Attempt submission after deadline -> MUST BE STRICTLY REJECTED!
  const lateSubmitRes = await request(app)
    .post(`/api/submissions/projects/${lateProjectId}/submit`)
    .set('Authorization', `Bearer ${lateToken}`)
    .send({ notes: 'Please accept my late submission!' });
  assert(
    lateSubmitRes.status === 400 && lateSubmitRes.body.error.includes('deadline passed'),
    'Backend strictly rejects submissions after deadline with 400',
    lateSubmitRes.body
  );

  // -----------------------------------------------------------------
  // 7. PUBLIC GALLERY, SEARCH, & PAGINATION
  // -----------------------------------------------------------------
  console.log('\n--- TEST GROUP 7: PUBLIC GALLERY, SEARCH & PAGINATION ---');

  // 7.1 List submitted public projects
  const galleryList = await request(app).get('/api/gallery/projects?page=1&limit=10');
  assert(galleryList.status === 200 && galleryList.body.projects.length >= 2, 'Gallery lists submitted projects with pagination');

  // 7.2 Search gallery by keyword
  const searchRes = await request(app).get('/api/gallery/projects?search=Vanguard');
  assert(
    searchRes.status === 200 && searchRes.body.projects.some((p: any) => p.title.includes('Vanguard')),
    'Gallery search finds project by title keyword'
  );

  // 7.3 Public project details by ID
  const detailRes = await request(app).get(`/api/gallery/projects/${createdProjectId}`);
  assert(
    detailRes.status === 200 && detailRes.body.project.team_members.length === 2,
    'Gallery displays complete project details and team roster'
  );

  // -----------------------------------------------------------------
  // TEST SUMMARY REPORT
  // -----------------------------------------------------------------
  console.log('\n======================================================');
  console.log(` ACCEPTANCE TEST SUMMARY:`);
  console.log(` Passed: ${passed}`);
  console.log(` Failed: ${failed}`);
  console.log(` Status: ${failed === 0 ? 'ALL TIER 1 CAPABILITIES VERIFIED ✓' : 'SOME TESTS FAILED ✗'}`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
