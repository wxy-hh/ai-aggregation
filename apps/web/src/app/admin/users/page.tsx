import React from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import { UserManagementShell } from './_components/user-management-shell';

export default function AdminUsersPage() {
  return (
    <AppLayout>
      <UserManagementShell />
    </AppLayout>
  );
}
