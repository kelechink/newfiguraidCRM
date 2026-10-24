-- DropIndex
DROP INDEX "FxRate_currency_asOf_idx";

-- AlterTable
ALTER TABLE "FxRate" ADD COLUMN     "market" TEXT NOT NULL DEFAULT 'parallel',
ADD COLUMN     "sources" JSONB;

-- CreateIndex
CREATE INDEX "FxRate_currency_market_asOf_idx" ON "FxRate"("currency", "market", "asOf");

