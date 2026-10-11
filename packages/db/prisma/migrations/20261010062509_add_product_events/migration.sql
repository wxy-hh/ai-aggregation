-- CreateTable
CREATE TABLE "product_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "props" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_events_userId_idx" ON "product_events"("userId");

-- CreateIndex
CREATE INDEX "product_events_event_createdAt_idx" ON "product_events"("event", "createdAt");

-- AddForeignKey
ALTER TABLE "product_events" ADD CONSTRAINT "product_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
