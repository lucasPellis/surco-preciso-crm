UPDATE "contact"
SET "phone" = CASE
  WHEN regexp_replace("phone", '\D', '', 'g') = '' THEN NULL
  WHEN "phone" ~ '^\s*\+' THEN '+' || regexp_replace("phone", '\D', '', 'g')
  ELSE regexp_replace("phone", '\D', '', 'g')
END
WHERE "phone" IS NOT NULL;

UPDATE "company"
SET "phone" = CASE
  WHEN regexp_replace("phone", '\D', '', 'g') = '' THEN NULL
  WHEN "phone" ~ '^\s*\+' THEN '+' || regexp_replace("phone", '\D', '', 'g')
  ELSE regexp_replace("phone", '\D', '', 'g')
END
WHERE "phone" IS NOT NULL;

DO $$
DECLARE
  duplicates integer;
BEGIN
  SELECT count(*) INTO duplicates FROM (
    SELECT "phone" FROM "contact"
    WHERE "archivedAt" IS NULL AND "phone" IS NOT NULL
    GROUP BY "phone" HAVING count(*) > 1
  ) AS repeated;
  IF duplicates > 0 THEN
    RAISE EXCEPTION 'contact_phone_active_key: % phone numbers belong to more than one active contact. Merge or clear them, then migrate again.', duplicates;
  END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "contact_phone_active_key" ON "contact"("phone") WHERE ("archivedAt" IS NULL);
