-- AlterTable
ALTER TABLE "contact" ADD COLUMN     "leadSourceId" TEXT,
ADD COLUMN     "originDetail" TEXT;

-- CreateTable
CREATE TABLE "lead_source" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_source_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lead_source_key_key" ON "lead_source"("key");

-- CreateIndex
CREATE INDEX "lead_source_archivedAt_idx" ON "lead_source"("archivedAt");

-- CreateIndex
CREATE INDEX "contact_leadSourceId_idx" ON "contact"("leadSourceId");

-- AddForeignKey
ALTER TABLE "contact" ADD CONSTRAINT "contact_leadSourceId_fkey" FOREIGN KEY ("leadSourceId") REFERENCES "lead_source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "lead_source" ("id", "key", "name", "icon", "position", "updatedAt") VALUES
  ('lead_source_web', 'web', 'Web', 'web', 0, CURRENT_TIMESTAMP),
  ('lead_source_seo', 'seo', 'SEO', 'search', 1, CURRENT_TIMESTAMP),
  ('lead_source_google_ads', 'google-ads', 'Google Ads', 'google', 2, CURRENT_TIMESTAMP),
  ('lead_source_whatsapp', 'whatsapp', 'WhatsApp directo', 'whatsapp', 3, CURRENT_TIMESTAMP),
  ('lead_source_facebook', 'facebook-campaign', 'Campaña de Facebook', 'facebook', 4, CURRENT_TIMESTAMP),
  ('lead_source_instagram', 'instagram-campaign', 'Campaña de Instagram', 'instagram', 5, CURRENT_TIMESTAMP),
  ('lead_source_referral', 'referral', 'Referido', 'referral', 6, CURRENT_TIMESTAMP),
  ('lead_source_distributor', 'distributor', 'Distribuidor', 'distributor', 7, CURRENT_TIMESTAMP),
  ('lead_source_event', 'event', 'Feria o evento', 'event', 8, CURRENT_TIMESTAMP),
  ('lead_source_phone', 'phone', 'Llamada entrante', 'phone', 9, CURRENT_TIMESTAMP);
