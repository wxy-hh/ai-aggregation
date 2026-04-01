import { describe, expect, it } from 'vitest';
import { blobToDataUrl } from './image-url';

describe('blobToDataUrl', () => {
  it('should convert blob to persistent data url', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });

    const result = await blobToDataUrl(blob);

    expect(result.startsWith('data:text/plain;base64,')).toBe(true);
    expect(result.startsWith('blob:')).toBe(false);
  });
});
