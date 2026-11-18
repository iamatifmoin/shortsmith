-- CreateEnum
CREATE TYPE "ReviewSelection" AS ENUM ('APPROVE', 'REJECT');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('READY', 'NOTIFIED', 'SCHEDULED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Script" ADD COLUMN     "reviewSelection" "ReviewSelection";

-- CreateTable
CREATE TABLE "PublishTask" (
    "id" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "renderJobId" TEXT NOT NULL,
    "status" "PublishStatus" NOT NULL DEFAULT 'READY',
    "slotAt" TIMESTAMP(3) NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),
    "telegramChatId" TEXT,
    "telegramMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppState" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppState_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublishTask_renderJobId_key" ON "PublishTask"("renderJobId");

-- CreateIndex
CREATE INDEX "PublishTask_status_idx" ON "PublishTask"("status");

-- CreateIndex
CREATE INDEX "PublishTask_slotAt_idx" ON "PublishTask"("slotAt");

-- CreateIndex
CREATE INDEX "Script_status_reviewSelection_idx" ON "Script"("status", "reviewSelection");

-- AddForeignKey
ALTER TABLE "PublishTask" ADD CONSTRAINT "PublishTask_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishTask" ADD CONSTRAINT "PublishTask_renderJobId_fkey" FOREIGN KEY ("renderJobId") REFERENCES "RenderJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
