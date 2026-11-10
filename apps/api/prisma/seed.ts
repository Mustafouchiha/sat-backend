/**
 * Ishlab chiqish uchun boshlang'ich ma'lumotlar:
 *  - SAT taksonomiyasi (domen, ko'nikma), ball shkalalari, yutuqlar
 *  - 35 ta namunaviy shablon (Math har domenda 5+, R&W 10) — markaz o'zi tuzgan, rasmiy savollar emas
 *  - 1 ta to'liq adaptiv mock test + tezkor/mavzu testlari
 *  - Har roldan test foydalanuvchi va "SAT-1 kechki" guruhi
 *
 * Ishga tushirish: npm run db:seed   (qayta ishga tushirish xavfsiz — mavjudlari o'tkazib yuboriladi)
 * Production: SEED_DEMO=false npm run db:seed — test foydalanuvchilar, demo guruh va topshiriq yaratilmaydi.
 */
import 'dotenv/config';
import { PrismaClient, type Prisma } from '@prisma/client';
import { parseSpec, runChecks } from '@sat/generator';
import { ACHIEVEMENTS, defaultScaleRows, initialQuestionRating, SAT_STRUCTURE, TAXONOMY } from '@sat/shared';
import { buildAutoModules, modulesCreateInput } from '../src/lib/testBuilder';
import { MATH_TEMPLATES } from './seed-data/math';
import { RW_TEMPLATES } from './seed-data/rw';

const prisma = new PrismaClient();

const TEST_USERS = [
  { tgId: 100000001n, firstName: 'Admin', username: 'sat_admin', roles: ['SUPER_ADMIN', 'OPERATOR'] as const },
  { tgId: 100000002n, firstName: 'Operator', username: 'sat_operator', roles: ['OPERATOR'] as const },
  { tgId: 100000003n, firstName: 'Nodira', lastName: 'Ustoz', username: 'sat_teacher', roles: ['TEACHER'] as const },
  { tgId: 100000004n, firstName: 'Aziz', lastName: 'Talaba', username: 'sat_student', roles: ['STUDENT'] as const },
  { tgId: 100000005n, firstName: 'Madina', lastName: 'Talaba', username: 'sat_student2', roles: ['STUDENT'] as const },
  { tgId: 100000006n, firstName: 'Ota-ona', username: 'sat_parent', roles: ['PARENT'] as const },
];

async function seedTaxonomy() {
  for (const [i, d] of TAXONOMY.entries()) {
    await prisma.domain.upsert({
      where: { id: d.id },
      create: { id: d.id, section: d.section, name: d.name, weight: d.weight, order: i },
      update: { section: d.section, name: d.name, weight: d.weight, order: i },
    });
    for (const [j, s] of d.skills.entries()) {
      await prisma.skill.upsert({
        where: { id: s.id },
        create: { id: s.id, domainId: d.id, name: s.name, order: j },
        update: { domainId: d.id, name: s.name, order: j },
      });
    }
  }
  console.log(`✓ Taksonomiya: ${TAXONOMY.length} domen, ${TAXONOMY.reduce((s, d) => s + d.skills.length, 0)} ko'nikma`);
}

async function seedScales() {
  const existing = await prisma.scoreScale.count();
  if (existing > 0) return console.log('• Ball shkalasi allaqachon bor');
  const data: Prisma.ScoreScaleCreateManyInput[] = [];
  for (const section of ['RW', 'MATH'] as const) {
    const max = SAT_STRUCTURE[section].questionsPerModule * 2;
    for (const variant of ['STANDARD', 'EASY', 'HARD'] as const) {
      for (const r of defaultScaleRows(max, variant)) data.push({ section, variant, raw: r.raw, scaled: r.scaled });
    }
  }
  await prisma.scoreScale.createMany({ data });
  console.log(`✓ Ball shkalasi: ${data.length} qator (admin panelda tahrirlanadi)`);
}

async function seedAchievements() {
  for (const [i, a] of ACHIEVEMENTS.entries()) {
    await prisma.achievement.upsert({
      where: { code: a.code },
      create: { code: a.code, name: a.name, description: a.description, icon: a.icon, order: i },
      update: { name: a.name, description: a.description, icon: a.icon, order: i },
    });
  }
  console.log(`✓ Yutuqlar: ${ACHIEVEMENTS.length}`);
}

async function seedUsers() {
  const ids: Record<string, string> = {};
  for (const u of TEST_USERS) {
    const user = await prisma.user.upsert({
      where: { tgId: u.tgId },
      create: {
        tgId: u.tgId,
        firstName: u.firstName,
        lastName: 'lastName' in u ? u.lastName : null,
        username: u.username,
        roles: [...u.roles],
        status: 'ACTIVE',
      },
      update: { roles: [...u.roles], status: 'ACTIVE' },
    });
    ids[u.username] = user.id;
    for (const type of ['OVERALL', 'MATH', 'RW'] as const) {
      await prisma.rating.upsert({ where: { userId_type: { userId: user.id, type } }, create: { userId: user.id, type }, update: {} });
    }
  }
  console.log(`✓ Test foydalanuvchilar: ${TEST_USERS.length} (tgId 100000001..100000006)`);
  return ids;
}

async function seedGroup(ids: Record<string, string>) {
  const group = await prisma.group.upsert({
    where: { inviteCode: 'SAT1EV' },
    create: { name: 'SAT-1 kechki', inviteCode: 'SAT1EV' },
    update: {},
  });
  const members: Array<[string, 'STUDENT' | 'TEACHER']> = [
    [ids.sat_teacher, 'TEACHER'],
    [ids.sat_student, 'STUDENT'],
    [ids.sat_student2, 'STUDENT'],
  ];
  for (const [userId, role] of members) {
    await prisma.groupMember.upsert({
      where: { groupId_userId: { groupId: group.id, userId } },
      create: { groupId: group.id, userId, role },
      update: { role },
    });
  }
  const link = await prisma.parentLink.findFirst({ where: { studentId: ids.sat_student, parentId: ids.sat_parent } });
  if (!link) {
    await prisma.parentLink.create({ data: { code: 'PARENTDEMO', studentId: ids.sat_student, parentId: ids.sat_parent, linkedAt: new Date() } });
  }
  console.log(`✓ Guruh "SAT-1 kechki" (taklif kodi: SAT1EV)`);
  return group;
}

/** Kalitlar tartibidan qat'i nazar solishtirish (Postgres jsonb kalitlarni qayta tartiblaydi). */
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

async function seedTemplates(operatorId: string | null) {
  let created = 0;
  let updated = 0;
  for (const t of [...MATH_TEMPLATES, ...RW_TEMPLATES]) {
    const spec = parseSpec(t.spec);
    const exists = await prisma.questionTemplate.findFirst({ where: { title: t.title } });
    if (exists) {
      // Seed shabloni o'zgargan bo'lsa (masalan, rasm qo'shilgan) yangi versiya sifatida yangilanadi —
      // faqat uni hech kim qo'lda tahrirlamagan bo'lsa (updatedById seed bilan bir xil).
      const untouched = exists.tags.includes('seed') && exists.updatedById === operatorId;
      if (untouched && stableJson(exists.spec) !== stableJson(spec)) {
        const report = runChecks(spec, 200);
        if (!report.ok) throw new Error(`Seed shablon tekshiruvdan o'tmadi: ${t.title}\n${report.errors.join('\n')}`);
        const version = exists.version + 1;
        await prisma.questionTemplate.update({
          where: { id: exists.id },
          data: {
            spec: spec as unknown as Prisma.InputJsonValue,
            version,
            revisions: { create: { version, spec: spec as unknown as Prisma.InputJsonValue, createdById: operatorId } },
          },
        });
        updated++;
      }
      continue;
    }
    const report = runChecks(spec, 200);
    if (!report.ok) throw new Error(`Seed shablon tekshiruvdan o'tmadi: ${t.title}\n${report.errors.join('\n')}`);
    await prisma.questionTemplate.create({
      data: {
        title: t.title,
        section: t.section,
        domainId: t.domainId,
        skillId: t.skillId,
        difficulty: t.difficulty,
        status: 'PUBLISHED',
        spec: spec as unknown as Prisma.InputJsonValue,
        rating: initialQuestionRating(t.difficulty),
        createdById: operatorId,
        updatedById: operatorId,
        tags: ['seed'],
        revisions: { create: { version: 1, spec: spec as unknown as Prisma.InputJsonValue, createdById: operatorId } },
      },
    });
    created++;
  }
  console.log(`✓ Shablonlar: ${created} ta yangi, ${updated} ta yangilangan (jami ${MATH_TEMPLATES.length + RW_TEMPLATES.length})`);
}

async function seedTests(operatorId: string | null) {
  const defs: Array<{ title: string; description: string; isPublic: boolean } & Parameters<typeof buildAutoModules>[0]> = [
    {
      title: "To'liq Digital SAT Mock #1",
      description: "Real SAT kabi: R&W 2×27 savol (32 daq), 10 daq tanaffus, Math 2×22 savol (35 daq). 2-modul adaptiv.",
      type: 'MOCK',
      sections: ['RW', 'MATH'],
      adaptive: true,
      isPublic: true,
    },
    {
      title: 'Math bo\'limi (adaptiv)',
      description: 'Faqat Math: 2 modul × 22 savol, 35 daqiqadan.',
      type: 'SECTION',
      sections: ['MATH'],
      adaptive: true,
      isPublic: true,
    },
    {
      title: 'Tezkor mashq: 10 ta Math savol',
      description: '15 daqiqada 10 ta aralash savol.',
      type: 'QUICK',
      sections: ['MATH'],
      adaptive: false,
      isPublic: true,
    },
    {
      title: 'Mavzu testi: Algebra',
      description: 'Faqat Algebra domeni, 12 savol.',
      type: 'TOPIC',
      sections: ['MATH'],
      adaptive: false,
      questionsPerModule: 12,
      minutesPerModule: 18,
      domainIds: ['MATH_ALG'],
      isPublic: true,
    },
  ];
  for (const d of defs) {
    if (await prisma.test.findFirst({ where: { title: d.title } })) continue;
    const modules = buildAutoModules(d);
    await prisma.test.create({
      data: {
        title: d.title,
        description: d.description,
        type: d.type,
        adaptive: d.adaptive,
        isPublic: d.isPublic,
        createdById: operatorId,
        modules: { create: modulesCreateInput(modules) },
      },
    });
  }
  console.log(`✓ Testlar: ${defs.length} (shu jumladan 1 ta to'liq adaptiv mock)`);
}

async function main() {
  const demo = process.env.SEED_DEMO !== 'false';
  await seedTaxonomy();
  await seedScales();
  await seedAchievements();
  if (!demo) {
    // Production: faqat kontent (savollar banki va testlar), test foydalanuvchilarsiz
    await seedTemplates(null);
    await seedTests(null);
    console.log("\nTayyor (SEED_DEMO=false): test foydalanuvchilar va demo guruh yaratilmadi.");
    return;
  }
  const ids = await seedUsers();
  const group = await seedGroup(ids);
  await seedTemplates(ids.sat_operator);
  await seedTests(ids.sat_operator);
  const mock = await prisma.test.findFirst({ where: { type: 'MOCK' } });
  if (mock && !(await prisma.assignment.findFirst({ where: { groupId: group.id, testId: mock.id } }))) {
    await prisma.assignment.create({
      data: {
        testId: mock.id,
        groupId: group.id,
        title: 'Haftalik mock test',
        dueAt: new Date(Date.now() + 7 * 86400_000),
        maxAttempts: 2,
        createdById: ids.sat_teacher,
      },
    });
    console.log('✓ Guruhga topshiriq berildi');
  }
  console.log('\nTayyor! Lokal ishlab chiqishda (ALLOW_DEV_LOGIN=true) /api/auth/dev orqali tgId bilan kirish mumkin.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
