-- AlterTable
ALTER TABLE "pipeline_stage" ADD COLUMN "autoLoseAfterDays" INTEGER;

UPDATE "pipeline_stage" SET "autoLoseAfterDays" = 7 WHERE "key" = 'NO_RESPONSE' AND "kind" = 'PAUSED';
