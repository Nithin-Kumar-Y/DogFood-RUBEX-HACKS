'use strict';
// Shared helpers: ids, slugs, invite codes, validation, deadline logic.
const crypto = require('crypto');

function slugify(text) {
  return (
    String(text || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'event'
  );
}

function randomCode(bytes = 12) {
  return crypto.randomBytes(bytes).toString('hex').slice(0, bytes * 2);
}

function sessionToken() {
  return crypto.randomBytes(32).toString('hex'); // 64 hex chars
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function isValidUrl(u) {
  try {
    const x = new URL(String(u));
    return x.protocol === 'http:' || x.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

function parseDate(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isPastDeadline(eventRow, now = new Date()) {
  if (!eventRow || !eventRow.submission_deadline) return false;
  return now > new Date(eventRow.submission_deadline);
}

function validateEventInput(b) {
  const errors = {};
  if (!b.title || String(b.title).trim().length < 3)
    errors.title = 'Event name must be at least 3 characters.';
  const starts = parseDate(b.starts_at);
  const ends = parseDate(b.ends_at);
  const deadline = parseDate(b.submission_deadline);
  if (!starts) errors.starts_at = 'Valid start date/time is required.';
  if (!ends) errors.ends_at = 'Valid end date/time is required.';
  if (!deadline) errors.submission_deadline = 'Valid submission deadline is required.';
  if (starts && ends && starts >= ends)
    errors.ends_at = 'End must be after start.';
  if (starts && deadline && deadline < starts)
    errors.submission_deadline = 'Deadline should not be before event start.';
  if (deadline && ends && deadline > ends)
    errors.submission_deadline =
      'Deadline is after event end — allowed but unusual. Keep deadline <= end.';
  if (b.status && !['draft', 'published', 'archived'].includes(b.status))
    errors.status = 'Invalid status.';
  return { errors, starts, ends, deadline };
}

function validateProjectForSubmit(project, links, eventRow) {
  const errors = [];
  if (!project.title || project.title.trim().length < 3)
    errors.push('Title must be at least 3 characters.');
  if (!project.description || project.description.trim().length < 20)
    errors.push('Description must be at least 20 characters for submission.');
  if (!links || links.length === 0)
    errors.push('At least one project link (repo/demo/video) is required.');
  else {
    for (const l of links) {
      if (!isValidUrl(l.url)) errors.push(`Invalid URL: ${l.url}`);
    }
  }
  // If the event defines tracks, a track is required.
  if (eventRow && eventRow._trackCount > 0 && !project.track_id)
    errors.push('Please select a track.');
  return errors;
}

module.exports = {
  slugify,
  randomCode,
  sessionToken,
  hashToken,
  isValidEmail,
  isValidUrl,
  parseDate,
  isPastDeadline,
  validateEventInput,
  validateProjectForSubmit,
};
