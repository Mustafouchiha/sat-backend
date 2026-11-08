import { all, create, type EvalFunction } from 'mathjs';
import { RejectSignal, TemplateError } from './errors';
import { cleanNumber, type Value } from './format';

/**
 * Xavfsiz mathjs nusxasi: eval ishlatilmaydi, import/parse/evaluate kabi
 * xavfli funksiyalar ifoda ichidan o'chirilgan (mathjs security tavsiyasi).
 */
const math = create(all, { predictable: true });

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

math.import(
  {
    isInt: (x: number) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x - Math.round(x)) < 1e-9,
    sind: (x: number) => cleanNumber(Math.sin(toRad(x))),
    cosd: (x: number) => cleanNumber(Math.cos(toRad(x))),
    tand: (x: number) => cleanNumber(Math.tan(toRad(x))),
    asind: (x: number) => toDeg(Math.asin(x)),
    acosd: (x: number) => toDeg(Math.acos(x)),
    atand: (x: number) => toDeg(Math.atan(x)),
    hyp: (a: number, b: number) => Math.hypot(a, b),
  },
  { override: false },
);

const compileFn = math.compile;
const isResultSet = math.isResultSet;
const isFraction = math.isFraction;
const isBigNumber = math.isBigNumber;
const isComplex = math.isComplex;

const disabled = (name: string) => () => {
  throw new Error(`${name} funksiyasi o'chirilgan`);
};

math.import(
  {
    import: disabled('import'),
    createUnit: disabled('createUnit'),
    evaluate: disabled('evaluate'),
    parse: disabled('parse'),
    compile: disabled('compile'),
    simplify: disabled('simplify'),
    derivative: disabled('derivative'),
    resolve: disabled('resolve'),
    reviver: disabled('reviver'),
  },
  { override: true },
);

const RESERVED = new Set([
  'answer', 'v', 'e', 'E', 'i', 'pi', 'PI', 'tau', 'phi', 'true', 'false', 'null',
  'Infinity', 'NaN', 'undefined', 'end', 'to', 'in', 'mod', 'not', 'and', 'or', 'xor',
]);

/** O'zgaruvchi nomi mathjs funksiyasi yoki konstantasi bilan to'qnashmasligi kerak. */
export function reservedNameReason(name: string): string | null {
  if (RESERVED.has(name)) return `"${name}" nomi band (zahiralangan)`;
  const member = (math as unknown as Record<string, unknown>)[name];
  if (typeof member === 'function') return `"${name}" — mathjs funksiyasi nomi, boshqa nom tanlang`;
  return null;
}

const cache = new Map<string, EvalFunction>();

export function compileExpr(expr: string): EvalFunction {
  let fn = cache.get(expr);
  if (!fn) {
    try {
      fn = compileFn(expr);
    } catch (e) {
      throw new TemplateError('EVAL', `Ifodada sintaksis xatosi "${expr}": ${(e as Error).message}`, { expr });
    }
    if (cache.size > 5000) cache.clear();
    cache.set(expr, fn);
  }
  return fn;
}

function normalize(res: unknown, where: string, expr: string): Value {
  if (typeof res === 'number') {
    if (!Number.isFinite(res)) throw new RejectSignal('nan');
    return cleanNumber(res);
  }
  if (typeof res === 'boolean' || typeof res === 'string') return res;
  if (isResultSet(res)) {
    const entries = (res as unknown as { entries: unknown[] }).entries;
    return normalize(entries[entries.length - 1], where, expr);
  }
  if (isFraction(res) || isBigNumber(res)) {
    return normalize(Number((res as { valueOf(): unknown }).valueOf()), where, expr);
  }
  if (isComplex(res)) throw new RejectSignal('nan');
  throw new TemplateError('EVAL', `${where}: ifoda son, matn yoki mantiqiy qiymat qaytarishi kerak ("${expr}")`, { expr });
}

/**
 * Ifodani hisoblash. Sintaksis xatosi yoki noma'lum o'zgaruvchi — TemplateError (darhol to'xtaydi),
 * qiymatga bog'liq xatolar (NaN, nolga bo'lish) — RejectSignal (qayta urinish).
 */
export function evaluate(expr: string, scope: Record<string, Value>, where: string): Value {
  const fn = compileExpr(expr);
  let res: unknown;
  try {
    res = fn.evaluate({ ...scope });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    if (/Undefined (symbol|function)/i.test(msg) || /disabled|o'chirilgan/i.test(msg)) {
      throw new TemplateError('EVAL', `${where}: ${msg} ("${expr}")`, { expr });
    }
    throw new RejectSignal(`error:${where}`);
  }
  return normalize(res, where, expr);
}
