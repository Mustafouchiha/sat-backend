-- CreateEnum
CREATE TYPE "WebLoginKind" AS ENUM ('QR', 'PHONE');

-- CreateEnum
CREATE TYPE "WebLoginStatus" AS ENUM ('PENDING', 'APPROVED', 'USED', 'REJECTED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "web_logins" (
    "id" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "kind" "WebLoginKind" NOT NULL,
    "status" "WebLoginStatus" NOT NULL DEFAULT 'PENDING',
    "phone" TEXT,
    "userId" TEXT,
    "codeHash" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "device" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_logins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "web_logins_phone_createdAt_idx" ON "web_logins"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "web_logins_expiresAt_idx" ON "web_logins"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- AddForeignKey
ALTER TABLE "web_logins" ADD CONSTRAINT "web_logins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

