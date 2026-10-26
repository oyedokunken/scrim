-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Os" AS ENUM ('WINDOWS', 'MACOS', 'LINUX');

-- CreateEnum
CREATE TYPE "Arch" AS ENUM ('X64', 'ARM64');

-- CreateTable
CREATE TABLE "Person" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "updatesOptIn" BOOLEAN NOT NULL DEFAULT false,
    "unsubscribeToken" TEXT NOT NULL,
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Download" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "os" "Os" NOT NULL,
    "arch" "Arch",
    "version" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "emailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Download_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Person_email_key" ON "Person"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Person_unsubscribeToken_key" ON "Person"("unsubscribeToken");

-- CreateIndex
CREATE INDEX "Download_personId_idx" ON "Download"("personId");

-- CreateIndex
CREATE INDEX "Download_createdAt_idx" ON "Download"("createdAt");

-- CreateIndex
CREATE INDEX "Download_ipHash_createdAt_idx" ON "Download"("ipHash", "createdAt");

-- AddForeignKey
ALTER TABLE "Download" ADD CONSTRAINT "Download_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row level security with no policies. Prisma connects as the table owner and bypasses RLS,
-- while the public Supabase Data API can read nothing from these tables.
ALTER TABLE "Person" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Download" ENABLE ROW LEVEL SECURITY;
