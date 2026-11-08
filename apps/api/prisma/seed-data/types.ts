import type { TemplateSpecInput } from '@sat/generator';

export interface SeedTemplate {
  title: string;
  section: 'RW' | 'MATH';
  domainId: string;
  skillId: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  spec: TemplateSpecInput;
}
