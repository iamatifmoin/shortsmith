-- AlterTable
ALTER TABLE "Series" ADD COLUMN     "comparisonLabel" TEXT,
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "links" JSONB,
ADD COLUMN     "logoPath" TEXT,
ADD COLUMN     "personality" TEXT,
ADD COLUMN     "publishConfig" JSONB,
ADD COLUMN     "subjectAliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "subjectName" TEXT,
ADD COLUMN     "topicTerms" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "rssUrl" TEXT,
    "rumorOnly" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Source_seriesId_tier_idx" ON "Source"("seriesId", "tier");

-- CreateIndex
CREATE UNIQUE INDEX "Source_seriesId_key_key" ON "Source"("seriesId", "key");

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
