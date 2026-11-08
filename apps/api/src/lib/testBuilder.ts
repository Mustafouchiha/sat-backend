import type { Difficulty, ModuleVariant, Prisma, Section, TestType } from '@prisma/client';
import { distributeByWeight, SAT_STRUCTURE, TAXONOMY } from '@sat/shared';

export interface ModuleSpec {
  order: number;
  section: Section;
  stage: number;
  variant: ModuleVariant;
  durationSec: number;
  items: Array<{ templateId?: string | null; poolDomainId?: string | null; poolSkillId?: string | null; poolDifficulty?: Difficulty | null }>;
}

type Mix = Record<Difficulty, number>;

const MIX: Record<'MIXED' | ModuleVariant, Mix> = {
  MIXED: { EASY: 0.33, MEDIUM: 0.34, HARD: 0.33 },
  STANDARD: { EASY: 0.33, MEDIUM: 0.34, HARD: 0.33 },
  EASY: { EASY: 0.5, MEDIUM: 0.4, HARD: 0.1 },
  HARD: { EASY: 0.1, MEDIUM: 0.4, HARD: 0.5 },
};

const DIFF_ORDER: Record<Difficulty, number> = { EASY: 0, MEDIUM: 1, HARD: 2 };

/** Domen ulushlari va qiyinlik nisbati bo'yicha pool elementlari (oson -> qiyin tartibda). */
export function poolItems(
  section: Section,
  count: number,
  mix: Mix,
  filter?: { domainIds?: string[]; skillIds?: string[] },
): ModuleSpec['items'] {
  if (filter?.skillIds?.length) {
    const skills = filter.skillIds;
    const per = distributeByWeight(count, skills.map((id) => ({ id, weight: 1 })));
    return skills.flatMap((sk) => {
      const diffs = distributeByWeight(per[sk], (Object.keys(mix) as Difficulty[]).map((d) => ({ id: d, weight: mix[d] })));
      const domain = TAXONOMY.find((d) => d.skills.some((s) => s.id === sk));
      return (Object.keys(diffs) as Difficulty[]).flatMap((d) =>
        Array.from({ length: diffs[d] }, () => ({ poolDomainId: domain?.id ?? null, poolSkillId: sk, poolDifficulty: d })),
      );
    }).sort((a, b) => DIFF_ORDER[a.poolDifficulty] - DIFF_ORDER[b.poolDifficulty]);
  }
  const domains = TAXONOMY.filter((d) => d.section === section && (!filter?.domainIds?.length || filter.domainIds.includes(d.id)));
  const perDomain = distributeByWeight(count, domains.map((d) => ({ id: d.id, weight: d.weight })));
  const items: Array<{ poolDomainId: string; poolDifficulty: Difficulty }> = [];
  for (const d of domains) {
    const diffs = distributeByWeight(perDomain[d.id], (Object.keys(mix) as Difficulty[]).map((x) => ({ id: x, weight: mix[x] })));
    for (const diff of Object.keys(diffs) as Difficulty[]) {
      for (let i = 0; i < diffs[diff]; i++) items.push({ poolDomainId: d.id, poolDifficulty: diff });
    }
  }
  return items.sort((a, b) => DIFF_ORDER[a.poolDifficulty] - DIFF_ORDER[b.poolDifficulty]);
}

export interface AutoTestInput {
  type: TestType;
  sections: Section[];
  adaptive: boolean;
  questionsPerModule?: number;
  minutesPerModule?: number;
  domainIds?: string[];
  skillIds?: string[];
  difficulty?: Difficulty | null;
}

/** Real SAT tuzilishiga mos modullar: R&W 27 savol/32 daq, Math 22 savol/35 daq; adaptivda 2-modul EASY/HARD. */
export function buildAutoModules(inp: AutoTestInput): ModuleSpec[] {
  const modules: ModuleSpec[] = [];
  let order = 0;
  const singleModule = inp.type === 'MODULE' || inp.type === 'TOPIC' || inp.type === 'QUICK' || inp.type === 'HOMEWORK';
  for (const section of inp.sections) {
    const std = SAT_STRUCTURE[section];
    const qn = inp.questionsPerModule ?? (inp.type === 'QUICK' ? 10 : std.questionsPerModule);
    const minutes = inp.minutesPerModule ?? (inp.type === 'QUICK' ? 15 : Math.round((std.minutesPerModule * qn) / std.questionsPerModule));
    const durationSec = Math.max(60, minutes * 60);
    const filter = { domainIds: inp.domainIds, skillIds: inp.skillIds };
    const fixedMix: Mix | null = inp.difficulty ? { EASY: 0, MEDIUM: 0, HARD: 0, [inp.difficulty]: 1 } : null;

    modules.push({
      order: order++,
      section,
      stage: 1,
      variant: 'STANDARD',
      durationSec,
      items: poolItems(section, qn, fixedMix ?? MIX.MIXED, filter),
    });
    if (singleModule) continue;
    const stage2Order = order++;
    if (inp.adaptive) {
      for (const variant of ['EASY', 'HARD'] as const) {
        modules.push({ order: stage2Order, section, stage: 2, variant, durationSec, items: poolItems(section, qn, MIX[variant], filter) });
      }
    } else {
      modules.push({ order: stage2Order, section, stage: 2, variant: 'STANDARD', durationSec, items: poolItems(section, qn, fixedMix ?? MIX.MIXED, filter) });
    }
  }
  return modules;
}

export function modulesCreateInput(modules: ModuleSpec[]): Prisma.TestModuleCreateWithoutTestInput[] {
  return modules.map((m) => ({
    order: m.order,
    section: m.section,
    stage: m.stage,
    variant: m.variant,
    durationSec: m.durationSec,
    items: {
      create: m.items.map((it, i) => ({
        order: i,
        templateId: it.templateId ?? null,
        poolDomainId: it.poolDomainId ?? null,
        poolSkillId: it.poolSkillId ?? null,
        poolDifficulty: it.poolDifficulty ?? null,
      })),
    },
  }));
}
