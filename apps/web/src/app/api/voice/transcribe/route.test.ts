import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  transcribeAudio,
  saveUploadedFile,
  deleteFile,
  validateFile,
  requireAuth,
  normalizeUsage,
  safeRecordAiUsage,
} = vi.hoisted(() => ({
  transcribeAudio: vi.fn(),
  saveUploadedFile: vi.fn(),
  deleteFile: vi.fn(),
  validateFile: vi.fn(),
  requireAuth: vi.fn(),
  normalizeUsage: vi.fn(),
  safeRecordAiUsage: vi.fn(),
}));

vi.mock('@/lib/siliconflow', () => ({
  transcribeAudio,
}));

vi.mock('@/lib/file-upload', () => ({
  saveUploadedFile,
  deleteFile,
  validateFile,
}));

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth,
}));

vi.mock('@/lib/ai-usage', () => ({
  normalizeUsage,
  safeRecordAiUsage,
}));

describe('POST /api/voice/transcribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DATABASE_URL;
  });

  it('转录成功后按次数或 token 记录资源消耗', async () => {
    validateFile.mockReturnValue({ valid: true });
    saveUploadedFile.mockResolvedValue('/tmp/audio.mp3');
    requireAuth.mockResolvedValue('user-2');
    transcribeAudio.mockResolvedValue({
      text: '这是一段转录结果',
      usage: { total_tokens: 66 },
    });
    normalizeUsage.mockReturnValue({ totalTokens: 66, taskCount: 1 });

    vi.resetModules();
    const { POST } = await import('./route');

    const formData = new FormData();
    formData.append('file', new File(['voice-content'], 'meeting.mp3', { type: 'audio/mpeg' }));

    const response = await POST(
      new Request('http://localhost/api/voice/transcribe', {
        method: 'POST',
        body: formData,
      }) as never
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe('completed');
    expect(safeRecordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-2',
        action: 'voice-transcribe',
        feature: 'voice',
      })
    );
    expect(deleteFile).toHaveBeenCalledWith('/tmp/audio.mp3');
  });

  it('文件校验失败时返回 400', async () => {
    validateFile.mockReturnValue({ valid: false, error: '文件过大' });

    vi.resetModules();
    const { POST } = await import('./route');

    const formData = new FormData();
    formData.append('file', new File(['bad'], 'bad.mp3', { type: 'audio/mpeg' }));

    const response = await POST(
      new Request('http://localhost/api/voice/transcribe', {
        method: 'POST',
        body: formData,
      }) as never
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('文件过大');
    expect(safeRecordAiUsage).not.toHaveBeenCalled();
  });
});
