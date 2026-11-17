import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  return {
    currentUser: { id: 'user_1', username: 'testuser' } as { id: string; username: string } | null,
    kbFindUnique: vi.fn(),
    docFindFirst: vi.fn(),
    download: vi.fn(),
  };
});

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: vi.fn(async () => {
    if (!mocks.currentUser) {
      const { AuthError } = await import('@/lib/auth/errors');
      throw new AuthError('未授权访问', 'UNAUTHORIZED');
    }
    return mocks.currentUser;
  }),
}));

vi.mock('@repo/db', () => ({
  prisma: {
    knowledgeBase: {
      findUnique: mocks.kbFindUnique,
    },
    document: {
      findFirst: mocks.docFindFirst,
    },
  },
}));

vi.mock('@repo/storage', () => ({
  createStorageProvider: vi.fn(() => ({
    download: mocks.download,
    getUrl: vi.fn(),
  })),
}));

import { GET } from './route';

describe('GET /api/knowledge-bases/[id]/documents/[docId]/download (同源源资产下载)', () => {
  const routeContext = {
    params: Promise.resolve({ id: 'kb_1', docId: 'doc_1' }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser = { id: 'user_1', username: 'testuser' };
    mocks.kbFindUnique.mockResolvedValue({ id: 'kb_1', userId: 'user_1' });
    mocks.docFindFirst.mockResolvedValue({
      id: 'doc_1',
      knowledgeBaseId: 'kb_1',
      userId: 'user_1',
      name: '季度报告.docx',
      storageKey: 'docs/user_1/doc_1/v1/季度报告.docx',
      sourceType: 'file',
      deletedAt: null,
    });
  });

  it('TC08-7 未登录下载返回 401 且不读存储', async () => {
    mocks.currentUser = null;

    const req = new NextRequest(
      'http://localhost:3030/api/knowledge-bases/kb_1/documents/doc_1/download'
    );
    const res = await GET(req, routeContext);

    expect(res.status).toBe(401);
    expect(mocks.kbFindUnique).not.toHaveBeenCalled();
    expect(mocks.docFindFirst).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('TC08-8 合法下载返回原字节与 UTF-8 文件名', async () => {
    const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00]);
    mocks.download.mockResolvedValueOnce(bytes);

    const req = new NextRequest(
      'http://localhost:3030/api/knowledge-bases/kb_1/documents/doc_1/download'
    );
    const res = await GET(req, routeContext);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );

    const disposition = res.headers.get('content-disposition') ?? '';
    expect(disposition).toContain('attachment;');
    expect(disposition).toContain("filename*=UTF-8''");
    expect(disposition).toContain(encodeURIComponent('季度报告.docx'));

    expect(Buffer.from(await res.arrayBuffer()).equals(bytes)).toBe(true);
    expect(mocks.download).toHaveBeenCalledWith('docs/user_1/doc_1/v1/季度报告.docx');
  });

  it('TC08-9 跨租户或不存在文档下载返回 404', async () => {
    mocks.kbFindUnique.mockResolvedValueOnce({ id: 'kb_1', userId: 'user_other' });

    const req = new NextRequest(
      'http://localhost:3030/api/knowledge-bases/kb_1/documents/doc_1/download'
    );
    const res = await GET(req, routeContext);

    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain('知识库不存在');
    expect(mocks.download).not.toHaveBeenCalled();

    mocks.kbFindUnique.mockResolvedValueOnce({ id: 'kb_1', userId: 'user_1' });
    mocks.docFindFirst.mockResolvedValueOnce(null);

    const missingDocRes = await GET(req, routeContext);

    expect(missingDocRes.status).toBe(404);
    expect((await missingDocRes.json()).error).toContain('文档不存在');
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('未知扩展名下载使用 application/octet-stream', async () => {
    mocks.docFindFirst.mockResolvedValueOnce({
      id: 'doc_1',
      knowledgeBaseId: 'kb_1',
      userId: 'user_1',
      name: '未知归档.bin',
      storageKey: 'docs/user_1/doc_1/v1/未知归档.bin',
      sourceType: 'file',
      deletedAt: null,
    });
    mocks.download.mockResolvedValueOnce(Buffer.from([0x00, 0x01]));

    const req = new NextRequest(
      'http://localhost:3030/api/knowledge-bases/kb_1/documents/doc_1/download?path=/etc/passwd'
    );
    const res = await GET(req, routeContext);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(mocks.download).toHaveBeenCalledWith('docs/user_1/doc_1/v1/未知归档.bin');
  });
});
