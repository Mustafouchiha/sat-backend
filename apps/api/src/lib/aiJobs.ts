import type { AiJob, Difficulty, Prisma, Section } from '@prisma/client';
import { tashkentDate } from '@sat/shared';
import { prisma } from '../db';
import { aiConfigured, usageCost, totalIn, type Usage } from './aiClient';
import {
  answersMatch,
  checkGenerated,
  existingStems,
  generateBatch,
  planSlots,
  saveGenerated,
  skillsOf,
  verifyBatch,
  type GenQuestionT,
  type SampleFile,
  type Slot,
} from './aiQuestions';
import { invalidateCatalog } from './catalog';
import type { Shortage } from './fresh';
import { HttpError } from './http';
import { getSettings } from './settings';

/** Bitta AI so'rovida nechta savol (javob uzun bo'lib ketmasligi va progress ko'rinishi uchun). */
const BATCH = 5;
const CONCURRENCY = 2;

export type JobReason = 'admin' | 'student' | 'refill';

export interface JobInput {
  mode: 'topic' | 'sample';
  skillIds?: string[];
  domainId?: string | null;
  difficulty?: Difficulty | 'MIXED';
  /** Har bir savol uchun aniq reja (o'quvchi uchun) */
  slots?: Slot[];
  count: number;
  text?: string;
  /** Faqat nomlar — fayllarning o'zi bazaga yozilmaydi (xotirada, vazifa tugaguncha) */
  files?: Array<{ name?: string; mime: string }>;
  note?: string;
  studentContext?: string;
}

export interface JobLogItem {
  title: string;
  skillId?: string;
  difficulty?: string;
  ok: boolean;
  reason?: string;
  templateId?: string;
}

const queue: string[] = [];
const jobFiles = new Map<string, SampleFile[]>();
let running = 0;

function pump(): void {
  while (running < CONCURRENCY && queue.length) {
    const id = queue.shift()!;
    running++;
    void runJob(id)
      .catch((e) => console.error('AI vazifa xatosi:', (e as Error).message))
      .finally(() => {
        running--;
        jobFiles.delete(id);
        pump();
      });
  }
}

// ───────────────────────── Kunlik byudjet ─────────────────────────

let spendCache: { at: number; usd: number } | null = null;

/** Bugungi (Toshkent kuni) AI xarajati: chat + savol yaratish, USD. 30 soniya keshlanadi. */
export async function todaySpendUsd(): Promise<number> {
  if (spendCache && Date.now() - spendCache.at < 30_000) return spendCache.usd;
  const since = tashkentDayStart();
  const [chat, jobs] = await Promise.all([
    prisma.aiMessage.aggregate({ where: { createdAt: { gte: since } }, _sum: { costUsd: true } }),
    prisma.aiJob.aggregate({ where: { createdAt: { gte: since } }, _sum: { costUsd: true } }),
  ]);
  const usd = (chat._sum.costUsd ?? 0) + (jobs._sum.costUsd ?? 0);
  spendCache = { at: Date.now(), usd };
  return usd;
}

/** Kunlik byudjet (sozlamalar → ai.dailyBudgetUsd) hali tugamaganmi. 0 — cheklovsiz. */
export async function withinBudget(): Promise<boolean> {
  const budget = (await getSettings()).ai.dailyBudgetUsd;
  if (!budget || budget <= 0) return true;
  return (await todaySpendUsd()) < budget;
}

export const budgetError = () => new HttpError(429, "AI bugungi limitga yetdi — ertaga yana ishlaydi", 'AI_BUDGET');

export async function createJob(opts: {
  section: Section;
  reason: JobReason;
  input: JobInput;
  createdById?: string | null;
  forUserId?: string | null;
  files?: SampleFile[];
}): Promise<AiJob> {
  if (!aiConfigured()) throw new HttpError(501, "AI sozlanmagan: Railway'da ANTHROPIC_API_KEY o'rnatilmagan", 'AI_DISABLED');
  if (!(await withinBudget())) {
    throw opts.reason === 'admin'
      ? new HttpError(429, "Bugungi AI byudjeti tugadi — sozlamalarda «Kunlik AI byudjeti» ni oshiring yoki ertaga urinib ko'ring", 'AI_BUDGET')
      : budgetError();
  }
  const job = await prisma.aiJob.create({
    data: {
      section: opts.section,
      reason: opts.reason,
      input: opts.input as unknown as Prisma.InputJsonValue,
      createdById: opts.createdById ?? null,
      forUserId: opts.forUserId ?? null,
      total: opts.input.count,
    },
  });
  if (opts.files?.length) jobFiles.set(job.id, opts.files);
  queue.push(job.id);
  pump();
  return job;
}

/** Server qayta ishga tushganda tugallanmagan vazifalar (fayllar xotirada edi) — xato deb belgilanadi. */
export async function recoverJobs(): Promise<void> {
  await prisma.aiJob
    .updateMany({
      where: { status: { in: ['QUEUED', 'RUNNING'] } },
      data: { status: 'FAILED', error: "Server qayta ishga tushdi — vazifani qaytadan boshlang", finishedAt: new Date() },
    })
    .catch(() => undefined);
}

function addUsage(acc: { inTokens: number; outTokens: number; costUsd: number }, model: string, u: Usage) {
  acc.inTokens += totalIn(u);
  acc.outTokens += u.output_tokens;
  acc.costUsd += usageCost(model, u);
}

async function runJob(id: string): Promise<void> {
  const claim = await prisma.aiJob.updateMany({ where: { id, status: 'QUEUED' }, data: { status: 'RUNNING', startedAt: new Date() } });
  if (!claim.count) return;
  const job = await prisma.aiJob.findUniqueOrThrow({ where: { id } });
  const input = job.input as unknown as JobInput;
  const s = (await getSettings()).ai;
  const files = jobFiles.get(id);
  const status = s.autoPublish ? 'PUBLISHED' : 'PENDING_REVIEW';

  const skillIds = input.skillIds?.length ? input.skillIds : skillsOf(job.section, input.domainId);
  const slots: Slot[] =
    input.mode === 'topic' ? (input.slots?.length ? input.slots : planSlots(skillIds, input.difficulty ?? 'MIXED', input.count)) : [];
  const avoid = await existingStems(job.section, input.mode === 'topic' ? [...new Set(slots.map((x) => x.skillId))] : skillsOf(job.section), 20);

  const log: JobLogItem[] = [];
  const templateIds: string[] = [];
  const usage = { inTokens: 0, outTokens: 0, costUsd: 0 };
  const usedBasedOn = new Set<number>();
  let done = 0;
  let created = 0;
  let rejected = 0;
  let failures = 0;
  let lastError: string | null = null;
  let topicsLogged = false;

  const save = () =>
    prisma.aiJob.update({
      where: { id },
      data: {
        done,
        created,
        rejected,
        templateIds,
        log: log as unknown as Prisma.InputJsonValue,
        inTokens: usage.inTokens,
        outTokens: usage.outTokens,
        costUsd: usage.costUsd,
      },
    });

  while (done < input.count && failures < 2) {
    const n = Math.min(BATCH, input.count - done);
    const batchSlots = slots.slice(done, done + n);
    let questions: GenQuestionT[] = [];
    try {
      const gen = await generateBatch({
        section: job.section,
        model: s.genModel,
        count: n,
        slots: batchSlots.length ? batchSlots : undefined,
        sample: input.mode === 'sample' ? { text: input.text, files, usedBasedOn: [...usedBasedOn] } : undefined,
        note: input.note,
        studentContext: input.studentContext,
        avoid: [...avoid, ...log.filter((l) => l.templateId).map((l) => l.title)],
      });
      addUsage(usage, gen.model, gen.usage);
      questions = gen.questions.slice(0, n);
      if (gen.topics.trim() && !topicsLogged) {
        topicsLogged = true;
        log.push({ title: `Namunadagi mavzular: ${gen.topics.trim()}`, ok: true, reason: 'info' });
      }
      if (questions.length < n) {
        rejected += n - questions.length;
        log.push({ title: `${n - questions.length} ta savol`, ok: false, reason: "AI so'ralganidan kamroq savol qaytardi" });
      }

      // 1) shakl tekshiruvi
      const checked = questions.map((q, i) => ({ q, c: checkGenerated(job.section, q, batchSlots[i]?.skillId) }));
      const passing = checked.filter((x) => x.c.ok);
      // 2) mustaqil yechish
      const verdicts = passing.length ? await verifyBatch(job.section, passing.map((x) => x.q), s.verifyModel) : null;
      if (verdicts) addUsage(usage, verdicts.model, verdicts.usage);

      for (const { q, c } of checked) {
        if (q.basedOn) usedBasedOn.add(q.basedOn);
        const base = { title: q.title, skillId: q.skillId, difficulty: q.difficulty };
        if (!c.ok) {
          rejected++;
          log.push({ ...base, ok: false, reason: c.reason });
          continue;
        }
        const v = verdicts?.verdicts.get(passing.findIndex((x) => x.q === q) + 1);
        if (!v) {
          rejected++;
          log.push({ ...base, ok: false, reason: 'Tekshiruvchi AI javob bermadi' });
          continue;
        }
        if (!v.sound || !answersMatch(q, v)) {
          rejected++;
          const why = !v.sound ? v.issue || 'Savolda xato topildi' : `Tekshiruvchi boshqa javob topdi (${v.answer})`;
          log.push({ ...base, ok: false, reason: why });
          continue;
        }
        const t = await saveGenerated(q, c, { section: job.section, status, createdById: job.createdById });
        if (!t) {
          rejected++;
          log.push({ ...base, ok: false, reason: 'Bankda xuddi shunday savol bor' });
          continue;
        }
        created++;
        templateIds.push(t.id);
        log.push({ ...base, ok: true, templateId: t.id });
      }
      failures = 0;
    } catch (e) {
      failures++;
      lastError = (e as Error).message;
      log.push({ title: `${n} ta savol`, ok: false, reason: lastError });
      // kalit noto'g'ri / AI o'chirilgan — qayta urinishdan foyda yo'q
      if (e instanceof HttpError && ['AI_AUTH', 'AI_DISABLED', 'AI_REFUSAL'].includes(e.code ?? '')) failures = 2;
    }
    done += n;
    await save();
  }
  if (created) invalidateCatalog();
  await prisma.aiJob.update({
    where: { id },
    data: {
      done: input.count,
      status: created || !lastError ? 'DONE' : 'FAILED',
      error: created ? null : lastError ?? (rejected ? "Yaratilgan savollar tekshiruvdan o'tmadi" : null),
      finishedAt: new Date(),
    },
  });
}

// ───────────────────────── Avto-to'ldirish ─────────────────────────

const pendingRefill = new Set<string>();

function tashkentDayStart(): Date {
  return new Date(Date.parse(`${tashkentDate()}T00:00:00Z`) - 5 * 3600_000);
}

/** O'quvchi uchun ko'rilmagan savol tugagan mavzular: kunlik limit doirasida AI 5 tadan yangi savol yaratadi. */
export async function requestRefill(shortages: Shortage[]): Promise<void> {
  if (!aiConfigured() || !shortages.length) return;
  const s = (await getSettings()).ai;
  if (!s.autoRefill || s.refillDailyJobs <= 0 || !(await withinBudget())) return;
  let left = s.refillDailyJobs - (await prisma.aiJob.count({ where: { reason: 'refill', createdAt: { gte: tashkentDayStart() } } }));
  if (left <= 0) return;
  // Shu mavzuga yaqinda (6 soat) har qanday AI vazifa bo'lgan bo'lsa — qayta yaratmaymiz (o'quvchi/admin vazifasi ham hisob)
  const recent = await prisma.aiJob.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 6 * 3600_000) }, status: { not: 'FAILED' } },
    select: { section: true, input: true },
  });
  const recentKeys = new Set(
    recent.flatMap((j) => {
      const inp = j.input as unknown as JobInput;
      return [...(inp.skillIds ?? []), ...(inp.slots ?? []).map((x) => x.skillId)].map((sk) => `${j.section}:${sk}`);
    }),
  );
  for (const sh of shortages.slice(0, 2)) {
    const key = `${sh.section}:${sh.skillId}`;
    if (left <= 0 || recentKeys.has(key) || pendingRefill.has(key)) continue;
    pendingRefill.add(key);
    try {
      await createJob({ section: sh.section, reason: 'refill', input: { mode: 'topic', skillIds: [sh.skillId], difficulty: 'MIXED', count: 5 } });
      left--;
    } finally {
      pendingRefill.delete(key);
    }
  }
}

/** O'quvchi bugun «AI yangi savollar» bilan nechta vazifa boshlagan. */
export const studentJobsToday = (userId: string) =>
  prisma.aiJob.count({ where: { reason: 'student', forUserId: userId, createdAt: { gte: tashkentDayStart() } } });

export { tashkentDayStart };

export function jobView(j: AiJob) {
  const input = j.input as unknown as JobInput;
  return {
    id: j.id,
    status: j.status,
    section: j.section,
    reason: j.reason,
    mode: input.mode,
    count: input.count,
    skillIds: input.skillIds ?? [],
    difficulty: input.difficulty ?? 'MIXED',
    files: input.files ?? [],
    total: j.total,
    done: j.done,
    created: j.created,
    rejected: j.rejected,
    templateIds: j.templateIds,
    log: (j.log ?? []) as unknown as JobLogItem[],
    error: j.error,
    costUsd: Math.round(j.costUsd * 1000) / 1000,
    createdAt: j.createdAt,
    finishedAt: j.finishedAt,
  };
}
