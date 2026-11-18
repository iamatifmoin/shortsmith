-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('CONFIRMED', 'STRONG_RUMOR', 'RUMOR');

-- CreateEnum
CREATE TYPE "AngleType" AS ENUM ('FACT', 'LIST', 'EXPLAINER', 'COMPARISON', 'PREDICTION');

-- CreateEnum
CREATE TYPE "AngleStatus" AS ENUM ('PROPOSED', 'GENERATED', 'PRODUCED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ScriptStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Series" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "voiceTone" TEXT,
    "formatRules" JSONB,
    "minConfidence" "Confidence" NOT NULL DEFAULT 'CONFIRMED',
    "allowedTiers" INTEGER[] DEFAULT ARRAY[1, 2]::INTEGER[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "sourceKey" TEXT,
    "sourceTier" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "extractedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactUnit" (
    "id" TEXT NOT NULL,
    "canonicalClaim" TEXT NOT NULL,
    "category" TEXT,
    "confidence" "Confidence" NOT NULL DEFAULT 'RUMOR',
    "corroborationCount" INTEGER NOT NULL DEFAULT 1,
    "isRumor" BOOLEAN NOT NULL DEFAULT true,
    "flaggedOut" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FactUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fact" (
    "id" TEXT NOT NULL,
    "factUnitId" TEXT NOT NULL,
    "claim" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "sourceTier" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Angle" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "primaryFactUnitId" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "angleType" "AngleType" NOT NULL DEFAULT 'FACT',
    "noveltyHash" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "AngleStatus" NOT NULL DEFAULT 'PROPOSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Angle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Script" (
    "id" TEXT NOT NULL,
    "angleId" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "cta" TEXT NOT NULL,
    "claims" JSONB NOT NULL,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "estDurationSec" INTEGER NOT NULL DEFAULT 0,
    "hookScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "ScriptStatus" NOT NULL DEFAULT 'DRAFT',
    "editedBody" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Script_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Series_key_key" ON "Series"("key");

-- CreateIndex
CREATE INDEX "SourceDocument_seriesId_extractedAt_idx" ON "SourceDocument"("seriesId", "extractedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SourceDocument_seriesId_url_key" ON "SourceDocument"("seriesId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "Angle_noveltyHash_key" ON "Angle"("noveltyHash");

-- CreateIndex
CREATE UNIQUE INDEX "Script_angleId_key" ON "Script"("angleId");

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fact" ADD CONSTRAINT "Fact_factUnitId_fkey" FOREIGN KEY ("factUnitId") REFERENCES "FactUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Angle" ADD CONSTRAINT "Angle_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Angle" ADD CONSTRAINT "Angle_primaryFactUnitId_fkey" FOREIGN KEY ("primaryFactUnitId") REFERENCES "FactUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Script" ADD CONSTRAINT "Script_angleId_fkey" FOREIGN KEY ("angleId") REFERENCES "Angle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Script" ADD CONSTRAINT "Script_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
