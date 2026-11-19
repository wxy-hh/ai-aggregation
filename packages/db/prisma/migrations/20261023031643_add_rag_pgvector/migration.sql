-- 启用 pgvector 向量扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "memory_search_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "knowledge_bases" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "knowledge_base_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "version" INTEGER NOT NULL DEFAULT 1,
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_chunks" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "knowledge_base_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "document_version" INTEGER NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "content_segmented" TEXT NOT NULL,
    "heading_path" TEXT,
    "page_number" INTEGER,
    "token_count" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content_tsv" tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce("content_segmented", ''))) STORED,
    "embedding" vector(1024),

    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_memory_chunks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "message_id" TEXT,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "content_segmented" TEXT NOT NULL,
    "token_count" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content_tsv" tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce("content_segmented", ''))) STORED,
    "embedding" vector(1024),

    CONSTRAINT "conversation_memory_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rag_eval_cases" (
    "id" TEXT NOT NULL,
    "knowledge_base_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "reference_answer" TEXT NOT NULL,
    "golden_anchors" JSONB NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'answerable',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rag_eval_cases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_bases_user_id_idx" ON "knowledge_bases"("user_id");

-- CreateIndex
CREATE INDEX "documents_knowledge_base_id_idx" ON "documents"("knowledge_base_id");

-- CreateIndex
CREATE INDEX "documents_user_id_idx" ON "documents"("user_id");

-- CreateIndex
CREATE INDEX "documents_status_idx" ON "documents"("status");

-- CreateIndex
CREATE INDEX "document_chunks_knowledge_base_id_user_id_idx" ON "document_chunks"("knowledge_base_id", "user_id");

-- CreateIndex
CREATE INDEX "document_chunks_document_id_idx" ON "document_chunks"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_chunks_document_id_document_version_chunk_index_key" ON "document_chunks"("document_id", "document_version", "chunk_index");

-- CreateIndex for lexical search (GIN)
CREATE INDEX "document_chunks_content_tsv_idx" ON "document_chunks" USING gin ("content_tsv");

-- CreateIndex for dense vector search (HNSW cosine)
CREATE INDEX "document_chunks_embedding_hnsw_idx" ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops);

-- CreateIndex
CREATE INDEX "conversation_memory_chunks_user_id_idx" ON "conversation_memory_chunks"("user_id");

-- CreateIndex
CREATE INDEX "conversation_memory_chunks_session_id_idx" ON "conversation_memory_chunks"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_memory_chunks_session_id_chunk_index_key" ON "conversation_memory_chunks"("session_id", "chunk_index");

-- CreateIndex for lexical search (GIN)
CREATE INDEX "conversation_memory_chunks_content_tsv_idx" ON "conversation_memory_chunks" USING gin ("content_tsv");

-- CreateIndex for dense vector search (HNSW cosine)
CREATE INDEX "conversation_memory_chunks_embedding_hnsw_idx" ON "conversation_memory_chunks" USING hnsw ("embedding" vector_cosine_ops);

-- CreateIndex
CREATE INDEX "rag_eval_cases_knowledge_base_id_idx" ON "rag_eval_cases"("knowledge_base_id");

-- CreateIndex
CREATE INDEX "rag_eval_cases_category_idx" ON "rag_eval_cases"("category");

-- AddForeignKey
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_memory_chunks" ADD CONSTRAINT "conversation_memory_chunks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_memory_chunks" ADD CONSTRAINT "conversation_memory_chunks_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_eval_cases" ADD CONSTRAINT "rag_eval_cases_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
