UPDATE "deal" AS d
SET "firstContactedAt" = first_change.at
FROM (
  SELECT a."dealId" AS deal_id, MIN(COALESCE(a."occurredAt", a."createdAt")) AS at
  FROM "activity" AS a
  JOIN "pipeline_stage" AS source ON source."key" = a."meta"->>'from' AND source."isEntry"
  JOIN "pipeline_stage" AS target ON target."key" = a."meta"->>'to' AND target."kind" IN ('OPEN', 'PAUSED')
  WHERE a."type" = 'STAGE_CHANGE' AND a."dealId" IS NOT NULL
  GROUP BY a."dealId"
) AS first_change
WHERE d."id" = first_change.deal_id AND d."firstContactedAt" IS NULL;
