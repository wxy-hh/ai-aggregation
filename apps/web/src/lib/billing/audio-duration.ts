import { parseFile } from 'music-metadata';

/**
 * 从已落盘的音频文件读取真实时长。客户端上报的 duration 不参与计费，
 * 避免被篡改后造成少扣或多扣。
 */
export async function getAudioDurationSeconds(filePath: string): Promise<number> {
  const metadata = await parseFile(filePath, { duration: true });
  const duration = metadata.format.duration;

  if (!Number.isFinite(duration) || !duration || duration <= 0) {
    throw new Error('无法读取音频真实时长，请上传有效的 MP3、WAV 或 AAC 文件');
  }

  return Math.ceil(duration);
}
