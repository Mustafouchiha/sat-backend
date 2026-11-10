-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "openJoin" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "theme" JSONB;

-- CreateTable
CREATE TABLE "group_invites" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT,
    "createdById" TEXT,
    "usedById" TEXT,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_invites_code_key" ON "group_invites"("code");

-- CreateIndex
CREATE INDEX "group_invites_groupId_idx" ON "group_invites"("groupId");

-- AddForeignKey
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

