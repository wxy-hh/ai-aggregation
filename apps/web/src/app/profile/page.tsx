import React from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import { ProfileShell } from './_components/profile-shell';

export default function ProfilePage() {
  return (
    <AppLayout>
      <ProfileShell />
    </AppLayout>
  );
}
