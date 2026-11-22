import { createAgentResumeHandler } from '../../_lib/agent-resume';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createAgentResumeHandler();
