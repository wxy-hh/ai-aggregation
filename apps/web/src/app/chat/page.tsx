'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const ChatWorkspace = dynamic(() => import('./chat-workspace'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-full items-center justify-center bg-[#F5F7FA] dark:bg-[#0A0B10]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#d7e2f3] border-t-[#3c6df3]" />
    </div>
  ),
});

export default function ChatPage() {
  return <ChatWorkspace />;
}
