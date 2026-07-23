import { NextRequest } from 'next/server';
import { proxyMedia } from '@/lib/utils/media-proxy';

export async function GET(request: NextRequest) {
  return proxyMedia(request, 'video/mp4', 'video');
}
