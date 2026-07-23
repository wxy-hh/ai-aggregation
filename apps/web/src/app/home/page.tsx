'use client';

import React from 'react';
import { AuthGuard } from '@/components/auth/auth-guard';
import { AppLayout } from '@/components/layout/app-layout';
import { HomeContent } from '@/components/home/home-content';

export default function HomeWorkspacePage() {
  return (
    <AuthGuard>
      <AppLayout>
        <HomeContent />
      </AppLayout>
    </AuthGuard>
  );
}
