CREATE TYPE "DocumentDirection" AS ENUM ('IN', 'OUT');

CREATE TABLE "document_label" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "direction" "DocumentDirection" NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_label_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "import_stage_document" (
    "stageKey" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "import_stage_document_pkey" PRIMARY KEY ("stageKey","labelId")
);

CREATE TABLE "attachment" (
    "id" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "labelId" TEXT,
    "uploadedById" TEXT,
    "shipmentStageEventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_label_name_key" ON "document_label"("name");

CREATE INDEX "document_label_archivedAt_idx" ON "document_label"("archivedAt");

CREATE INDEX "import_stage_document_labelId_idx" ON "import_stage_document"("labelId");

CREATE UNIQUE INDEX "attachment_pathname_key" ON "attachment"("pathname");

CREATE INDEX "attachment_shipmentStageEventId_idx" ON "attachment"("shipmentStageEventId");

CREATE INDEX "attachment_labelId_idx" ON "attachment"("labelId");

ALTER TABLE "import_stage_document" ADD CONSTRAINT "import_stage_document_stageKey_fkey" FOREIGN KEY ("stageKey") REFERENCES "import_stage"("key") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "import_stage_document" ADD CONSTRAINT "import_stage_document_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "document_label"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attachment" ADD CONSTRAINT "attachment_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "document_label"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attachment" ADD CONSTRAINT "attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "attachment" ADD CONSTRAINT "attachment_shipmentStageEventId_fkey" FOREIGN KEY ("shipmentStageEventId") REFERENCES "shipment_stage_event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
