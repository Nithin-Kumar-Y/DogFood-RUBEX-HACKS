import React from 'react';

interface BadgeProps {
  status: string;
  variant?: 'draft' | 'submitted' | 'locked' | 'published' | 'leader' | 'member' | 'default';
  children?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({ status, variant, children }) => {
  const norm = (status || '').toUpperCase();
  let badgeClass = 'badge badge-draft';

  if (variant) {
    badgeClass = `badge badge-${variant}`;
  } else if (norm === 'SUBMITTED' || norm === 'ACCEPTED') {
    badgeClass = 'badge badge-submitted';
  } else if (norm === 'LOCKED' || norm === 'EXPIRED') {
    badgeClass = 'badge badge-locked';
  } else if (norm === 'PUBLISHED' || norm === 'LEADER') {
    badgeClass = 'badge badge-published';
  }

  return (
    <span className={badgeClass}>
      {children || status}
    </span>
  );
};
