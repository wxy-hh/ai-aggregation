import type { ProfileUsageSummary } from '@repo/shared';

export interface ProfileViewModel {
  username: string;
  fullName: string;
  displayName: string;
  email: string | null;
  userId: string;
  timezone: string;
  bio: string;
  avatar: string | null;
  membership: string;
}

export type ResourceUsageViewModel = ProfileUsageSummary;
