-- AlterEnum
ALTER TYPE "DeductionType" ADD VALUE 'EARLY_DEPARTURE';

-- AlterTable
ALTER TABLE "AttendanceDay" ADD COLUMN     "minutesEarly" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "missingClockOut" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "LatenessPolicy" ADD COLUMN     "earlyLeaveAmount" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "StaffProfile" ALTER COLUMN "graceMinutes" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "FxRate" (
    "id" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "rateToNgn" DECIMAL(18,6) NOT NULL,
    "source" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "setById" TEXT,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FxRate_currency_asOf_idx" ON "FxRate"("currency", "asOf");

-- AddForeignKey
ALTER TABLE "FxRate" ADD CONSTRAINT "FxRate_setById_fkey" FOREIGN KEY ("setById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Company rule (Oct 2026): resumption is 09:00 sharp, no grace period.
UPDATE "StaffProfile" SET "graceMinutes" = 0 WHERE "graceMinutes" = 15;
