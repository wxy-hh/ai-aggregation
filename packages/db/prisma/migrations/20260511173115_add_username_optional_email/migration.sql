-- AlterTable: add username, make email optional
ALTER TABLE "users" ADD COLUMN "username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- AlterTable: drop email uniqueness, make it optional
DROP INDEX IF EXISTS "users_email_key";
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
