import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

const BASE_URL = process.env.QIMEN_CHECK_BASE_URL || 'http://localhost:3030';
const POLL_INTERVAL_MS = Number(process.env.QIMEN_CHECK_POLL_INTERVAL_MS || '1500');
const MAX_POLLS = Number(process.env.QIMEN_CHECK_MAX_POLLS || '20');

const payload = {
  context: {
    datetime: '2026-04-16 09:30',
    location: '上海',
    chartMethod: 'time',
  },
  question: {
    category: 'career',
    description: '我想判断近期是否适合换工作，以及该怎么安排节奏。',
    focus: 'risk_control',
    outputStyle: 'plain',
    outputLength: 'brief',
  },
};

async function main() {
  console.log(`开始自检奇门链路: ${BASE_URL}`);

  const startResponse = await fetch(`${BASE_URL}/api/destiny/qimen/analyze/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const startJson = await startResponse.json();

  console.log('start 响应:', JSON.stringify(startJson));

  if (!startResponse.ok || !startJson.analysisId) {
    process.exit(1);
  }

  const analysisId = startJson.analysisId;

  for (let attempt = 1; attempt <= MAX_POLLS; attempt += 1) {
    await delay(POLL_INTERVAL_MS);

    const baseResponse = await fetch(
      `${BASE_URL}/api/destiny/qimen/analyze/sections/baseResult?analysisId=${encodeURIComponent(analysisId)}`
    );
    const baseJson = await baseResponse.json();

    console.log(
      `第 ${attempt} 次轮询:`,
      JSON.stringify({
        httpStatus: baseResponse.status,
        status: baseJson.status,
        error: baseJson.error,
      })
    );

    if (baseJson.status === 'completed') {
      console.log('基础盘面已完成');
      return;
    }

    if (baseJson.status === 'failed') {
      console.error(`基础盘面失败: ${baseJson.error || '未知错误'}`);
      process.exit(1);
    }
  }

  console.error(`基础盘面在 ${MAX_POLLS} 次轮询后仍未完成`);
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
