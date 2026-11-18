-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('YOUTUBE', 'INSTAGRAM');

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "externalUrl" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "avgViewDurationSec" DOUBLE PRECISION,
    "retentionPct" DOUBLE PRECISION,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "subscribersGained" INTEGER NOT NULL DEFAULT 0,
    "metricsUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Post_platform_idx" ON "Post"("platform");

-- CreateIndex
CREATE UNIQUE INDEX "Post_scriptId_platform_key" ON "Post"("scriptId", "platform");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
