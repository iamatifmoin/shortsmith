-- CreateEnum
CREATE TYPE "RenderStatus" AS ENUM ('QUEUED', 'RENDERING', 'DONE', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "RenderJob" (
    "id" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "status" "RenderStatus" NOT NULL DEFAULT 'QUEUED',
    "videoPath" TEXT,
    "thumbnailPath" TEXT,
    "durationSec" DOUBLE PRECISION,
    "audioDurationSec" DOUBLE PRECISION,
    "voiceId" TEXT,
    "backgroundClips" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "musicTrack" TEXT,
    "error" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RenderJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RenderJob_scriptId_idx" ON "RenderJob"("scriptId");

-- CreateIndex
CREATE INDEX "RenderJob_status_idx" ON "RenderJob"("status");

-- AddForeignKey
ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
