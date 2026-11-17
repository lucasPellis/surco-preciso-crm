CREATE TYPE "ImportCountry" AS ENUM ('AR', 'PY', 'BR');

CREATE TABLE "import_process" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryCode" "ImportCountry",
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_process_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "import_process_name_key" ON "import_process"("name");

CREATE INDEX "import_process_archivedAt_idx" ON "import_process"("archivedAt");

INSERT INTO "import_process" ("id", "name", "updatedAt") VALUES
  ('import_process_standard', 'Importación estándar', CURRENT_TIMESTAMP);

ALTER TABLE "import_stage" ADD COLUMN "processId" TEXT;

ALTER TABLE "purchase_order" ADD COLUMN "processId" TEXT;

UPDATE "import_stage" SET "processId" = 'import_process_standard';

UPDATE "purchase_order" SET "processId" = 'import_process_standard';

ALTER TABLE "import_stage" ALTER COLUMN "processId" SET NOT NULL;

ALTER TABLE "purchase_order" ALTER COLUMN "processId" SET NOT NULL;

DROP INDEX "import_stage_entry_key";

CREATE UNIQUE INDEX "import_stage_entry_key" ON "import_stage"("processId", "isEntry") WHERE ("isEntry" = true AND "archivedAt" IS NULL);

CREATE INDEX "import_stage_processId_position_idx" ON "import_stage"("processId", "position");

CREATE INDEX "purchase_order_processId_idx" ON "purchase_order"("processId");

ALTER TABLE "import_stage" ADD CONSTRAINT "import_stage_processId_fkey" FOREIGN KEY ("processId") REFERENCES "import_process"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_processId_fkey" FOREIGN KEY ("processId") REFERENCES "import_process"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
