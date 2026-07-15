import { beforeEach, describe, expect, it, vi } from 'vitest';

const { parseFile } = vi.hoisted(() => ({ parseFile: vi.fn() }));

vi.mock('music-metadata', () => ({ parseFile }));

import { getAudioDurationSeconds } from './audio-duration';

describe('服务端音频时长计量', () => {
  beforeEach(() => {
    parseFile.mockReset();
  });

  it('读取文件元数据并向上取整，不接受客户端时长参与计费', async () => {
    parseFile.mockResolvedValue({ format: { duration: 12.01 } });

    await expect(getAudioDurationSeconds('/tmp/voice.wav')).resolves.toBe(13);
    expect(parseFile).toHaveBeenCalledWith('/tmp/voice.wav', { duration: true });
  });

  it('无法获得有效媒体时长时拒绝继续请求', async () => {
    parseFile.mockResolvedValue({ format: { duration: undefined } });

    await expect(getAudioDurationSeconds('/tmp/invalid.wav')).rejects.toThrow('无法读取音频真实时长');
  });
});
