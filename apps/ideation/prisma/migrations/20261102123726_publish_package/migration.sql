-- AlterTable
ALTER TABLE "Script" ADD COLUMN     "publishPackage" JSONB;

-- AlterTable
ALTER TABLE "Series" ADD COLUMN     "publishDefaults" JSONB;
