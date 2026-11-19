'use client';

/**
 * 知识库问答对 (FAQ) 管理面板 (FaqManagementPanel)
 *
 * 核心设计契约：
 * 1. 列表浏览与搜索：支持实时搜索标准问题、答案和相似问；支持启用状态快速切换；
 * 2. 增删改操作流：点击新建打开 FaqEditDialog，保存后秒级就绪；支持单条编辑与删除二次确认；
 * 3. 批量 CSV 导入导出：集成 FaqImportModal 与 /api/knowledge-bases/[id]/faqs/export 端点；
 * 4. 移动端热区与无障碍：所有 Switch 开关、按钮热区严格保持 >= 44x44px，窄屏自适应无横向溢出。
 */

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Plus,
  Search,
  Upload,
  Download,
  HelpCircle,
  Edit2,
  Trash2,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { fetchWithAuth } from '@/lib/api/client';
import { FaqEditDialog } from './faq-edit-dialog';
import { FaqImportModal } from './faq-import-modal';
import { type KnowledgeFaqItem } from '@repo/shared';

export interface FaqManagementPanelProps {
  knowledgeBaseId: string;
}

export function FaqManagementPanel({ knowledgeBaseId }: FaqManagementPanelProps) {
  const [faqs, setFaqs] = React.useState<KnowledgeFaqItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [filterEnabled, setFilterEnabled] = React.useState<string>('all'); // 'all' | 'enabled' | 'disabled'

  // 弹窗状态
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [editingFaq, setEditingFaq] = React.useState<KnowledgeFaqItem | null>(null);
  const [isImportOpen, setIsImportOpen] = React.useState(false);

  // 1. 获取 FAQ 列表
  const loadFaqs = React.useCallback(async () => {
    if (!knowledgeBaseId) return;
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (filterEnabled === 'enabled') params.set('enabled', 'true');
      if (filterEnabled === 'disabled') params.set('enabled', 'false');

      const res = await fetchWithAuth(
        `/api/knowledge-bases/${knowledgeBaseId}/faqs?${params.toString()}`
      );
      const json = await res.json();
      if (json.success && json.data?.faqs) {
        setFaqs(json.data.faqs);
      }
    } catch (err) {
      console.error('[faq-panel] 加载问答对失败:', err);
    } finally {
      setLoading(false);
    }
  }, [knowledgeBaseId, search, filterEnabled]);

  React.useEffect(() => {
    loadFaqs();
  }, [loadFaqs]);

  // 2. 状态切换
  const handleToggle = async (faq: KnowledgeFaqItem) => {
    const nextStatus = !faq.enabled;
    // 乐观更新
    setFaqs((prev) =>
      prev.map((f) => (f.id === faq.id ? { ...f, enabled: nextStatus } : f))
    );

    try {
      const res = await fetchWithAuth(
        `/api/knowledge-bases/${knowledgeBaseId}/faqs/${faq.id}/toggle`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: nextStatus }),
        }
      );
      const json = await res.json();
      if (!json.success) {
        // 回滚
        setFaqs((prev) =>
          prev.map((f) => (f.id === faq.id ? { ...f, enabled: faq.enabled } : f))
        );
      }
    } catch {
      setFaqs((prev) =>
        prev.map((f) => (f.id === faq.id ? { ...f, enabled: faq.enabled } : f))
      );
    }
  };

  // 3. 删除
  const handleDelete = async (faqId: string) => {
    if (!window.confirm('确定要删除这条问答对吗？删除后将无法恢复。')) return;

    try {
      const res = await fetchWithAuth(
        `/api/knowledge-bases/${knowledgeBaseId}/faqs/${faqId}`,
        {
          method: 'DELETE',
        }
      );
      const json = await res.json();
      if (json.success) {
        setFaqs((prev) => prev.filter((f) => f.id !== faqId));
      }
    } catch (err) {
      console.error('[faq-panel] 删除失败:', err);
    }
  };

  // 4. 保存（新建/修改）
  const handleSaveFaq = async (data: {
    question: string;
    answer: string;
    similarQuestions: string[];
  }) => {
    if (editingFaq) {
      // 更新
      const res = await fetchWithAuth(
        `/api/knowledge-bases/${knowledgeBaseId}/faqs/${editingFaq.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      );
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || '更新失败');
      }
      setFaqs((prev) =>
        prev.map((f) => (f.id === editingFaq.id ? json.data.faq : f))
      );
    } else {
      // 创建
      const res = await fetchWithAuth(
        `/api/knowledge-bases/${knowledgeBaseId}/faqs`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      );
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || '创建失败');
      }
      setFaqs((prev) => [json.data.faq, ...prev]);
    }
  };

  // 5. CSV 批量导入
  const handleImportCsv = async (csvText: string) => {
    const res = await fetchWithAuth(
      `/api/knowledge-bases/${knowledgeBaseId}/faqs/import`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText }),
      }
    );
    const json = await res.json();
    if (!json.success) {
      throw new Error(json.error || '导入失败');
    }
    await loadFaqs();
    return json.data;
  };

  // 6. CSV 导出
  const handleExportCsv = () => {
    window.open(`/api/knowledge-bases/${knowledgeBaseId}/faqs/export`, '_blank');
  };

  return (
    <div className="space-y-4">
      {/* 顶部操作工具栏 */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* 搜索框与状态筛选 */}
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索标准问题、答案或相似问..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-11"
            />
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={loadFaqs}
            disabled={loading}
            title="刷新问答对列表"
            className="min-h-[44px] min-w-[44px] shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* 动作按钮组 */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setIsImportOpen(true)}
            className="min-h-[44px] min-w-[44px] px-3.5 flex-1 sm:flex-none"
          >
            <Upload className="w-4 h-4 mr-1.5" />
            导入 CSV
          </Button>

          <Button
            variant="outline"
            onClick={handleExportCsv}
            disabled={faqs.length === 0}
            className="min-h-[44px] min-w-[44px] px-3.5 flex-1 sm:flex-none"
          >
            <Download className="w-4 h-4 mr-1.5" />
            导出 CSV
          </Button>

          <Button
            onClick={() => {
              setEditingFaq(null);
              setIsEditOpen(true);
            }}
            className="min-h-[44px] min-w-[44px] px-4 flex-1 sm:flex-none"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            新建问答
          </Button>
        </div>
      </div>

      {/* 问答列表容器 */}
      {loading ? (
        <div className="py-16 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p className="text-sm">正在加载问答对...</p>
        </div>
      ) : faqs.length === 0 ? (
        <Card className="border-dashed bg-muted/10">
          <CardContent className="py-14 text-center space-y-3">
            <div className="p-3 bg-muted/60 rounded-full w-12 h-12 mx-auto flex items-center justify-center text-muted-foreground">
              <HelpCircle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-medium text-base">暂无问答对 (FAQ)</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                FAQ 问答对作为知识库精度压舱石，支持极高置信度秒级短路与官方口径强约束。
              </p>
            </div>
            <div className="pt-2 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsImportOpen(true)}
                className="min-h-[44px] min-w-[44px]"
              >
                <Upload className="w-4 h-4 mr-1.5" />
                批量导入
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setEditingFaq(null);
                  setIsEditOpen(true);
                }}
                className="min-h-[44px] min-w-[44px]"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                立即新建
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground flex items-center justify-between px-1">
            <span>共收录 {faqs.length} 条标准问答</span>
            <span className="text-muted-foreground/80">修改或启用后即时生效</span>
          </div>

          <div className="grid gap-3">
            {faqs.map((faq) => (
              <Card
                key={faq.id}
                className={`transition-colors border ${
                  faq.enabled ? 'bg-card' : 'bg-muted/20 opacity-80'
                }`}
              >
                <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  {/* 左侧内容区 */}
                  <div className="space-y-2 flex-1 min-w-0 w-full">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold text-sm sm:text-base text-foreground break-all">
                        {faq.question}
                      </h4>
                      <Badge
                        variant={faq.enabled ? 'default' : 'secondary'}
                        className="text-[10px] py-0 px-1.5"
                      >
                        {faq.enabled ? '已启用' : '已停用'}
                      </Badge>
                      {faq.hitCount > 0 && (
                        <span className="text-[11px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                          命中 {faq.hitCount} 次
                        </span>
                      )}
                    </div>

                    {/* 答案预览 */}
                    <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 break-all">
                      {faq.answer}
                    </p>

                    {/* 相似问徽标 */}
                    {faq.similarQuestions && faq.similarQuestions.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[11px] text-muted-foreground">相似问：</span>
                        {faq.similarQuestions.map((sim, idx) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className="text-[11px] font-normal py-0 px-1.5 bg-muted/40"
                          >
                            {sim}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 右侧操作区 */}
                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-center border-t sm:border-t-0 pt-2 sm:pt-0 w-full sm:w-auto justify-between sm:justify-end">
                    {/* 启停 Switch 开关（符合 >=44px 交互边界） */}
                    <div className="flex items-center gap-2 min-h-[44px] min-w-[44px] px-1">
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        {faq.enabled ? '启用' : '停用'}
                      </span>
                      <Switch
                        checked={faq.enabled}
                        onCheckedChange={() => handleToggle(faq)}
                        aria-label={`切换问答“${faq.question}”的启用状态`}
                      />
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingFaq(faq);
                          setIsEditOpen(true);
                        }}
                        title="编辑问答对"
                        className="min-h-[44px] min-w-[44px] text-muted-foreground hover:text-foreground"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(faq.id)}
                        title="删除问答对"
                        className="min-h-[44px] min-w-[44px] text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 新建/编辑弹窗 */}
      <FaqEditDialog
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        faq={editingFaq}
        onSave={handleSaveFaq}
      />

      {/* 批量 CSV 导入模态框 */}
      <FaqImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImport={handleImportCsv}
      />
    </div>
  );
}
