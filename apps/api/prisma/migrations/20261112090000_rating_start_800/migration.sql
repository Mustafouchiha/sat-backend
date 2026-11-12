-- Reyting boshlanishi: jami 800 (Math 400 + R&W 400); har bir bo'lim 200–800

-- AlterTable
ALTER TABLE "ratings" ALTER COLUMN "rating" SET DEFAULT 800,
ALTER COLUMN "peak" SET DEFAULT 800;

-- Hali birorta savol yechmagan akkauntlar ham yangi boshlanishdan boshlaydi (yechganlarniki o'zgarmaydi)
UPDATE "ratings" SET "rating" = 800, "peak" = 800 WHERE "games" = 0;

-- Admin sozlamalarida eski standart boshlanish saqlangan bo'lsa — yangisiga
UPDATE "settings"
SET "value" = jsonb_set("value", '{initial}', '800'::jsonb), "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'rating' AND ("value"->>'initial') IN ('1000', '1200');
