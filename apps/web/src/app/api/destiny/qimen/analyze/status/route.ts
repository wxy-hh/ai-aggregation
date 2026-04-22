import { NextResponse } from 'next/server';
import { QimenAnalysisStore } from '@repo/shared';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function GET(request: Request) {
  const store = new QimenAnalysisStore();

  try {
    const { searchParams } = new URL(request.url);
    const analysisId = searchParams.get('analysisId')?.trim();

    if (!analysisId) {
      return NextResponse.json({ success: false, error: '缺少 analysisId' }, { status: 400 });
    }

    const statuses = await store.getAllStatuses(analysisId);
    if (!statuses) {
      return NextResponse.json({ success: false, error: '分析任务不存在' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      analysisId,
      statuses,
    });
  } finally {
    await store.disconnect();
  }
}
