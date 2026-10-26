-- CreateTable
CREATE TABLE "knowledge_faqs" (
    "id" TEXT NOT NULL,
    "knowledge_base_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "hit_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_faqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_faq_questions" (
    "id" TEXT NOT NULL,
    "faq_id" TEXT NOT NULL,
    "knowledge_base_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "question_text" TEXT NOT NULL,
    "question_segmented" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "question_tsv" tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce("question_segmented", ''))) STORED,
    "embedding" vector(1024),

    CONSTRAINT "knowledge_faq_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_faqs_knowledge_base_id_user_id_idx" ON "knowledge_faqs"("knowledge_base_id", "user_id");

-- CreateIndex
CREATE INDEX "knowledge_faqs_user_id_enabled_idx" ON "knowledge_faqs"("user_id", "enabled");

-- CreateIndex
CREATE INDEX "knowledge_faq_questions_faq_id_idx" ON "knowledge_faq_questions"("faq_id");

-- CreateIndex
CREATE INDEX "knowledge_faq_questions_knowledge_base_id_user_id_idx" ON "knowledge_faq_questions"("knowledge_base_id", "user_id");

-- CreateIndex for lexical search (GIN)
CREATE INDEX "knowledge_faq_questions_question_tsv_idx" ON "knowledge_faq_questions" USING gin ("question_tsv");

-- CreateIndex for dense vector search (HNSW cosine)
CREATE INDEX "knowledge_faq_questions_embedding_hnsw_idx" ON "knowledge_faq_questions" USING hnsw ("embedding" vector_cosine_ops);

-- AddForeignKey
ALTER TABLE "knowledge_faqs" ADD CONSTRAINT "knowledge_faqs_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_faqs" ADD CONSTRAINT "knowledge_faqs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_faq_questions" ADD CONSTRAINT "knowledge_faq_questions_faq_id_fkey" FOREIGN KEY ("faq_id") REFERENCES "knowledge_faqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_faq_questions" ADD CONSTRAINT "knowledge_faq_questions_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_faq_questions" ADD CONSTRAINT "knowledge_faq_questions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
