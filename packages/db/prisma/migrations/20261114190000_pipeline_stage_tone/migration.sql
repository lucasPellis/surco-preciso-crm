-- CreateEnum
CREATE TYPE "PipelineStageTone" AS ENUM ('NEUTRAL', 'INFO', 'WARNING', 'SUCCESS', 'ERROR');

-- AlterTable
ALTER TABLE "pipeline_stage" ADD COLUMN "tone" "PipelineStageTone" NOT NULL DEFAULT 'NEUTRAL';

UPDATE "pipeline_stage" SET "tone" = 'INFO' WHERE "key" IN ('QUALIFIED', 'QUOTED');
UPDATE "pipeline_stage" SET "tone" = 'WARNING' WHERE "key" = 'NEGOTIATING';
UPDATE "pipeline_stage" SET "tone" = 'SUCCESS' WHERE "key" = 'WON';
UPDATE "pipeline_stage" SET "tone" = 'ERROR' WHERE "key" = 'LOST';

UPDATE "pipeline_stage" SET "position" = 1000 WHERE "key" = 'WON';
UPDATE "pipeline_stage" SET "position" = 1001 WHERE "key" = 'LOST';
