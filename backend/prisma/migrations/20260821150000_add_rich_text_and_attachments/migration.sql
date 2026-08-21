ALTER TABLE "public"."EmailBatch" ADD COLUMN "bodyHtml" TEXT;

CREATE TABLE "public"."EmailAttachment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "batchId" TEXT,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailAttachment_userId_batchId_idx" ON "public"."EmailAttachment"("userId", "batchId");

ALTER TABLE "public"."EmailAttachment" ADD CONSTRAINT "EmailAttachment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."EmailAttachment" ADD CONSTRAINT "EmailAttachment_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "public"."EmailBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
