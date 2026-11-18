-- DropForeignKey
ALTER TABLE "Fact" DROP CONSTRAINT "Fact_factUnitId_fkey";

-- AlterTable
ALTER TABLE "Fact" ADD COLUMN     "snippetVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sourceDocumentId" TEXT,
ALTER COLUMN "factUnitId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Fact_factUnitId_idx" ON "Fact"("factUnitId");

-- CreateIndex
CREATE INDEX "Fact_sourceDocumentId_idx" ON "Fact"("sourceDocumentId");

-- AddForeignKey
ALTER TABLE "Fact" ADD CONSTRAINT "Fact_factUnitId_fkey" FOREIGN KEY ("factUnitId") REFERENCES "FactUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fact" ADD CONSTRAINT "Fact_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
