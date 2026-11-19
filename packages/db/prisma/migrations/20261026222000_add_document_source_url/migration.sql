-- AlterTable
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "source_type" TEXT NOT NULL DEFAULT 'file';
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "source_url" TEXT;
