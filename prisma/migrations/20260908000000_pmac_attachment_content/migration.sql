-- Additive migration: preserves all attachment metadata and legacy files.
CREATE TABLE "PmacAttachmentContent" (
    "attachmentId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    CONSTRAINT "PmacAttachmentContent_pkey" PRIMARY KEY ("attachmentId")
);
ALTER TABLE "PmacAttachmentContent" ADD CONSTRAINT "PmacAttachmentContent_attachmentId_fkey"
    FOREIGN KEY ("attachmentId") REFERENCES "PmacAttachment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
