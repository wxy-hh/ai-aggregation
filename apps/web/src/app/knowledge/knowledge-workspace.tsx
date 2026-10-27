'use client';

/**
 * 知识库工作区组件 (KnowledgeWorkspace)
 *
 * 核心设计契约：
 * 1. 知识库列表与切换：
 *    - 呈现知识库列表、文档计数
 *    - 支持新建知识库弹窗（触区 >= 44px，按钮 text="新建知识库"，placeholder="知识库名称" 对齐 QA-002）
 * 2. 详情视图双 Tab（对齐 QA-003）：
 *    - role="tab" text="检索调试"：加载 RetrievalDebugger 组件
 *    - role="tab" text="文档管理"：加载文档列表、上传入口与切片/版本状态
 * 3. 移动端窄屏适配（对齐 QA-017）：
 *    - 最小触控区域 >= 44px，全屏自适应不溢出
 */

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { fetchWithAuth } from '@/lib/api/client';
import { RetrievalDebugger } from './_components/retrieval-debugger';
import { DocumentPreviewDrawer } from './_components/document-preview-drawer';
import { FaqManagementPanel } from './_components/faq-management-panel';
import { UrlImportDialog } from './_components/url-import-dialog';
import {
  BookOpen,
  Plus,
  FileText,
  Search,
  Upload,
  RefreshCw,
  FolderOpen,
  Eye,
  HelpCircle,
  Globe,
  ExternalLink,
} from 'lucide-react';

export interface KnowledgeBaseItem {
  id: string;
  name: string;
  description: string | null;
  status: string;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentItem {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  version: number;
  chunkCount: number;
  errorMessage: string | null;
  sourceType?: 'file' | 'url';
  sourceUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function KnowledgeWorkspace() {
  const [knowledgeBases, setKnowledgeBases] = React.useState<KnowledgeBaseItem[]>([]);
  const [selectedKbId, setSelectedKbId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState('debugger');

  // 新建知识库弹窗状态
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [newKbName, setNewKbName] = React.useState('');
  const [newKbDesc, setNewKbDesc] = React.useState('');
  const [createSubmitting, setCreateSubmitting] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  // 文档列表状态
  const [documents, setDocuments] = React.useState<DocumentItem[]>([]);
  const [docsLoading, setDocsLoading] = React.useState(false);

  // 网页外链导入弹窗状态 (ADR-0028)
  const [isUrlImportOpen, setIsUrlImportOpen] = React.useState(false);

  // 文档预览抽屉状态
  const [previewState, setPreviewState] = React.useState<{
    isOpen: boolean;
    documentId: string | null;
    documentName?: string;
    documentVersion?: number;
    initialStatus?: 'pending' | 'processing' | 'ready' | 'failed';
    initialErrorMessage?: string | null;
    sourceUrl?: string | null;
  }>({
    isOpen: false,
    documentId: null,
  });

  // 1. 获取知识库列表
  const loadKnowledgeBases = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth('/api/knowledge-bases');
      const json = await res.json();
      if (res.ok && json.success) {
        const list: KnowledgeBaseItem[] = json.data?.knowledgeBases || [];
        setKnowledgeBases(list);
        if (list.length > 0 && !selectedKbId) {
          setSelectedKbId(list[0].id);
        }
      }
    } catch (err) {
      console.error('[knowledge] 加载知识库列表失败:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedKbId]);

  React.useEffect(() => {
    loadKnowledgeBases();
  }, [loadKnowledgeBases]);

  // 2. 加载选中文档列表
  const loadDocuments = React.useCallback(async (kbId: string) => {
    try {
      setDocsLoading(true);
      const res = await fetchWithAuth(`/api/knowledge-bases/${kbId}/documents`);
      const json = await res.json();
      if (res.ok && json.success) {
        setDocuments(json.data?.documents || []);
      }
    } catch (err) {
      console.error('[knowledge] 加载文档列表失败:', err);
    } finally {
      setDocsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (selectedKbId && activeTab === 'documents') {
      loadDocuments(selectedKbId);
    }
  }, [selectedKbId, activeTab, loadDocuments]);

  // 当有处于处理中或待处理的文档时，开启 3 秒轻量轮询更新文档终态 (ADR-0028)
  React.useEffect(() => {
    if (!selectedKbId || activeTab !== 'documents') return;
    const hasUnfinished = documents.some(
      (d) => d.status === 'pending' || d.status === 'processing'
    );
    if (!hasUnfinished) return;

    const timer = setInterval(() => {
      loadDocuments(selectedKbId);
    }, 3000);

    return () => clearInterval(timer);
  }, [selectedKbId, activeTab, documents, loadDocuments]);

  // 创建知识库提交
  const handleCreateKnowledgeBase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKbName.trim()) {
      setCreateError('知识库名称不能为空');
      return;
    }

    setCreateSubmitting(true);
    setCreateError(null);

    try {
      const res = await fetchWithAuth('/api/knowledge-bases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newKbName.trim(),
          description: newKbDesc.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || json.message || '创建知识库失败');
      }

      setIsCreateOpen(false);
      setNewKbName('');
      setNewKbDesc('');
      await loadKnowledgeBases();
      if (json.data?.knowledgeBase?.id) {
        setSelectedKbId(json.data.knowledgeBase.id);
      }
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : '创建失败，请重试');
    } finally {
      setCreateSubmitting(false);
    }
  };

  const selectedKb = knowledgeBases.find((kb) => kb.id === selectedKbId);

  return (
    <div className="w-full h-full min-h-0 flex-1 overflow-y-auto custom-scrollbar">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 sm:pb-16 space-y-6">
        {/* 顶部标题栏与新建操作 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center space-x-2.5">
            <BookOpen className="w-6 h-6 text-primary" />
            <span>知识库中心</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            管理专属技术知识库，支持向量与全文双路混合检索及 RRF 融合调试
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadKnowledgeBases}
            className="min-h-[44px] sm:min-h-[36px] rounded-xl text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            <span>刷新</span>
          </Button>

          <Button
            onClick={() => {
              setCreateError(null);
              setIsCreateOpen(true);
            }}
            className="min-h-[44px] sm:min-h-[36px] rounded-xl text-xs font-semibold"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            <span>新建知识库</span>
          </Button>
        </div>
      </div>

      {/* 知识库水平选择条/卡片区 */}
      {knowledgeBases.length > 0 && (
        <div className="flex items-center space-x-3 overflow-x-auto pb-2 scrollbar-none">
          {knowledgeBases.map((kb) => {
            const isSelected = kb.id === selectedKbId;
            return (
              <button
                key={kb.id}
                type="button"
                onClick={() => setSelectedKbId(kb.id)}
                className={`min-h-[44px] flex items-center space-x-2.5 px-4 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all border ${
                  isSelected
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-card text-muted-foreground hover:text-foreground border-border/60 hover:border-border'
                }`}
              >
                <FolderOpen className="w-4 h-4 shrink-0" />
                <span>{kb.name}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                    isSelected
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {kb.documentCount} 篇
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* 空状态：当前用户无任何知识库 */}
      {!loading && knowledgeBases.length === 0 && (
        <Card className="border-dashed border-2 border-border/60 p-12 text-center">
          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <BookOpen className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-foreground">暂无知识库</h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              创建您的首个知识库并上传 Markdown、PDF 或 TXT 技术文档，开启私有知识检索增强
            </p>
            <Button
              onClick={() => setIsCreateOpen(true)}
              className="min-h-[44px] rounded-xl text-xs mt-2"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              <span>新建知识库</span>
            </Button>
          </div>
        </Card>
      )}

      {/* 知识库详情与功能 Tab 区 */}
      {selectedKb && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
          <TabsList className="w-full grid grid-cols-3 min-h-[44px] h-11 p-1 bg-muted/40 border border-border/40 rounded-xl">
            <TabsTrigger
              value="debugger"
              className="min-h-[36px] h-9 rounded-lg text-xs font-semibold px-2 sm:px-4 flex items-center justify-center space-x-1.5"
            >
              <Search className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">检索调试</span>
            </TabsTrigger>
            <TabsTrigger
              value="documents"
              className="min-h-[36px] h-9 rounded-lg text-xs font-semibold px-2 sm:px-4 flex items-center justify-center space-x-1.5"
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">文档管理</span>
            </TabsTrigger>
            <TabsTrigger
              value="faqs"
              className="min-h-[36px] h-9 rounded-lg text-xs font-semibold px-2 sm:px-4 flex items-center justify-center space-x-1.5"
            >
              <HelpCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">问答对 (FAQ)</span>
            </TabsTrigger>
          </TabsList>

          {/* 检索调试 Tab */}
          <TabsContent value="debugger" className="space-y-6 mt-0">
            <RetrievalDebugger knowledgeBaseId={selectedKb.id} />
          </TabsContent>

          {/* 文档管理 Tab */}
          <TabsContent value="documents" className="space-y-4 mt-0">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">知识库文档</h3>
                <p className="text-xs text-muted-foreground">
                  已收录文档及其版本、索引状态与切片统计
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  size="sm"
                  onClick={() => setIsUrlImportOpen(true)}
                  className="min-h-[44px] sm:min-h-[40px] h-10 rounded-xl text-xs gap-1.5 flex items-center font-semibold"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>导入网页</span>
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => loadDocuments(selectedKb.id)}
                  className="min-h-[44px] sm:min-h-[36px] rounded-xl text-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  <span>刷新状态</span>
                </Button>
              </div>
            </div>

            {docsLoading ? (
              <div className="p-8 text-center text-xs text-muted-foreground">加载文档列表中...</div>
            ) : documents.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground border border-dashed rounded-xl">
                当前知识库暂无文档，请点击右上角「导入网页」或通过接口上传
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {documents.map((doc) => (
                  <Card key={doc.id} className="border border-border/50 shadow-none">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-1.5 min-w-0 flex-1">
                          {doc.sourceType === 'url' && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1 py-0 shrink-0 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20"
                            >
                              网页
                            </Badge>
                          )}
                          <span className="font-medium text-xs text-foreground truncate" title={doc.name}>
                            {doc.name}
                          </span>
                        </div>
                        <Badge
                          variant={
                            doc.status === 'ready'
                              ? 'default'
                              : doc.status === 'failed'
                              ? 'destructive'
                              : 'secondary'
                          }
                          className="text-[10px] px-1.5 py-0.5 shrink-0"
                        >
                          {doc.status === 'ready'
                            ? '就绪'
                            : doc.status === 'failed'
                            ? '失败'
                            : '索引中'}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center space-x-3 text-[11px] text-muted-foreground">
                          <span>版本: v{doc.version}</span>
                          <span>切片: {doc.chunkCount} 个</span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setPreviewState({
                              isOpen: true,
                              documentId: doc.id,
                              documentName: doc.name,
                              documentVersion: doc.version,
                              initialStatus: doc.status,
                              initialErrorMessage: doc.errorMessage,
                              sourceUrl: doc.sourceUrl,
                            })
                          }
                          className="min-h-[44px] px-3.5 rounded-xl text-xs text-primary hover:bg-primary/10 gap-1.5 flex items-center"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>预览</span>
                        </Button>
                      </div>

                      {doc.errorMessage && (
                        <p className="text-[11px] text-destructive break-words">
                          {doc.errorMessage}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* 问答对 (FAQ) Tab */}
          <TabsContent value="faqs" className="space-y-4 mt-0">
            <FaqManagementPanel knowledgeBaseId={selectedKb.id} />
          </TabsContent>
        </Tabs>
      )}

      {/* 新建知识库弹窗（触区 >= 44px，对齐 QA-002） */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">新建知识库</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateKnowledgeBase} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                知识库名称 <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="知识库名称"
                value={newKbName}
                onChange={(e) => setNewKbName(e.target.value)}
                className="min-h-[44px] rounded-xl text-sm"
                disabled={createSubmitting}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">知识库描述（可选）</label>
              <Input
                placeholder="简短描述知识库用途..."
                value={newKbDesc}
                onChange={(e) => setNewKbDesc(e.target.value)}
                className="min-h-[44px] rounded-xl text-sm"
                disabled={createSubmitting}
              />
            </div>

            {createError && (
              <p className="text-xs text-destructive bg-destructive/10 p-2.5 rounded-lg">
                {createError}
              </p>
            )}

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateOpen(false)}
                disabled={createSubmitting}
                className="min-h-[44px] rounded-xl text-xs"
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={createSubmitting || !newKbName.trim()}
                className="min-h-[44px] rounded-xl text-xs font-medium"
              >
                {createSubmitting ? '创建中...' : '确认创建'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 导入网页弹窗 (ADR-0028) */}
      {selectedKb && (
        <UrlImportDialog
          open={isUrlImportOpen}
          onOpenChange={setIsUrlImportOpen}
          knowledgeBaseId={selectedKb.id}
          onSuccess={() => {
            loadDocuments(selectedKb.id);
            loadKnowledgeBases();
          }}
        />
      )}

      {/* 文档全文预览抽屉 */}
      <DocumentPreviewDrawer
        open={previewState.isOpen}
        onOpenChange={(open) => setPreviewState((prev) => ({ ...prev, isOpen: open }))}
        knowledgeBaseId={selectedKbId}
        documentId={previewState.documentId}
        documentName={previewState.documentName}
        documentVersion={previewState.documentVersion}
        initialStatus={previewState.initialStatus}
        initialErrorMessage={previewState.initialErrorMessage}
        sourceUrl={previewState.sourceUrl}
      />
      </div>
    </div>
  );
}
