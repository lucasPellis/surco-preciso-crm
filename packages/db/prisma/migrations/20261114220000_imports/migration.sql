-- CreateEnum
CREATE TYPE "ImportStageKind" AS ENUM ('IN_PROGRESS', 'RECEIVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "import_stage" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ImportStageKind" NOT NULL,
    "tone" "PipelineStageTone" NOT NULL DEFAULT 'NEUTRAL',
    "position" INTEGER NOT NULL DEFAULT 0,
    "isEntry" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "orderedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_line" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostUsd" DECIMAL(14,2) NOT NULL,
    "dealId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_line_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_order_line_quantity_positive" CHECK ("quantity" > 0)
);

-- CreateTable
CREATE TABLE "shipment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "reference" TEXT,
    "trackingNumber" TEXT,
    "stageKey" TEXT NOT NULL,
    "stageChangedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_line" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipment_line_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shipment_line_quantity_positive" CHECK ("quantity" > 0)
);

-- CreateTable
CREATE TABLE "shipment_stage_event" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "stageKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_stage_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "import_stage_key_key" ON "import_stage"("key");

-- CreateIndex
CREATE INDEX "import_stage_archivedAt_idx" ON "import_stage"("archivedAt");

CREATE UNIQUE INDEX "import_stage_entry_key" ON "import_stage"("isEntry") WHERE ("isEntry" = true AND "archivedAt" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_number_key" ON "purchase_order"("number");

-- CreateIndex
CREATE INDEX "purchase_order_archivedAt_idx" ON "purchase_order"("archivedAt");

-- CreateIndex
CREATE INDEX "purchase_order_line_orderId_idx" ON "purchase_order_line"("orderId");

-- CreateIndex
CREATE INDEX "purchase_order_line_productId_idx" ON "purchase_order_line"("productId");

-- CreateIndex
CREATE INDEX "purchase_order_line_dealId_idx" ON "purchase_order_line"("dealId");

-- CreateIndex
CREATE INDEX "shipment_orderId_idx" ON "shipment"("orderId");

-- CreateIndex
CREATE INDEX "shipment_stageKey_idx" ON "shipment"("stageKey");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_line_shipmentId_orderLineId_key" ON "shipment_line"("shipmentId", "orderLineId");

-- CreateIndex
CREATE INDEX "shipment_line_orderLineId_idx" ON "shipment_line"("orderLineId");

-- CreateIndex
CREATE INDEX "shipment_stage_event_shipmentId_occurredAt_idx" ON "shipment_stage_event"("shipmentId", "occurredAt");

-- CreateIndex
CREATE INDEX "shipment_stage_event_stageKey_idx" ON "shipment_stage_event"("stageKey");

-- AddForeignKey
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_stageKey_fkey" FOREIGN KEY ("stageKey") REFERENCES "import_stage"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_line" ADD CONSTRAINT "shipment_line_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_line" ADD CONSTRAINT "shipment_line_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "purchase_order_line"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_stage_event" ADD CONSTRAINT "shipment_stage_event_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_stage_event" ADD CONSTRAINT "shipment_stage_event_stageKey_fkey" FOREIGN KEY ("stageKey") REFERENCES "import_stage"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_stage_event" ADD CONSTRAINT "shipment_stage_event_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "import_stage" ("id", "key", "name", "kind", "tone", "position", "isEntry", "updatedAt") VALUES
  ('import_stage_ordered', 'ORDERED', 'Pedido', 'IN_PROGRESS', 'NEUTRAL', 0, true, CURRENT_TIMESTAMP),
  ('import_stage_shipped', 'SHIPPED', 'Embarcado', 'IN_PROGRESS', 'INFO', 1, false, CURRENT_TIMESTAMP),
  ('import_stage_tracking', 'TRACKING', 'Guía', 'IN_PROGRESS', 'INFO', 2, false, CURRENT_TIMESTAMP),
  ('import_stage_customs', 'CUSTOMS', 'Aduana', 'IN_PROGRESS', 'WARNING', 3, false, CURRENT_TIMESTAMP),
  ('import_stage_received', 'RECEIVED', 'Recibido', 'RECEIVED', 'SUCCESS', 1000, false, CURRENT_TIMESTAMP),
  ('import_stage_cancelled', 'CANCELLED', 'Cancelado', 'CANCELLED', 'ERROR', 1001, false, CURRENT_TIMESTAMP);
