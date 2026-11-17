ALTER TABLE "deal" ADD COLUMN "leadSourceId" TEXT;

ALTER TABLE "deal" ADD CONSTRAINT "deal_leadSourceId_fkey" FOREIGN KEY ("leadSourceId") REFERENCES "lead_source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "deal_leadSourceId_idx" ON "deal"("leadSourceId");
