import type Anthropic from '@anthropic-ai/sdk';
import type { AiMessage, Prisma, Role, UserStatus } from '@prisma/client';
import { displayRating } from '@sat/shared';
import { prisma } from '../db';
import { aiClient, aiConfigured, aiError, totalIn, usageCost } from './aiClient';
import { fallbackOpts, questionAsText, skillById } from './aiQuestions';
import { budgetError, tashkentDayStart, withinBudget } from './aiJobs';
import { hasRole } from './auth';
import { HttpError, notFound } from './http';
import { getSettings } from './settings';
import { ensureRatings } from './users';
import { getVariant } from './variants';

export type Channel = 'app' | 'bot';
export type TutorUser = { id: string; firstName: string; roles: Role[]; status: UserStatus; lang: string };
export type ChatImage = { mime: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; data: string };

interface MsgContext {
  kind: 'question' | 'lesson';
  title?: string;
  answerId?: string;
  skillId?: string;
  /** Modelga yuboriladigan to'liq kontekst (savol matni, xatolar) — ekranda ko'rsatilmaydi */
  text?: string;
}

const LANG_NAME: Record<string, string> = { uz: 'Uzbek (Latin script)', ru: 'Russian', en: 'English' };

const TUTOR_SYSTEM = `You are "SAT ustoz", the AI tutor of a Digital SAT preparation center. Students use the center's Telegram Mini App and Telegram bot to practise SAT Math and Reading and Writing.

HOW YOU HELP
- Explain SAT Math and Reading and Writing questions, concepts, grammar rules, vocabulary and test strategy; help the student understand their mistakes; make study plans; answer questions about the Digital SAT (format, timing, scoring 400–1600, adaptive modules, Desmos calculator).
- Teach, do not just give answers: show the key idea, then the steps. When the student sends a question, solve it carefully and check your answer before replying. If something is unclear (an unreadable photo, missing answer choices), say so and ask.
- Use the student's own data below (scores, weak skills) to personalise advice.
- Be concise: usually 60–250 words. Use short paragraphs and bullet points. Longer only when the student asks for a detailed explanation.
- Be warm and encouraging, never condescending. Use the student's first name occasionally.
- Stay on studying: for unrelated requests, answer very briefly or politely steer back to SAT preparation. Never write content that is harmful or inappropriate for teenagers.
- Do not invent facts about official College Board policies; if unsure, say so.
- Reply in the student's language given below, unless the student writes in another language — then use theirs. SAT questions and answer choices themselves stay in English.`;

const CHANNEL_RULES: Record<Channel, string> = {
  app: 'FORMAT: the app renders $...$ as math (KaTeX) and **bold**. Write all math in $...$, e.g. $\\dfrac{3}{4}$, $x^{2}$. Use "- " at the start of a line for bullet points. No headings and no Markdown tables.',
  bot: 'FORMAT: this is a Telegram chat that cannot render LaTeX or Markdown. Write math in plain Unicode: x², √5, ≤, ≥, ≠, π, fractions as 3/4 or (2x+1)/3. No $ signs, no **, no headings. Use "• " for bullet points.',
};

// ───────────────────────── Holat va cheklovlar ─────────────────────────

const isStaffUser = (u: Pick<TutorUser, 'roles'>) => hasRole(u, 'OPERATOR', 'TEACHER');

/** Taymerli rejim davom etyapti (test moduli, kunlik test, Rush, duel) — bu vaqtda AI ishlamaydi. */
export async function inTimedAttempt(userId: string): Promise<boolean> {
  const now = new Date();
  const a = await prisma.attempt.findFirst({
    where: { userId, status: 'IN_PROGRESS', mode: { in: ['DAILY', 'RUSH', 'DUEL'] }, deadlineAt: { gt: now } },
    select: { id: true },
  });
  if (a) return true;
  const m = await prisma.attemptModule.findFirst({
    where: { attempt: { userId, mode: 'TEST', status: { in: ['IN_PROGRESS', 'BREAK'] } }, startedAt: { not: null }, submittedAt: null, deadlineAt: { gt: now } },
    select: { id: true },
  });
  return !!m;
}

export async function chatState(user: TutorUser) {
  const s = (await getSettings()).ai;
  const used = await prisma.aiMessage.count({ where: { userId: user.id, role: 'USER', createdAt: { gte: tashkentDayStart() } } });
  const unlimited = isStaffUser(user);
  return {
    configured: aiConfigured(),
    enabled: aiConfigured() && s.chatEnabled,
    limit: unlimited ? null : s.chatDailyLimit,
    used,
    busy: await inTimedAttempt(user.id),
    /** Markazning kunlik AI byudjeti tugagan */
    overBudget: !(await withinBudget()),
  };
}

async function guard(user: TutorUser): Promise<void> {
  const st = await chatState(user);
  if (!st.configured) throw new HttpError(501, "AI ustoz hali sozlanmagan (admin ANTHROPIC_API_KEY ni qo'shishi kerak)", 'AI_DISABLED');
  if (!st.enabled) throw new HttpError(503, "AI ustoz admin tomonidan vaqtincha o'chirilgan", 'AI_OFF');
  if (user.status !== 'ACTIVE' && !isStaffUser(user)) throw new HttpError(403, "Avval guruhga qo'shiling (o'qituvchidan taklif kodini oling)", 'PENDING');
  if (st.busy) throw new HttpError(409, 'Test davomida AI ustoz ishlamaydi — testni tugatgandan keyin so\'rang', 'AI_BUSY');
  if (st.limit !== null && st.used >= st.limit) {
    throw new HttpError(429, `Bugungi limit tugadi (${st.limit} ta xabar). Ertaga yana yozishingiz mumkin`, 'AI_LIMIT');
  }
  if (st.overBudget) throw budgetError();
}

// ───────────────────────── Kontekst ─────────────────────────

async function studentBlock(user: TutorUser, channel: Channel): Promise<string> {
  const [ratings, weak, u] = await Promise.all([
    ensureRatings(user.id),
    prisma.skillMastery.findMany({
      where: { userId: user.id, correct: { gt: 0 } },
      orderBy: { mastery: 'asc' },
      take: 3,
      include: { skill: { select: { name: true } } },
    }),
    prisma.user.findUnique({ where: { id: user.id }, select: { targetScore: true, examDate: true } }),
  ]);
  const weakAll = weak.length
    ? weak
    : await prisma.skillMastery.findMany({ where: { userId: user.id }, orderBy: { mastery: 'asc' }, take: 3, include: { skill: { select: { name: true } } } });
  const math = displayRating('MATH', ratings.MATH.rating);
  const rw = displayRating('RW', ratings.RW.rating);
  const lines = [
    `STUDENT: ${user.firstName || 'student'}; language: ${LANG_NAME[user.lang] ?? LANG_NAME.uz}.`,
    `Current estimated scores: Math ${math}, Reading and Writing ${rw}, total ${math + rw} (scale 400–1600; ${ratings.OVERALL.games} answered questions).`,
    u?.targetScore ? `Target score: ${u.targetScore}.` : '',
    u?.examDate ? `Exam date: ${u.examDate.toISOString().slice(0, 10)}.` : '',
    weakAll.length ? `Weakest skills: ${weakAll.map((w) => `${w.skill.name} (${Math.round(w.mastery)}/100)`).join(', ')}.` : '',
    CHANNEL_RULES[channel],
  ];
  return lines.filter(Boolean).join('\n');
}

/** O'quvchi javob bergan aniq savol (Xatolar daftari, sessiya natijasi) — AI'ga tushuntirish uchun. */
async function questionContext(userId: string, answerId: string): Promise<{ ctx: MsgContext; image?: ChatImage }> {
  const row = await prisma.attemptAnswer.findUnique({
    where: { id: answerId },
    include: {
      attempt: { select: { userId: true, status: true } },
      template: { select: { title: true, imageId: true, difficulty: true, skill: { select: { name: true } } } },
    },
  });
  if (!row || row.attempt.userId !== userId) throw notFound('Savol');
  if (!row.answeredAt && row.attempt.status !== 'FINISHED') {
    throw new HttpError(409, 'Avval savolga javob bering — keyin AI tushuntirib beradi', 'NOT_ANSWERED');
  }
  const v = await getVariant(row);
  const text = [
    `The student is asking about this question (${row.template.skill.name}, ${row.template.difficulty.toLowerCase()}):`,
    questionAsText({ passage: v.passage, stem: v.stem, choices: v.choices?.map((c) => c.text), svg: v.svg, spr: v.type === 'SPR' }),
    `Correct answer: ${v.correctDisplay}`,
    `Student's answer: ${row.answer ?? '(no answer)'} — ${row.isCorrect ? 'correct' : 'wrong'}`,
    v.explanation ? `Official explanation: ${v.explanation}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  let image: ChatImage | undefined;
  if (row.template.imageId) {
    const m = await prisma.media.findUnique({ where: { id: row.template.imageId } });
    if (m) image = { mime: m.mime as ChatImage['mime'], data: Buffer.from(m.data).toString('base64') };
  }
  return { ctx: { kind: 'question', answerId, title: row.template.title, text }, image };
}

/** O'quvchining shu ko'nikmadagi so'nggi xatolari (matn ko'rinishida). */
export async function recentMistakes(userId: string, skillId: string, n = 4): Promise<string[]> {
  const rows = await prisma.attemptAnswer.findMany({
    where: { attempt: { userId }, isCorrect: false, answer: { not: null }, template: { skillId } },
    orderBy: { answeredAt: 'desc' },
    take: n,
  });
  const out: string[] = [];
  for (const r of rows) {
    try {
      const v = await getVariant(r);
      out.push(
        `${questionAsText({ passage: v.passage, stem: v.stem, choices: v.choices?.map((c) => c.text), svg: v.svg, spr: v.type === 'SPR' })}\nCorrect answer: ${v.correctDisplay}. Student's answer: ${r.answer}.`,
      );
    } catch {
      // eski versiya tiklanmasa — o'tkazib yuboramiz
    }
  }
  return out;
}

function withContext(m: Pick<AiMessage, 'content' | 'context'>): string {
  const c = m.context as MsgContext | null;
  return c?.text ? `${c.text}\n\n${m.content}` : m.content;
}

async function buildMessages(userId: string, current: Anthropic.Beta.BetaContentBlockParam[]): Promise<Anthropic.Beta.BetaMessageParam[]> {
  const rows = (await prisma.aiMessage.findMany({ where: { userId, hidden: false }, orderBy: [{ createdAt: 'desc' }, { role: 'desc' }], take: 16 })).reverse();
  // Faqat oxirgi rasm modelga qayta yuboriladi (qolganlari — "[rasm]"), token tejash uchun
  const lastImg = [...rows].reverse().find((r) => r.role === 'USER' && r.imageId);
  const imgRow = lastImg && rows.indexOf(lastImg) >= rows.length - 6 ? lastImg : null;
  const img = imgRow?.imageId ? await prisma.media.findUnique({ where: { id: imgRow.imageId } }) : null;

  const msgs: Anthropic.Beta.BetaMessageParam[] = [];
  const push = (role: 'user' | 'assistant', blocks: Anthropic.Beta.BetaContentBlockParam[]) => {
    const last = msgs[msgs.length - 1];
    if (last && last.role === role && Array.isArray(last.content)) last.content.push(...blocks);
    else msgs.push({ role, content: blocks });
  };
  for (const r of rows) {
    if (r.role === 'USER') {
      const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
      if (r === imgRow && img) {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: img.mime as ChatImage['mime'], data: Buffer.from(img.data).toString('base64') } });
      } else if (r.imageId) {
        blocks.push({ type: 'text', text: '[The student sent a photo here.]' });
      }
      blocks.push({ type: 'text', text: withContext(r) || '(photo)' });
      push('user', blocks);
    } else {
      push('assistant', [{ type: 'text', text: r.content }]);
    }
  }
  // Tarix assistant bilan boshlanmasligi kerak
  while (msgs.length && msgs[0].role === 'assistant') msgs.shift();
  push('user', current);
  return msgs;
}

async function callTutor(user: TutorUser, channel: Channel, current: Anthropic.Beta.BetaContentBlockParam[]) {
  const s = (await getSettings()).ai;
  const [messages, block] = await Promise.all([buildMessages(user.id, current), studentBlock(user, channel)]);
  let res;
  try {
    res = await aiClient()
      .beta.messages.stream({
        model: s.chatModel,
        max_tokens: 8000,
        ...fallbackOpts(s.chatModel),
        // suhbat o'sib boradi — oxirgi blok avtomatik keshlanadi (keyingi xabar arzonroq)
        cache_control: { type: 'ephemeral' },
        output_config: { effort: 'medium' },
        system: [
          { type: 'text', text: TUTOR_SYSTEM, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: block },
        ],
        messages,
      })
      .finalMessage();
  } catch (e) {
    aiError(e);
  }
  let text = res.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  if (res.stop_reason === 'refusal' || !text) text = 'Kechirasiz, bu savolga javob bera olmayman. SAT bo\'yicha boshqa savol bering 🙂';
  if (res.stop_reason === 'max_tokens') text += ' …';
  if (channel === 'bot') text = plainForTelegram(text);
  return { text, usage: res.usage, model: res.model };
}

async function storeImage(userId: string, image: ChatImage): Promise<string> {
  const buf = Buffer.from(image.data, 'base64');
  if (buf.length > 5 * 1024 * 1024) throw new HttpError(413, 'Rasm juda katta (5 MB gacha)');
  const m = await prisma.media.create({ data: { mime: image.mime, size: buf.length, data: buf, createdById: userId } });
  return m.id;
}

async function saveExchange(
  user: TutorUser,
  channel: Channel,
  userMsg: { content: string; context?: MsgContext; imageId?: string | null },
  reply: Awaited<ReturnType<typeof callTutor>>,
) {
  // Bir tranzaksiyada Postgres now() bir xil — tartib aniq bo'lishi uchun vaqtni o'zimiz beramiz
  const t0 = Date.now();
  const [u, a] = await prisma.$transaction([
    prisma.aiMessage.create({
      data: {
        userId: user.id,
        role: 'USER',
        createdAt: new Date(t0),
        channel,
        content: userMsg.content,
        context: (userMsg.context ?? undefined) as Prisma.InputJsonValue | undefined,
        imageId: userMsg.imageId ?? null,
      },
    }),
    prisma.aiMessage.create({
      data: {
        userId: user.id,
        role: 'ASSISTANT',
        createdAt: new Date(t0 + 1),
        channel,
        content: reply.text,
        inTokens: totalIn(reply.usage),
        outTokens: reply.usage.output_tokens,
        costUsd: usageCost(reply.model, reply.usage),
      },
    }),
  ]);
  return [u, a];
}

// ───────────────────────── Ochiq funksiyalar ─────────────────────────

/** AI ustozga xabar: matn, ixtiyoriy rasm (savol fotosi) va ixtiyoriy savol konteksti. */
export async function sendChat(
  user: TutorUser,
  input: { text: string; image?: ChatImage | null; answerId?: string | null; channel: Channel },
) {
  await guard(user);
  const text = input.text.trim().slice(0, 4000);
  if (!text && !input.image) throw new HttpError(400, "Xabar bo'sh");
  const q = input.answerId ? await questionContext(user.id, input.answerId) : null;
  const current: Anthropic.Beta.BetaContentBlockParam[] = [];
  const img = input.image ?? q?.image;
  if (img) current.push({ type: 'image', source: { type: 'base64', media_type: img.mime, data: img.data } });
  const shown = text || (input.image ? '📷' : '');
  current.push({ type: 'text', text: q?.ctx.text ? `${q.ctx.text}\n\n${shown}` : text || 'Please look at this question and help me solve it.' });

  const reply = await callTutor(user, input.channel, current);
  const imageId = input.image ? await storeImage(user.id, input.image) : null;
  const [u, a] = await saveExchange(user, input.channel, { content: shown, context: q?.ctx, imageId }, reply);
  return { messages: [messageView(u), messageView(a)] };
}

/** Zaif mavzu bo'yicha qisqa dars: o'quvchining shu mavzudagi xatolari tahlili bilan. */
export async function teachSkill(user: TutorUser, skillId: string, channel: Channel) {
  await guard(user);
  const sk = skillById(skillId);
  if (!sk) throw notFound("Ko'nikma");
  const [mistakes, mastery] = await Promise.all([
    recentMistakes(user.id, skillId, 4),
    prisma.skillMastery.findUnique({ where: { userId_skillId: { userId: user.id, skillId } } }),
  ]);
  const answered = mastery ? mastery.correct + mastery.wrong : 0;
  const ctxText = [
    `[Lesson request] Teach the student the SAT skill "${sk.name}" (${sk.domainName}, ${sk.section === 'MATH' ? 'Math' : 'Reading and Writing'}).`,
    answered ? `Their results in this skill: ${mastery!.correct} of ${answered} correct.` : 'They have little practice in this skill yet.',
    mistakes.length ? `Their recent mistakes in this skill:\n${mistakes.map((m, i) => `--- Mistake ${i + 1} ---\n${m}`).join('\n')}` : '',
    `Write a short lesson in the student's language: (1) what this skill tests and how it looks on the SAT; (2) the key rules or strategy as 3–5 bullet points; ` +
      `(3) ${mistakes.length ? 'for each mistake above, the likely misconception and the right reasoning in one or two sentences; ' : ''}` +
      `(4) one short worked example with a new question; (5) a 3-point checklist for next time. Keep it under about 350 words. ` +
      `End by suggesting practice with the «✨ Yangi savollar» button (in the student's language).`,
  ]
    .filter(Boolean)
    .join('\n\n');
  const shown = `📚 «${sk.name}» mavzusini tushuntirib bering`;
  const reply = await callTutor(user, channel, [{ type: 'text', text: `${ctxText}\n\n${shown}` }]);
  const [u, a] = await saveExchange(user, channel, { content: shown, context: { kind: 'lesson', skillId, title: sk.name, text: ctxText } }, reply);
  return { messages: [messageView(u), messageView(a)] };
}

export async function listMessages(userId: string, limit = 60) {
  const rows = await prisma.aiMessage.findMany({ where: { userId, hidden: false }, orderBy: [{ createdAt: 'desc' }, { role: 'desc' }], take: limit });
  return rows.reverse().map(messageView);
}

export async function clearChat(userId: string): Promise<void> {
  await prisma.aiMessage.updateMany({ where: { userId, hidden: false }, data: { hidden: true } });
}

export function messageView(m: AiMessage) {
  const c = m.context as MsgContext | null;
  return {
    id: m.id,
    role: m.role === 'USER' ? ('user' as const) : ('assistant' as const),
    content: m.content,
    channel: m.channel,
    createdAt: m.createdAt,
    context: c ? { kind: c.kind, title: c.title ?? null, skillId: c.skillId ?? null } : null,
    imageUrl: m.imageId ? `/api/media/${m.imageId}` : null,
  };
}

// ───────────────────────── Telegram ─────────────────────────

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', n: 'ⁿ', x: 'ˣ' };

/** Model baribir LaTeX/Markdown yozib yuborsa — Telegram uchun oddiy matnga. */
export function plainForTelegram(s: string): string {
  return s
    .replace(/\$\$?([^$]+?)\$\$?/g, (_m, tex: string) =>
      tex
        .replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
        .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
        .replace(/\^\{([0-9nx-]+)\}|\^([0-9n])/g, (_x, a: string | undefined, b: string | undefined) => {
          const p = a ?? b ?? '';
          return p.split('').every((ch) => SUP[ch]) ? p.split('').map((ch) => SUP[ch]).join('') : `^${p}`;
        })
        .replace(/\\(le|leq)\b/g, '≤')
        .replace(/\\(ge|geq)\b/g, '≥')
        .replace(/\\(ne|neq)\b/g, '≠')
        .replace(/\\(cdot|times)\b/g, '·')
        .replace(/\\pi\b/g, 'π')
        .replace(/\\pm\b/g, '±')
        .replace(/\\(left|right)/g, '')
        .replace(/\\text\{([^{}]*)\}/g, '$1')
        .replace(/\\,|\\;|\\!/g, ' ')
        .replace(/[{}]/g, ''),
    )
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^- /gm, '• ')
    .replace(/\\\$/g, '$');
}

/** Telegram xabari 4096 belgigacha — paragraf chegarasidan bo'lamiz. */
export function splitMessage(text: string, max = 4000): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n\n', max);
    if (cut < max * 0.5) cut = rest.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = rest.lastIndexOf(' ', max);
    if (cut <= 0) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}
