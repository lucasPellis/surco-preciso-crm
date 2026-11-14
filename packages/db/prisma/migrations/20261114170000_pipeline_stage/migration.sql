-- CreateEnum
CREATE TYPE "PipelineStageKind" AS ENUM ('OPEN', 'WON', 'LOST', 'PAUSED');

-- CreateTable
CREATE TABLE "pipeline_stage" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PipelineStageKind" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isEntry" BOOLEAN NOT NULL DEFAULT false,
    "idleAfterHours" INTEGER,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_stage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_stage_key_key" ON "pipeline_stage"("key");

-- CreateIndex
CREATE INDEX "pipeline_stage_archivedAt_idx" ON "pipeline_stage"("archivedAt");

CREATE UNIQUE INDEX "pipeline_stage_entry_key" ON "pipeline_stage"("isEntry") WHERE ("isEntry" = true AND "archivedAt" IS NULL);

INSERT INTO "pipeline_stage" ("id", "key", "name", "kind", "position", "isEntry", "idleAfterHours", "updatedAt") VALUES
  ('pipeline_stage_new', 'NEW', 'Nuevo', 'OPEN', 0, true, 24, CURRENT_TIMESTAMP),
  ('pipeline_stage_contacted', 'CONTACTED', 'Contactado', 'OPEN', 1, false, 72, CURRENT_TIMESTAMP),
  ('pipeline_stage_qualified', 'QUALIFIED', 'Calificado', 'OPEN', 2, false, 72, CURRENT_TIMESTAMP),
  ('pipeline_stage_quoted', 'QUOTED', 'Cotizado', 'OPEN', 3, false, 72, CURRENT_TIMESTAMP),
  ('pipeline_stage_negotiating', 'NEGOTIATING', 'Negociando', 'OPEN', 4, false, 72, CURRENT_TIMESTAMP),
  ('pipeline_stage_no_response', 'NO_RESPONSE', 'Sin respuesta', 'PAUSED', 5, false, NULL, CURRENT_TIMESTAMP),
  ('pipeline_stage_won', 'WON', 'Ganado', 'WON', 6, false, NULL, CURRENT_TIMESTAMP),
  ('pipeline_stage_lost', 'LOST', 'Perdido', 'LOST', 7, false, NULL, CURRENT_TIMESTAMP);

-- AlterTable
ALTER TABLE "deal" ALTER COLUMN "stage" DROP DEFAULT;

ALTER TABLE "deal" ALTER COLUMN "stage" TYPE TEXT USING "stage"::text;

ALTER TABLE "deal" ALTER COLUMN "stage" SET DEFAULT 'NEW';

ALTER TABLE "deal" ADD COLUMN "firstContactedAt" TIMESTAMP(3);

-- DropEnum
DROP TYPE "DealStage";

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_stage_fkey" FOREIGN KEY ("stage") REFERENCES "pipeline_stage"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
