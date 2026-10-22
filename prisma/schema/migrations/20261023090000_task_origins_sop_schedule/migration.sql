-- CreateEnum
CREATE TYPE "TaskOrigin" AS ENUM ('FOUNDER', 'TEAM_LEAD', 'SOP');

-- CreateEnum
CREATE TYPE "SopFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'ON_DEMAND');

-- AlterEnum
BEGIN;
CREATE TYPE "TaskSource_new" AS ENUM ('MANUAL', 'TARGET', 'CHAT', 'CONVERSATION', 'TICKET', 'SYSTEM');
ALTER TABLE "public"."Task" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "Task" ALTER COLUMN "source" TYPE "TaskSource_new" USING ("source"::text::"TaskSource_new");
ALTER TYPE "TaskSource" RENAME TO "TaskSource_old";
ALTER TYPE "TaskSource_new" RENAME TO "TaskSource";
DROP TYPE "public"."TaskSource_old";
ALTER TABLE "Task" ALTER COLUMN "source" SET DEFAULT 'MANUAL';
COMMIT;

-- DropForeignKey
ALTER TABLE "Sop" DROP CONSTRAINT "Sop_unitId_fkey";

-- DropIndex
DROP INDEX "Task_unitId_status_idx";

-- AlterTable
ALTER TABLE "Sop" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "dayOfMonth" INTEGER,
ADD COLUMN     "defaultPriority" "Priority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "dueTime" TEXT NOT NULL DEFAULT '17:00',
ADD COLUMN     "frequency" "SopFrequency" NOT NULL DEFAULT 'WEEKLY',
ADD COLUMN     "lastGeneratedOn" DATE,
ADD COLUMN     "startsOn" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "weekdays" INTEGER[] DEFAULT ARRAY[1]::INTEGER[],
ALTER COLUMN "unitId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "recurrenceRule",
ADD COLUMN     "boardRank" TEXT NOT NULL,
ADD COLUMN     "origin" "TaskOrigin" NOT NULL,
ADD COLUMN     "sopOccurrenceKey" TEXT;

-- CreateTable
CREATE TABLE "SopAssignee" (
    "sopId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "SopAssignee_pkey" PRIMARY KEY ("sopId","userId")
);

-- CreateIndex
CREATE INDEX "Task_unitId_status_boardRank_idx" ON "Task"("unitId", "status", "boardRank");

-- CreateIndex
CREATE UNIQUE INDEX "Task_sopId_sopOccurrenceKey_key" ON "Task"("sopId", "sopOccurrenceKey");

-- AddForeignKey
ALTER TABLE "Sop" ADD CONSTRAINT "Sop_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SopAssignee" ADD CONSTRAINT "SopAssignee_sopId_fkey" FOREIGN KEY ("sopId") REFERENCES "Sop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SopAssignee" ADD CONSTRAINT "SopAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

