'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { type TabType } from './mobile-tabs';
import { ContentPanel } from './content-panel';
import { PreviewViewport } from './preview-viewport';
import { AIAssistantPanel } from './ai-assistant-panel';

interface MobileTabContentProps {
  activeTab: TabType;
}

const tabVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? '100%' : '-100%',
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? '100%' : '-100%',
    opacity: 0,
  }),
};

const tabOrder: TabType[] = ['edit', 'preview', 'ai'];

export function MobileTabContent({ activeTab }: MobileTabContentProps) {
  const currentIndex = tabOrder.indexOf(activeTab);

  return (
    <div className="lg:hidden relative flex-1 overflow-hidden pt-14">
      <AnimatePresence initial={false} custom={currentIndex} mode="wait">
        <motion.div
          key={activeTab}
          custom={currentIndex}
          variants={tabVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            x: { type: 'spring', stiffness: 300, damping: 30 },
            opacity: { duration: 0.2 },
          }}
          className="absolute inset-0 overflow-y-auto"
        >
          {activeTab === 'edit' && (
            <div className="h-full">
              <ContentPanel />
            </div>
          )}

          {activeTab === 'preview' && (
            <div className="h-full flex items-center justify-center p-4">
              <PreviewViewport />
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="h-full">
              <AIAssistantPanel />
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
