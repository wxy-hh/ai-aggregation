-- 补齐此前未进入迁移历史的反馈表，保证从空数据库重放后与 Prisma Schema 一致。
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FeedbackType') THEN
    CREATE TYPE "FeedbackType" AS ENUM ('BUG', 'FEATURE', 'UI', 'PERFORMANCE', 'OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FeedbackStatus') THEN
    CREATE TYPE "FeedbackStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DECLINED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FeedbackPriority') THEN
    CREATE TYPE "FeedbackPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "feedbacks" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "FeedbackType" NOT NULL,
  "status" "FeedbackStatus" NOT NULL DEFAULT 'PENDING',
  "priority" "FeedbackPriority" NOT NULL DEFAULT 'MEDIUM',
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "isPinned" BOOLEAN NOT NULL DEFAULT false,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "replyCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "feedback_replies" (
  "id" TEXT NOT NULL,
  "feedbackId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "isInternal" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "feedback_replies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "feedback_attachments" (
  "id" TEXT NOT NULL,
  "feedbackId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "fileType" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "feedback_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "feedback_tags" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#5D7CFA',
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "feedback_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "feedback_tags_name_key" ON "feedback_tags"("name");
CREATE INDEX IF NOT EXISTS "feedbacks_userId_idx" ON "feedbacks"("userId");
CREATE INDEX IF NOT EXISTS "feedbacks_status_idx" ON "feedbacks"("status");
CREATE INDEX IF NOT EXISTS "feedbacks_priority_idx" ON "feedbacks"("priority");
CREATE INDEX IF NOT EXISTS "feedbacks_type_idx" ON "feedbacks"("type");
CREATE INDEX IF NOT EXISTS "feedbacks_isPinned_idx" ON "feedbacks"("isPinned");
CREATE INDEX IF NOT EXISTS "feedbacks_createdAt_idx" ON "feedbacks"("createdAt");
CREATE INDEX IF NOT EXISTS "feedback_replies_feedbackId_idx" ON "feedback_replies"("feedbackId");
CREATE INDEX IF NOT EXISTS "feedback_replies_userId_idx" ON "feedback_replies"("userId");
CREATE INDEX IF NOT EXISTS "feedback_replies_createdAt_idx" ON "feedback_replies"("createdAt");
CREATE INDEX IF NOT EXISTS "feedback_attachments_feedbackId_idx" ON "feedback_attachments"("feedbackId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedbacks_userId_fkey') THEN
    ALTER TABLE "feedbacks"
      ADD CONSTRAINT "feedbacks_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_replies_feedbackId_fkey') THEN
    ALTER TABLE "feedback_replies"
      ADD CONSTRAINT "feedback_replies_feedbackId_fkey"
      FOREIGN KEY ("feedbackId") REFERENCES "feedbacks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_replies_userId_fkey') THEN
    ALTER TABLE "feedback_replies"
      ADD CONSTRAINT "feedback_replies_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_attachments_feedbackId_fkey') THEN
    ALTER TABLE "feedback_attachments"
      ADD CONSTRAINT "feedback_attachments_feedbackId_fkey"
      FOREIGN KEY ("feedbackId") REFERENCES "feedbacks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
