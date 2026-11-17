ALTER TABLE "appSetting" ADD COLUMN "defaultLeadOwnerId" TEXT;

ALTER TABLE "appSetting" ADD CONSTRAINT "appSetting_defaultLeadOwnerId_fkey" FOREIGN KEY ("defaultLeadOwnerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
