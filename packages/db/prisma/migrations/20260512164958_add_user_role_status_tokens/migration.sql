-- AlterTable: add role, status, tokens fields to users table
ALTER TABLE "users" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user';
ALTER TABLE "users" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "users" ADD COLUMN "tokens" INTEGER NOT NULL DEFAULT 20000;
