ALTER TYPE "DealStage" RENAME TO "DealStage_old";

CREATE TYPE "DealStage" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'QUOTED', 'NEGOTIATING', 'WON', 'LOST');

ALTER TABLE "deal" ALTER COLUMN "stage" DROP DEFAULT;

ALTER TABLE "deal" ALTER COLUMN "stage" TYPE "DealStage" USING (
  CASE "stage"::text
    WHEN 'DEMO_BOOKED' THEN 'NEW'
    WHEN 'QUALIFIED_TO_BUY' THEN 'QUALIFIED'
    WHEN 'DECISION_MAKER_BOUGHT_IN' THEN 'NEGOTIATING'
    WHEN 'CONTRACT_SENT' THEN 'QUOTED'
    WHEN 'CLOSED_WON' THEN 'WON'
    WHEN 'CLOSED_LOST' THEN 'LOST'
    WHEN 'UNQUALIFIED_TO_BUY' THEN 'LOST'
  END
)::"DealStage";

ALTER TABLE "deal" ALTER COLUMN "stage" SET DEFAULT 'NEW';

DROP TYPE "DealStage_old";

CREATE FUNCTION pg_temp.rename_stages(value jsonb) RETURNS jsonb AS $$
  SELECT replace(
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(value::text, '"DEMO_BOOKED"', '"NEW"'),
              '"QUALIFIED_TO_BUY"', '"QUALIFIED"'),
            '"DECISION_MAKER_BOUGHT_IN"', '"NEGOTIATING"'),
          '"CONTRACT_SENT"', '"QUOTED"'),
        '"CLOSED_WON"', '"WON"'),
      '"CLOSED_LOST"', '"LOST"'),
    '"UNQUALIFIED_TO_BUY"', '"LOST"')::jsonb
$$ LANGUAGE sql IMMUTABLE;

UPDATE "activity" SET "meta" = pg_temp.rename_stages("meta") WHERE "meta" IS NOT NULL;
UPDATE "savedView" SET "filters" = pg_temp.rename_stages("filters");
UPDATE "agentTask" SET "payload" = pg_temp.rename_stages("payload") WHERE "payload" IS NOT NULL;
UPDATE "agentEvent" SET "data" = pg_temp.rename_stages("data");
UPDATE "agentRunEvent" SET "data" = pg_temp.rename_stages("data");
UPDATE "agentAuditEvent" SET "before" = pg_temp.rename_stages("before") WHERE "before" IS NOT NULL;
UPDATE "agentAuditEvent" SET "after" = pg_temp.rename_stages("after") WHERE "after" IS NOT NULL;
UPDATE "agentVersion" SET "manifest" = pg_temp.rename_stages("manifest");
