'use client';

import { useMemo, useState } from 'react';
import { OnboardingModal, type OnboardingInput } from './onboarding/onboarding-modal';
import { StarDecodeOverlay } from './onboarding/star-decode-overlay';
import { DestinyShell } from './layout/destiny-shell';
import { getMockDestinyReport } from './reports/mock';

type Stage = 'onboarding' | 'decoding' | 'report';

export function DestinyPageClient() {
  const [stage, setStage] = useState<Stage>('onboarding');
  const [input, setInput] = useState<OnboardingInput | null>(null);

  const report = useMemo(() => getMockDestinyReport(input), [input]);

  return (
    <div className="relative flex-1 h-full overflow-hidden">
      <DestinyShell report={report} />

      <OnboardingModal
        open={stage === 'onboarding'}
        defaultValue={input ?? undefined}
        onStartAction={(next) => {
          setInput(next);
          setStage('decoding');
        }}
      />

      <StarDecodeOverlay
        open={stage === 'decoding'}
        onDone={() => {
          setStage('report');
        }}
      />
    </div>
  );
}

