-- AlterTable: 增加 Document 表的 tags 数组与 metadata JSON 字段
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb;

-- CreateIndex: 为 document_chunks 表的 metadata 建立 GIN jsonb_path_ops 索引加速前置布尔过滤
CREATE INDEX IF NOT EXISTS "document_chunks_metadata_gin_idx" ON "document_chunks" USING gin ("metadata" jsonb_path_ops);
