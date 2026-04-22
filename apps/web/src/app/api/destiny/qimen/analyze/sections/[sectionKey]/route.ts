import { NextResponse } from 'next/server';
import { QimenAnalysisStore, type QimenQuerySectionKey, type QimenSectionKey } from '@repo/shared';

export const runtime = 'nodejs';
export const maxDuration = 15;

const VALID_SECTION_KEYS: QimenQuerySectionKey[] = [
  'baseResult',
  'strategyOverview',
  'timingWindows',
  'chartSummary',
];

const SECTION_WAIT_TIMEOUT_MS = 40000;

export async function GET(
  request: Request,
  context: { params: Promise<{ sectionKey: string }> }
) {
  const store = new QimenAnalysisStore();

  try {
    const { searchParams } = new URL(request.url);
    const analysisId = searchParams.get('analysisId')?.trim();
    const { sectionKey: rawSectionKey } = await context.params;
    const sectionKey = rawSectionKey as QimenQuerySectionKey;

    if (!analysisId) {
      return NextResponse.json({ success: false, error: '缺少 analysisId' }, { status: 400 });
    }

    if (!VALID_SECTION_KEYS.includes(sectionKey)) {
      return NextResponse.json({ success: false, error: '无效的 sectionKey' }, { status: 400 });
    }

    if (sectionKey === 'baseResult') {
      const baseResult = await store.getBaseResult(analysisId);
      if (baseResult) {
        return NextResponse.json({
          success: true,
          analysisId,
          sectionKey,
          status: 'completed',
          data: baseResult,
        });
      }

      const status = await store.getSectionStatus(analysisId, sectionKey);
      if (status === 'failed') {
        return NextResponse.json({
          success: false,
          analysisId,
          sectionKey,
          status: 'failed',
          error: (await store.getSectionError(analysisId, sectionKey)) ?? '基础盘面生成失败',
        });
      }

      if (status === 'pending') {
        return NextResponse.json(
          {
            success: false,
            analysisId,
            sectionKey,
            status: 'pending',
          },
          { status: 202 }
        );
      }

      return NextResponse.json({ success: false, error: '基础盘面不存在' }, { status: 404 });
    }

    const cachedResult = await store.getSectionResult(analysisId, sectionKey);
    if (cachedResult) {
      return NextResponse.json({
        success: true,
        analysisId,
        sectionKey,
        status: 'completed',
        data: cachedResult,
      });
    }

    const waited = await store.waitForSection(
      analysisId,
      sectionKey as QimenSectionKey,
      SECTION_WAIT_TIMEOUT_MS
    );

    if (waited.status === 'completed') {
      return NextResponse.json({
        success: true,
        analysisId,
        sectionKey,
        status: 'completed',
        data: waited.data,
      });
    }

    if (waited.status === 'failed') {
      return NextResponse.json({
        success: false,
        analysisId,
        sectionKey,
        status: 'failed',
        error: waited.error,
      });
    }

    return NextResponse.json(
      {
        success: false,
        analysisId,
        sectionKey,
        status: 'pending',
      },
      { status: 202 }
    );
  } finally {
    await store.disconnect();
  }
}
