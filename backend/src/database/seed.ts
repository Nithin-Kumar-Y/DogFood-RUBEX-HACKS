import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, IDatabase } from './connection';
import { initializeDatabase } from './schema';

export async function seedDatabase(db?: IDatabase): Promise<void> {
  const database = db || getDatabase();
  await initializeDatabase(database);

  console.log('Checking if demo data exists...');
  const existingUsers = await database.query('SELECT count(*) as count FROM users');
  const count = Number(existingUsers[0]?.count || 0);

  if (count > 0) {
    console.log(`Database already contains ${count} users. Skipping seed.`);
    return;
  }

  console.log('Seeding demo data into DOGFOOD database...');
  const salt = await bcrypt.genSalt(10);
  const defaultPasswordHash = await bcrypt.hash('Dogfood123!', salt);

  // 1. Seed Users
  const users = [
    {
      id: uuidv4(),
      email: 'admin@dogfood.local',
      password_hash: defaultPasswordHash,
      full_name: 'Alex Vance',
      role: 'ADMIN',
      avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      bio: 'System Administrator and core infrastructure maintainer.'
    },
    {
      id: uuidv4(),
      email: 'organizer@dogfood.local',
      password_hash: defaultPasswordHash,
      full_name: 'Elena Rostova',
      role: 'ORGANIZER',
      avatar_url: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150',
      bio: 'Lead Hackathon Director for Global AI Hackathons.'
    },
    {
      id: uuidv4(),
      email: 'judge@dogfood.local',
      password_hash: defaultPasswordHash,
      full_name: 'Marcus Sterling',
      role: 'JUDGE',
      avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      bio: 'Distinguished Engineer and recurring Hackathon Judge.'
    },
    {
      id: uuidv4(),
      email: 'alice@dogfood.local',
      password_hash: defaultPasswordHash,
      full_name: 'Alice Chen',
      role: 'PARTICIPANT',
      avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      bio: 'Full-stack builder passionate about autonomous agents.'
    },
    {
      id: uuidv4(),
      email: 'bob@dogfood.local',
      password_hash: defaultPasswordHash,
      full_name: 'Bob Martinez',
      role: 'PARTICIPANT',
      avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
      bio: 'Backend & systems engineer specializing in distributed systems.'
    },
    {
      id: uuidv4(),
      email: 'charlie@dogfood.local',
      password_hash: defaultPasswordHash,
      full_name: 'Charlie Dubois',
      role: 'PARTICIPANT',
      avatar_url: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150',
      bio: 'AI researcher and prompt-engineering specialist.'
    },
    {
      id: uuidv4(),
      email: 'david@dogfood.local',
      password_hash: defaultPasswordHash,
      full_name: 'David Kim',
      role: 'PARTICIPANT',
      avatar_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
      bio: 'Product designer focusing on accessible developer experiences.'
    }
  ];

  for (const u of users) {
    await database.run(
      `INSERT INTO users (id, email, password_hash, full_name, role, avatar_url, bio)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [u.id, u.email, u.password_hash, u.full_name, u.role, u.avatar_url, u.bio]
    );
  }

  const organizer = users.find(u => u.email === 'organizer@dogfood.local')!;
  const alice = users.find(u => u.email === 'alice@dogfood.local')!;
  const bob = users.find(u => u.email === 'bob@dogfood.local')!;
  const charlie = users.find(u => u.email === 'charlie@dogfood.local')!;
  const david = users.find(u => u.email === 'david@dogfood.local')!;

  // 2. Seed Events
  const now = new Date();
  const futureStart = new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString();
  const futureDeadline = new Date(now.getTime() + 5 * 24 * 3600 * 1000).toISOString();
  const futureEnd = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString();

  // Past event with closed deadline
  const pastStart = new Date(now.getTime() - 10 * 24 * 3600 * 1000).toISOString();
  const pastDeadline = new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString();
  const pastEnd = new Date(now.getTime() - 1 * 24 * 3600 * 1000).toISOString();

  // Upcoming draft event
  const draftStart = new Date(now.getTime() + 14 * 24 * 3600 * 1000).toISOString();
  const draftDeadline = new Date(now.getTime() + 16 * 24 * 3600 * 1000).toISOString();
  const draftEnd = new Date(now.getTime() + 18 * 24 * 3600 * 1000).toISOString();

  const event1Id = uuidv4();
  const event2Id = uuidv4();
  const event3Id = uuidv4();

  await database.run(
    `INSERT INTO events (id, organizer_id, name, slug, description, banner_url, start_date, end_date, submission_deadline, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event1Id,
      organizer.id,
      'Global AI & Autonomous Agents Hackathon 2026',
      'global-ai-hackathon-2026',
      'The premier worldwide challenge for building autonomous agents, neural developer tools, and human-in-the-loop AI systems. Compete for $25,000 in bounties.',
      'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&q=80',
      futureStart,
      futureEnd,
      futureDeadline,
      'PUBLISHED'
    ]
  );

  await database.run(
    `INSERT INTO events (id, organizer_id, name, slug, description, banner_url, start_date, end_date, submission_deadline, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event2Id,
      organizer.id,
      'Web3 & Decentralized Infrastructure Hack',
      'web3-infra-hack',
      'Explore zero-knowledge proofs, decentralized physical infrastructure (DePIN), and trustless data networks. Submissions for this round are now closed.',
      'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=1200&q=80',
      pastStart,
      pastEnd,
      pastDeadline,
      'PUBLISHED'
    ]
  );

  await database.run(
    `INSERT INTO events (id, organizer_id, name, slug, description, banner_url, start_date, end_date, submission_deadline, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event3Id,
      organizer.id,
      'GreenTech Sustainability Sprint',
      'greentech-sustainability-sprint',
      'Harnessing open-source software and climate data to reduce carbon emissions and optimize renewable energy micro-grids. Currently in draft status.',
      'https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?w=1200&q=80',
      draftStart,
      draftEnd,
      draftDeadline,
      'DRAFT'
    ]
  );

  // 3. Seed Tracks
  const track1Id = uuidv4();
  const track2Id = uuidv4();
  const track3Id = uuidv4();
  const trackWeb3Id = uuidv4();

  await database.run(
    `INSERT INTO event_tracks (id, event_id, name, description) VALUES (?, ?, ?, ?)`,
    [track1Id, event1Id, 'Autonomous Multi-Agent Systems', 'Agents that reason, plan, and collaborate across environments autonomously.']
  );
  await database.run(
    `INSERT INTO event_tracks (id, event_id, name, description) VALUES (?, ?, ?, ?)`,
    [track2Id, event1Id, 'Developer Productivity & Code Intelligence', 'Next-generation tooling for software engineers, refactoring, and automated testing.']
  );
  await database.run(
    `INSERT INTO event_tracks (id, event_id, name, description) VALUES (?, ?, ?, ?)`,
    [track3Id, event1Id, 'Human-AI Collaboration & Creative Interfaces', 'Interactive experiences and co-pilots that empower creators and domain experts.']
  );
  await database.run(
    `INSERT INTO event_tracks (id, event_id, name, description) VALUES (?, ?, ?, ?)`,
    [trackWeb3Id, event2Id, 'Zero Knowledge & Privacy Tech', 'Cryptographic privacy and trustless verification systems.']
  );

  // 4. Seed Prizes
  await database.run(
    `INSERT INTO prizes (id, event_id, name, description, amount, rank) VALUES (?, ?, ?, ?, ?, ?)`,
    [uuidv4(), event1Id, 'Grand Champion', 'Overall most innovative and technically sophisticated project', '$15,000', 1]
  );
  await database.run(
    `INSERT INTO prizes (id, event_id, name, description, amount, rank) VALUES (?, ?, ?, ?, ?, ?)`,
    [uuidv4(), event1Id, 'Best Autonomous Agent', 'Top project in the Multi-Agent track demonstrating end-to-end execution', '$5,000', 2]
  );
  await database.run(
    `INSERT INTO prizes (id, event_id, name, description, amount, rank) VALUES (?, ?, ?, ?, ?, ?)`,
    [uuidv4(), event1Id, 'Excellence in UX & Design', 'Most intuitive, polished, and delightful user interface', '$3,000', 3]
  );

  // 5. Seed Teams & Members
  const team1Id = uuidv4();
  const team1Code = 'NF-9082';
  await database.run(
    `INSERT INTO teams (id, event_id, creator_id, name, code) VALUES (?, ?, ?, ?, ?)`,
    [team1Id, event1Id, alice.id, 'NeuralForge', team1Code]
  );
  await database.run(
    `INSERT INTO team_members (id, team_id, user_id, role) VALUES (?, ?, ?, ?)`,
    [uuidv4(), team1Id, alice.id, 'LEADER']
  );
  await database.run(
    `INSERT INTO team_members (id, team_id, user_id, role) VALUES (?, ?, ?, ?)`,
    [uuidv4(), team1Id, bob.id, 'MEMBER']
  );

  const team2Id = uuidv4();
  const team2Code = 'AO-4412';
  await database.run(
    `INSERT INTO teams (id, event_id, creator_id, name, code) VALUES (?, ?, ?, ?, ?)`,
    [team2Id, event1Id, charlie.id, 'AgenticOps', team2Code]
  );
  await database.run(
    `INSERT INTO team_members (id, team_id, user_id, role) VALUES (?, ?, ?, ?)`,
    [uuidv4(), team2Id, charlie.id, 'LEADER']
  );
  await database.run(
    `INSERT INTO team_members (id, team_id, user_id, role) VALUES (?, ?, ?, ?)`,
    [uuidv4(), team2Id, david.id, 'MEMBER']
  );

  // 6. Seed Projects, Links, and Submissions
  const project1Id = uuidv4();
  await database.run(
    `INSERT INTO projects (id, event_id, team_id, track_id, title, tagline, description, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      project1Id,
      event1Id,
      team1Id,
      track1Id,
      'AutoDev: Self-Healing Code Assistant',
      'An autonomous software engineering agent that detects regressions, runs tests, and applies verified fixes.',
      'AutoDev is an offline-capable agentic coding companion that continuously monitors test failures in local repositories, searches documentation, generates candidate diffs, and validates them in an isolated sandbox. Built with a modular plugin architecture, AutoDev eliminates 80% of repetitive debugging friction for distributed teams.',
      'SUBMITTED'
    ]
  );

  await database.run(
    `INSERT INTO project_links (id, project_id, title, url, type) VALUES (?, ?, ?, ?, ?)`,
    [uuidv4(), project1Id, 'GitHub Repository', 'https://github.com/dogfood-demo/autodev', 'GITHUB']
  );
  await database.run(
    `INSERT INTO project_links (id, project_id, title, url, type) VALUES (?, ?, ?, ?, ?)`,
    [uuidv4(), project1Id, 'Interactive Demo', 'https://demo.autodev.local', 'DEMO']
  );
  await database.run(
    `INSERT INTO project_links (id, project_id, title, url, type) VALUES (?, ?, ?, ?, ?)`,
    [uuidv4(), project1Id, 'Walkthrough Video', 'https://youtu.be/demo-autodev-walkthrough', 'VIDEO']
  );

  // Project 1 Submission
  await database.run(
    `INSERT INTO submissions (id, project_id, submitted_by_user_id, submitted_at, notes, is_final)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [uuidv4(), project1Id, alice.id, new Date(now.getTime() - 12 * 3600 * 1000).toISOString(), 'Official team submission for the Autonomous Multi-Agent track.', 1]
  );

  // Project 2 (DRAFT)
  const project2Id = uuidv4();
  await database.run(
    `INSERT INTO projects (id, event_id, team_id, track_id, title, tagline, description, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      project2Id,
      event1Id,
      team2Id,
      track2Id,
      'AgenticFlow: Visual Canvas for Multi-Agent Orchestration',
      'Drag-and-drop orchestration canvas connecting autonomous tools, memory stores, and vector databases.',
      'Work in progress: drafting our architecture and node graph execution engine. Currently refining our flow runner and websocket streaming metrics.',
      'DRAFT'
    ]
  );

  await database.run(
    `INSERT INTO project_links (id, project_id, title, url, type) VALUES (?, ?, ?, ?, ?)`,
    [uuidv4(), project2Id, 'GitHub Prototype', 'https://github.com/dogfood-demo/agenticflow', 'GITHUB']
  );

  console.log('Seed completed successfully!');
  console.log('Demo accounts ready:');
  console.log(' - Admin: admin@dogfood.local / Dogfood123!');
  console.log(' - Organizer: organizer@dogfood.local / Dogfood123!');
  console.log(' - Judge: judge@dogfood.local / Dogfood123!');
  console.log(' - Participant (Lead): alice@dogfood.local / Dogfood123!');
  console.log(' - Participant (Member): bob@dogfood.local / Dogfood123!');
}

if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed error:', err);
      process.exit(1);
    });
}
