export type TemplateErrorCode = 'SCHEMA' | 'EVAL' | 'CONSTRAINTS' | 'FORMAT' | 'SAMPLING';

/** Shablonning o'zi noto'g'ri bo'lganda (operator tuzatishi kerak). */
export class TemplateError extends Error {
  readonly code: TemplateErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: TemplateErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'TemplateError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Bitta urinish rad etildi (cheklov bajarilmadi, nolga bo'lish, takroriy variant...).
 * Generator yangi tasodifiy qiymatlar bilan qayta urinadi.
 */
export class RejectSignal extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = 'RejectSignal';
    this.reason = reason;
  }
}
