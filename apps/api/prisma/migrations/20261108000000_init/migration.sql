-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'OPERATOR', 'TEACHER', 'STUDENT', 'PARENT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "GroupRole" AS ENUM ('STUDENT', 'TEACHER');

-- CreateEnum
CREATE TYPE "Section" AS ENUM ('RW', 'MATH');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TestType" AS ENUM ('MOCK', 'SECTION', 'MODULE', 'TOPIC', 'HOMEWORK', 'QUICK');

-- CreateEnum
CREATE TYPE "ModuleVariant" AS ENUM ('STANDARD', 'EASY', 'HARD');

-- CreateEnum
CREATE TYPE "AttemptMode" AS ENUM ('TEST', 'PRACTICE', 'REVIEW', 'DAILY', 'RUSH', 'DUEL');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'BREAK', 'FINISHED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "RatingType" AS ENUM ('OVERALL', 'MATH', 'RW');

-- CreateEnum
CREATE TYPE "ResultVisibility" AS ENUM ('IMMEDIATE', 'AFTER_DUE');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DuelStatus" AS ENUM ('WAITING', 'ACTIVE', 'FINISHED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tgId" BIGINT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT,
    "username" TEXT,
    "photoUrl" TEXT,
    "lang" TEXT NOT NULL DEFAULT 'uz',
    "roles" "Role"[] DEFAULT ARRAY['STUDENT']::"Role"[],
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "targetScore" INTEGER,
    "examDate" TIMESTAMP(3),
    "xp" INTEGER NOT NULL DEFAULT 0,
    "answeredTotal" INTEGER NOT NULL DEFAULT 0,
    "correctTotal" INTEGER NOT NULL DEFAULT 0,
    "notifyDaily" BOOLEAN NOT NULL DEFAULT true,
    "botBlocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "leaderboardEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "GroupRole" NOT NULL DEFAULT 'STUDENT',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("groupId","userId")
);

-- CreateTable
CREATE TABLE "parent_links" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linkedAt" TIMESTAMP(3),

    CONSTRAINT "parent_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domains" (
    "id" TEXT NOT NULL,
    "section" "Section" NOT NULL,
    "name" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_templates" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "section" "Section" NOT NULL,
    "domainId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "spec" JSONB NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 1200,
    "ratingGames" INTEGER NOT NULL DEFAULT 0,
    "timesAnswered" INTEGER NOT NULL DEFAULT 0,
    "timesCorrect" INTEGER NOT NULL DEFAULT 0,
    "totalTimeMs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "similarIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_revisions" (
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "spec" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_revisions_pkey" PRIMARY KEY ("templateId","version")
);

-- CreateTable
CREATE TABLE "media" (
    "id" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tests" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "TestType" NOT NULL,
    "adaptive" BOOLEAN NOT NULL DEFAULT false,
    "adaptiveThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "breakSeconds" INTEGER NOT NULL DEFAULT 600,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_modules" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "section" "Section" NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 1,
    "variant" "ModuleVariant" NOT NULL DEFAULT 'STANDARD',
    "durationSec" INTEGER NOT NULL,

    CONSTRAINT "test_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_module_items" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "templateId" TEXT,
    "poolDomainId" TEXT,
    "poolSkillId" TEXT,
    "poolDifficulty" "Difficulty",

    CONSTRAINT "test_module_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "resultVisibility" "ResultVisibility" NOT NULL DEFAULT 'IMMEDIATE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reminded24" BOOLEAN NOT NULL DEFAULT false,
    "reminded2" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "AttemptMode" NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "title" TEXT,
    "testId" TEXT,
    "assignmentId" TEXT,
    "duelId" TEXT,
    "dailyDate" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3),
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "answeredCount" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "mistakes" INTEGER NOT NULL DEFAULT 0,
    "rwRaw" INTEGER,
    "mathRaw" INTEGER,
    "rwScaled" INTEGER,
    "mathScaled" INTEGER,
    "totalScaled" INTEGER,
    "blurCount" INTEGER NOT NULL DEFAULT 0,
    "ratingDelta" INTEGER NOT NULL DEFAULT 0,
    "meta" JSONB,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_modules" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "testModuleId" TEXT,
    "order" INTEGER NOT NULL,
    "section" "Section",
    "stage" INTEGER NOT NULL DEFAULT 1,
    "variant" "ModuleVariant" NOT NULL DEFAULT 'STANDARD',
    "durationSec" INTEGER,
    "startedAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "attempt_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_answers" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "attemptModuleId" TEXT,
    "order" INTEGER NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "seed" INTEGER NOT NULL,
    "answer" TEXT,
    "isCorrect" BOOLEAN,
    "marked" BOOLEAN NOT NULL DEFAULT false,
    "timeSpentMs" INTEGER NOT NULL DEFAULT 0,
    "answeredAt" TIMESTAMP(3),
    "ratingDelta" INTEGER,

    CONSTRAINT "attempt_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_scales" (
    "id" TEXT NOT NULL,
    "section" "Section" NOT NULL,
    "variant" "ModuleVariant" NOT NULL,
    "raw" INTEGER NOT NULL,
    "scaled" INTEGER NOT NULL,

    CONSTRAINT "score_scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_skill_mastery" (
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "mastery" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "wrong" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_skill_mastery_pkey" PRIMARY KEY ("userId","skillId")
);

-- CreateTable
CREATE TABLE "review_queue" (
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_queue_pkey" PRIMARY KEY ("userId","templateId")
);

-- CreateTable
CREATE TABLE "ratings" (
    "userId" TEXT NOT NULL,
    "type" "RatingType" NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 1200,
    "games" INTEGER NOT NULL DEFAULT 0,
    "peak" DOUBLE PRECISION NOT NULL DEFAULT 1200,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("userId","type")
);

-- CreateTable
CREATE TABLE "rating_history" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "RatingType" NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "delta" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rating_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_tests" (
    "date" TEXT NOT NULL,
    "commonTemplateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_tests_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "streaks" (
    "userId" TEXT NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,
    "best" INTEGER NOT NULL DEFAULT 0,
    "lastDate" TEXT,
    "freezeUsedAt" TEXT,

    CONSTRAINT "streaks_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "duels" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "DuelStatus" NOT NULL DEFAULT 'WAITING',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "creatorId" TEXT NOT NULL,
    "opponentId" TEXT,
    "creatorRating" DOUBLE PRECISION NOT NULL DEFAULT 1200,
    "section" "Section",
    "count" INTEGER NOT NULL DEFAULT 5,
    "templateIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "winnerId" TEXT,
    "startedAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "puzzle_rush_runs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "mistakes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "puzzle_rush_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievements" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "user_achievements" (
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("userId","code")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "seed" INTEGER,
    "templateVersion" INTEGER,
    "message" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "response" TEXT,
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_comments" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "diff" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_tgId_key" ON "users"("tgId");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "groups_inviteCode_key" ON "groups"("inviteCode");

-- CreateIndex
CREATE INDEX "group_members_userId_idx" ON "group_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "parent_links_code_key" ON "parent_links"("code");

-- CreateIndex
CREATE INDEX "parent_links_parentId_idx" ON "parent_links"("parentId");

-- CreateIndex
CREATE INDEX "skills_domainId_idx" ON "skills"("domainId");

-- CreateIndex
CREATE INDEX "question_templates_status_section_domainId_skillId_difficul_idx" ON "question_templates"("status", "section", "domainId", "skillId", "difficulty");

-- CreateIndex
CREATE INDEX "question_templates_status_rating_idx" ON "question_templates"("status", "rating");

-- CreateIndex
CREATE INDEX "test_modules_testId_order_idx" ON "test_modules"("testId", "order");

-- CreateIndex
CREATE INDEX "test_module_items_moduleId_order_idx" ON "test_module_items"("moduleId", "order");

-- CreateIndex
CREATE INDEX "assignments_groupId_idx" ON "assignments"("groupId");

-- CreateIndex
CREATE INDEX "assignments_dueAt_idx" ON "assignments"("dueAt");

-- CreateIndex
CREATE INDEX "attempts_userId_mode_status_idx" ON "attempts"("userId", "mode", "status");

-- CreateIndex
CREATE INDEX "attempts_assignmentId_idx" ON "attempts"("assignmentId");

-- CreateIndex
CREATE INDEX "attempts_mode_dailyDate_idx" ON "attempts"("mode", "dailyDate");

-- CreateIndex
CREATE INDEX "attempts_duelId_idx" ON "attempts"("duelId");

-- CreateIndex
CREATE UNIQUE INDEX "attempts_userId_mode_dailyDate_key" ON "attempts"("userId", "mode", "dailyDate");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_modules_attemptId_order_key" ON "attempt_modules"("attemptId", "order");

-- CreateIndex
CREATE INDEX "attempt_answers_templateId_idx" ON "attempt_answers"("templateId");

-- CreateIndex
CREATE INDEX "attempt_answers_answeredAt_idx" ON "attempt_answers"("answeredAt");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_answers_attemptId_order_key" ON "attempt_answers"("attemptId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "score_scales_section_variant_raw_key" ON "score_scales"("section", "variant", "raw");

-- CreateIndex
CREATE INDEX "review_queue_userId_dueAt_idx" ON "review_queue"("userId", "dueAt");

-- CreateIndex
CREATE INDEX "ratings_type_rating_idx" ON "ratings"("type", "rating");

-- CreateIndex
CREATE INDEX "rating_history_userId_type_createdAt_idx" ON "rating_history"("userId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "rating_history_type_createdAt_idx" ON "rating_history"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "duels_code_key" ON "duels"("code");

-- CreateIndex
CREATE INDEX "duels_status_isPublic_createdAt_idx" ON "duels"("status", "isPublic", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "puzzle_rush_runs_attemptId_key" ON "puzzle_rush_runs"("attemptId");

-- CreateIndex
CREATE INDEX "puzzle_rush_runs_durationSec_score_idx" ON "puzzle_rush_runs"("durationSec", "score");

-- CreateIndex
CREATE INDEX "puzzle_rush_runs_userId_idx" ON "puzzle_rush_runs"("userId");

-- CreateIndex
CREATE INDEX "reports_status_createdAt_idx" ON "reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "teacher_comments_studentId_idx" ON "teacher_comments"("studentId");

-- CreateIndex
CREATE INDEX "notifications_userId_type_idx" ON "notifications"("userId", "type");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_links" ADD CONSTRAINT "parent_links_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_links" ADD CONSTRAINT "parent_links_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_templates" ADD CONSTRAINT "question_templates_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "domains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_templates" ADD CONSTRAINT "question_templates_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_revisions" ADD CONSTRAINT "template_revisions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "question_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_modules" ADD CONSTRAINT "test_modules_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_module_items" ADD CONSTRAINT "test_module_items_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "test_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_duelId_fkey" FOREIGN KEY ("duelId") REFERENCES "duels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_modules" ADD CONSTRAINT "attempt_modules_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_attemptModuleId_fkey" FOREIGN KEY ("attemptModuleId") REFERENCES "attempt_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "question_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_skill_mastery" ADD CONSTRAINT "student_skill_mastery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_skill_mastery" ADD CONSTRAINT "student_skill_mastery_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_queue" ADD CONSTRAINT "review_queue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_queue" ADD CONSTRAINT "review_queue_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "question_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streaks" ADD CONSTRAINT "streaks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puzzle_rush_runs" ADD CONSTRAINT "puzzle_rush_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puzzle_rush_runs" ADD CONSTRAINT "puzzle_rush_runs_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_code_fkey" FOREIGN KEY ("code") REFERENCES "achievements"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "question_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_comments" ADD CONSTRAINT "teacher_comments_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_comments" ADD CONSTRAINT "teacher_comments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

