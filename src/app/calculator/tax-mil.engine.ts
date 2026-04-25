export type TaxMilCalculationMode = 'totalToSend' | 'desiredNet';

export interface MonetaryBreakdown {
  total: number;
  tax: number;
  net: number;
}

export interface TaxMilResult extends MonetaryBreakdown {
  isExempt: boolean;
  exemptCovered: number;
  taxableBase: number;
  taxPercentageOfTotal: number;
}

export interface TaxMilGoalOption {
  id: string;
  title: string;
  total: number;
  tax: number;
  net: number;
  extraNet: number;
}

export abstract class FinancialCalculatorEngine<
  TMode extends string,
  TResult extends MonetaryBreakdown,
> {
  protected constructor(
    readonly taxRate: number,
    readonly locale: string,
  ) {}

  digitsOnly(input: string): string {
    return input.replaceAll(/\D/g, '');
  }

  amountFrom(input: string): number {
    const cleaned = this.digitsOnly(input);
    return cleaned ? Number(cleaned) : 0;
  }

  formatGroupedDigits(digits: string): string {
    if (!digits) {
      return '';
    }

    return Number(digits).toLocaleString(this.locale);
  }

  formatCOP(value: number): string {
    return '$ ' + Math.max(0, Math.round(value)).toLocaleString(this.locale);
  }

  protected splitTaxFromGross(grossAmount: number): number {
    return Math.round((grossAmount * this.taxRate) / (1 + this.taxRate));
  }

  protected roundUp(value: number, step: number): number {
    if (step <= 0) {
      return value;
    }

    const remainder = value % step;
    return remainder === 0 ? value : value + (step - remainder);
  }

  abstract breakdown(
    mode: TMode,
    inputAmount: number,
    isExempt: boolean,
  ): TResult;
}

export class TaxMilCalculatorEngine extends FinancialCalculatorEngine<
  TaxMilCalculationMode,
  TaxMilResult
> {
  readonly EXEMPT_LIMIT_UVT = 350;
  readonly UVT_VALUE_COP = 52_374;
  readonly exemptLimitCOP = Math.round(
    this.EXEMPT_LIMIT_UVT * this.UVT_VALUE_COP,
  );

  constructor() {
    super(4 / 1000, 'es-CO');
  }

  breakdown(
    mode: TaxMilCalculationMode,
    inputAmount: number,
    isExempt: boolean,
  ): TaxMilResult {
    if (mode === 'desiredNet') {
      return this.requiredTotalForDesiredNet(inputAmount, isExempt);
    }

    return this.breakdownForTotal(inputAmount, isExempt);
  }

  breakdownForTotal(total: number, isExempt = false): TaxMilResult {
    if (total <= 0) {
      return this.makeResult({
        total: 0,
        tax: 0,
        net: 0,
        isExempt,
        exemptCovered: 0,
        taxableBase: 0,
      });
    }

    if (!isExempt) {
      const tax = this.splitTaxFromGross(total);
      const net = total - tax;

      return this.makeResult({
        total,
        tax,
        net,
        isExempt: false,
        exemptCovered: 0,
        taxableBase: net,
      });
    }

    if (total <= this.exemptLimitCOP) {
      return this.makeResult({
        total,
        tax: 0,
        net: total,
        isExempt: true,
        exemptCovered: total,
        taxableBase: 0,
      });
    }

    const taxableGross = Math.max(0, total - this.exemptLimitCOP);
    const tax = this.splitTaxFromGross(taxableGross);
    const net = total - tax;
    const exemptCovered = Math.min(net, this.exemptLimitCOP);
    const taxableBase = Math.max(0, net - exemptCovered);

    return this.makeResult({
      total,
      tax,
      net,
      isExempt: true,
      exemptCovered,
      taxableBase,
    });
  }

  requiredTotalForDesiredNet(
    desiredNet: number,
    isExempt = false,
  ): TaxMilResult {
    if (desiredNet <= 0) {
      return this.makeResult({
        total: 0,
        tax: 0,
        net: 0,
        isExempt,
        exemptCovered: 0,
        taxableBase: 0,
      });
    }

    if (!isExempt) {
      let total = Math.ceil(desiredNet * (1 + this.taxRate));
      let result = this.breakdownForTotal(total, false);

      while (result.net < desiredNet) {
        total += 1;
        result = this.breakdownForTotal(total, false);
      }

      return result;
    }

    if (desiredNet <= this.exemptLimitCOP) {
      return this.makeResult({
        total: desiredNet,
        tax: 0,
        net: desiredNet,
        isExempt: true,
        exemptCovered: desiredNet,
        taxableBase: 0,
      });
    }

    const estimatedTax = Math.round(
      (desiredNet - this.exemptLimitCOP) * this.taxRate,
    );
    let total = desiredNet + estimatedTax;
    let result = this.breakdownForTotal(total, true);

    while (result.net < desiredNet) {
      total += 1;
      result = this.breakdownForTotal(total, true);
    }

    while (total > 0) {
      const previous = this.breakdownForTotal(total - 1, true);
      if (previous.net < desiredNet) {
        break;
      }

      total -= 1;
      result = previous;
    }

    return result;
  }

  goalOptions(desiredNet: number, isExempt: boolean): TaxMilGoalOption[] {
    if (desiredNet <= 0) {
      return [];
    }

    const minimum = this.requiredTotalForDesiredNet(desiredNet, isExempt);
    const options: TaxMilGoalOption[] = [
      {
        id: 'exact',
        title: 'Exacto',
        total: minimum.total,
        tax: minimum.tax,
        net: minimum.net,
        extraNet: Math.max(0, minimum.net - desiredNet),
      },
    ];

    for (const step of [1_000, 10_000]) {
      const roundedTotal = this.roundUp(minimum.total, step);
      const candidate = this.breakdownForTotal(roundedTotal, isExempt);

      if (options.some((option) => option.total === candidate.total)) {
        continue;
      }

      options.push({
        id: `step_${step}`,
        title: step === 1_000 ? 'Tramo 1.000' : 'Tramo 10.000',
        total: candidate.total,
        tax: candidate.tax,
        net: candidate.net,
        extraNet: Math.max(0, candidate.net - desiredNet),
      });
    }

    return options;
  }

  private makeResult(
    base: Omit<TaxMilResult, 'taxPercentageOfTotal'>,
  ): TaxMilResult {
    const taxPercentageOfTotal =
      base.total > 0 ? (base.tax / base.total) * 100 : 0;

    return {
      ...base,
      taxPercentageOfTotal,
    };
  }
}

export interface TaxMilHistoryEntry {
  id: string;
  date: string;
  mode: TaxMilCalculationMode;
  inputAmount: number;
  total: number;
  tax: number;
  net: number;
  isExempt: boolean;
  note?: string;
}

export class TaxMilHistoryStore {
  private static readonly STORAGE_KEY = 'taxmil.history.v1';
  private static readonly MAX_ENTRIES = 60;

  entries: TaxMilHistoryEntry[] = [];

  constructor() {
    this.load();
  }

  addEntry(
    mode: TaxMilCalculationMode,
    inputAmount: number,
    result: TaxMilResult,
    isExempt: boolean,
    note?: string,
  ): void {
    if (inputAmount <= 0 || result.total <= 0) return;

    const now = new Date().toISOString();
    const previous = this.entries[0];
    if (
      previous?.mode === mode &&
      previous?.inputAmount === inputAmount &&
      previous?.total === result.total &&
      previous?.tax === result.tax &&
      previous?.net === result.net &&
      previous?.isExempt === isExempt &&
      Date.now() - new Date(previous.date).getTime() < 45_000
    ) {
      return;
    }

    this.entries.unshift({
      id: crypto.randomUUID(),
      date: now,
      mode,
      inputAmount,
      total: result.total,
      tax: result.tax,
      net: result.net,
      isExempt,
      ...(note ? { note } : {}),
    });

    if (this.entries.length > TaxMilHistoryStore.MAX_ENTRIES) {
      this.entries.length = TaxMilHistoryStore.MAX_ENTRIES;
    }

    this.persist();
  }

  clear(): void {
    this.entries = [];
    this.persist();
  }

  frequentAmounts(limit = 3): number[] {
    if (this.entries.length === 0) return [];

    const counters = new Map<number, number>();
    for (const entry of this.entries) {
      counters.set(
        entry.inputAmount,
        (counters.get(entry.inputAmount) ?? 0) + 1,
      );
    }

    return [...counters.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1] || b[0] - a[0])
      .slice(0, limit)
      .map(([amount]) => amount);
  }

  potentialSavingsIfExempt(): number {
    return this.entries
      .filter((e) => !e.isExempt)
      .reduce((sum, e) => sum + e.tax, 0);
  }

  totalTaxPaidThisMonth(): number {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();

    return this.entries
      .filter((e) => {
        const d = new Date(e.date);
        return d.getMonth() === month && d.getFullYear() === year;
      })
      .reduce((sum, e) => sum + e.tax, 0);
  }

  updateNote(id: string, note: string): void {
    const entry = this.entries.find((e) => e.id === id);
    if (entry) {
      entry.note = note || undefined;
      this.persist();
    }
  }

  filterEntries(filter: TaxMilHistoryFilter): TaxMilHistoryEntry[] {
    return this.entries.filter((e) => {
      if (filter.mode && e.mode !== filter.mode) return false;
      if (filter.isExempt !== undefined && e.isExempt !== filter.isExempt)
        return false;
      if (filter.dateFrom && e.date < filter.dateFrom) return false;
      if (filter.dateTo && e.date > filter.dateTo) return false;
      if (filter.search) {
        const q = filter.search.toLowerCase();
        if (!e.note?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }

  getMonthlyAggregation(): TaxMilMonthlyAggregate[] {
    const months = [
      'Ene',
      'Feb',
      'Mar',
      'Abr',
      'May',
      'Jun',
      'Jul',
      'Ago',
      'Sep',
      'Oct',
      'Nov',
      'Dic',
    ];
    const monthsEn = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const map = new Map<
      string,
      { tax: number; count: number; volume: number }
    >();
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      map.set(key, { tax: 0, count: 0, volume: 0 });
    }
    for (const e of this.entries) {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = map.get(key);
      if (bucket) {
        bucket.tax += e.tax;
        bucket.count++;
        bucket.volume += e.total;
      }
    }
    return [...map.entries()].map(([key, v]) => {
      const m = Number(key.split('-')[1]) - 1;
      return {
        key,
        label: months[m],
        labelEn: monthsEn[m],
        totalTax: v.tax,
        count: v.count,
        volume: v.volume,
      };
    });
  }

  simulateExemption(): {
    currentMonthlyTax: number;
    exemptMonthlyTax: number;
    monthlySavings: number;
    annualSavings: number;
  } {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const thisMonth = this.entries.filter((e) => {
      const d = new Date(e.date);
      return d.getMonth() === month && d.getFullYear() === year;
    });
    const currentTax = thisMonth.reduce((s, e) => s + e.tax, 0);
    const exemptTax = thisMonth.reduce((s, e) => {
      if (e.isExempt) return s + e.tax;
      return s;
    }, 0);
    const savings = currentTax - exemptTax;
    return {
      currentMonthlyTax: currentTax,
      exemptMonthlyTax: exemptTax,
      monthlySavings: savings,
      annualSavings: savings * 12,
    };
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(TaxMilHistoryStore.STORAGE_KEY);
      this.entries = raw ? JSON.parse(raw) : [];
    } catch {
      this.entries = [];
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(
        TaxMilHistoryStore.STORAGE_KEY,
        JSON.stringify(this.entries),
      );
    } catch {
      // storage full — silently fail
    }
  }
}

export class TaxMilExportBuilder {
  static csv(entries: TaxMilHistoryEntry[]): string {
    const header = 'date,mode,input,total,tax,net,isExempt';
    const rows = entries.map((e) =>
      [e.date, e.mode, e.inputAmount, e.total, e.tax, e.net, e.isExempt].join(
        ',',
      ),
    );
    return [header, ...rows].join('\n');
  }

  private static summaryLines(
    mode: TaxMilCalculationMode,
    inputAmount: number,
    result: TaxMilResult,
    isExempt: boolean,
    engine: TaxMilCalculatorEngine,
  ): string[] {
    const modeLabel = mode === 'totalToSend' ? 'Total ingresado' : 'Meta neta';
    const generatedAt = new Date().toLocaleString('es-CO');
    const rows = [
      `${modeLabel}: ${engine.formatCOP(inputAmount)}`,
      `Total a transferir: ${engine.formatCOP(result.total)}`,
      `Impuesto: ${engine.formatCOP(result.tax)}`,
      `Neto: ${engine.formatCOP(result.net)}`,
      `Cuenta exenta: ${isExempt ? 'Si' : 'No'}`,
    ];

    if (isExempt && result.exemptCovered > 0) {
      rows.push(`Exencion aplicada: ${engine.formatCOP(result.exemptCovered)}`);
    }

    if (result.taxableBase > 0) {
      rows.push(`Base gravable: ${engine.formatCOP(result.taxableBase)}`);
    }

    return [
      'TaxMil',
      'Resumen profesional',
      `Generado: ${generatedAt}`,
      '',
      ...rows,
      '',
      'Fuente TRM: Banco de la Republica (si hay conectividad)',
      'Generado por TaxMil - Calculadora 4x1000 Colombia',
    ];
  }

  private static sanitizePDFText(raw: string): string {
    const replacements: Record<string, string> = {
      'á': 'a',
      'é': 'e',
      'í': 'i',
      'ó': 'o',
      'ú': 'u',
      'Á': 'A',
      'É': 'E',
      'Í': 'I',
      'Ó': 'O',
      'Ú': 'U',
      'ñ': 'n',
      'Ñ': 'N',
      'ü': 'u',
      'Ü': 'U',
    };

    const normalized = raw
      .split('')
      .map((char) => replacements[char] ?? char)
      .join('');

    return normalized.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
  }

  private static buildMinimalPDF(lines: string[]): Uint8Array {
    const contentParts = ['BT', '/F1 11 Tf', '50 800 Td'];

    for (const line of lines.slice(0, 45)) {
      const sanitized = this.sanitizePDFText(line);
      contentParts.push(`(${sanitized}) Tj`);
      contentParts.push('0 -16 Td');
    }

    contentParts.push('ET');
    const contentStream = contentParts.join('\n');

    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`,
    ];

    let pdf = '%PDF-1.4\n';
    const offsets = [0];

    objects.forEach((object, index) => {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });

    const xrefStart = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';

    for (let index = 1; index <= objects.length; index += 1) {
      pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
    }

    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

    return new TextEncoder().encode(pdf);
  }

  static generatePDFData(
    mode: TaxMilCalculationMode,
    inputAmount: number,
    result: TaxMilResult,
    isExempt: boolean,
    engine: TaxMilCalculatorEngine,
  ): Uint8Array {
    const lines = this.summaryLines(mode, inputAmount, result, isExempt, engine);
    return this.buildMinimalPDF(lines);
  }

  static generatePDFContent(
    mode: TaxMilCalculationMode,
    inputAmount: number,
    result: TaxMilResult,
    isExempt: boolean,
    engine: TaxMilCalculatorEngine,
  ): string {
    const modeLabel = mode === 'totalToSend' ? 'Total ingresado' : 'Meta neta';
    const now = new Date().toLocaleString('es-CO');

    const rows = [
      { label: modeLabel, value: engine.formatCOP(inputAmount) },
      { label: 'Total a transferir', value: engine.formatCOP(result.total) },
      { label: 'Impuesto', value: engine.formatCOP(result.tax) },
      { label: 'Neto', value: engine.formatCOP(result.net) },
      { label: 'Cuenta exenta', value: isExempt ? 'Sí' : 'No' },
    ];

    if (isExempt && result.exemptCovered > 0) {
      rows.push({
        label: 'Exención aplicada',
        value: engine.formatCOP(result.exemptCovered),
      });
    }
    if (result.taxableBase > 0) {
      rows.push({
        label: 'Base gravable',
        value: engine.formatCOP(result.taxableBase),
      });
    }

    const tableRows = rows
      .map(
        (r) =>
          `<tr><td style="padding:10px 12px;color:#4a5568;border-bottom:1px solid #edf2f7">${r.label}</td><td style="padding:10px 12px;text-align:right;font-weight:600;border-bottom:1px solid #edf2f7">${r.value}</td></tr>`,
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>TaxMil Resumen</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;color:#1a202c">
<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px">
<div><h1 style="margin:0;font-size:28px;font-weight:800;color:#2b4c7e">TaxMil</h1><p style="margin:4px 0 0;color:#718096;font-size:13px">Resumen profesional</p></div>
<span style="color:#a0aec0;font-size:12px">${now}</span>
</div>
<hr style="border:none;height:2px;background:#2b4c7e;margin:0 0 20px">
<table style="width:100%;border-collapse:collapse;font-size:14px">${tableRows}</table>
<hr style="border:none;height:1px;background:#e2e8f0;margin:20px 0">
<p style="font-size:11px;color:#a0aec0;text-align:center;margin:0">Generado por TaxMil — Calculadora 4×1000 Colombia · jose.cuervo@noirfeather.com</p>
</body></html>`;
  }
}

// ─── History Filter ───────────────────────────────────

export interface TaxMilHistoryFilter {
  mode?: TaxMilCalculationMode;
  isExempt?: boolean;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface TaxMilMonthlyAggregate {
  key: string;
  label: string;
  labelEn: string;
  totalTax: number;
  count: number;
  volume: number;
}

// ─── Budget Store ─────────────────────────────────────

export interface TaxMilBudgetUsage {
  budget: number;
  spent: number;
  remaining: number;
  percentage: number;
  overBudget: boolean;
}

export class TaxMilBudgetStore {
  private static readonly STORAGE_KEY = 'taxmil.budget.v1';
  monthlyBudget = 0;

  constructor() {
    this.load();
  }

  setBudget(amount: number): void {
    this.monthlyBudget = Math.max(0, Math.round(amount));
    this.persist();
  }

  getUsage(monthlyTaxPaid: number): TaxMilBudgetUsage {
    const remaining = Math.max(0, this.monthlyBudget - monthlyTaxPaid);
    return {
      budget: this.monthlyBudget,
      spent: monthlyTaxPaid,
      remaining,
      percentage:
        this.monthlyBudget > 0
          ? Math.min(100, (monthlyTaxPaid / this.monthlyBudget) * 100)
          : 0,
      overBudget: this.monthlyBudget > 0 && monthlyTaxPaid > this.monthlyBudget,
    };
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(TaxMilBudgetStore.STORAGE_KEY);
      this.monthlyBudget = raw ? Number(raw) : 0;
    } catch {
      this.monthlyBudget = 0;
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(
        TaxMilBudgetStore.STORAGE_KEY,
        String(this.monthlyBudget),
      );
    } catch {
      /* storage full */
    }
  }
}

// ─── Batch Processor ──────────────────────────────────

export interface TaxMilBatchLine {
  amount: number;
  result: TaxMilResult;
}

export interface TaxMilBatchSummary {
  lines: TaxMilBatchLine[];
  totalTax: number;
  totalNet: number;
  totalGross: number;
}

export class TaxMilBatchProcessor {
  static process(
    engine: TaxMilCalculatorEngine,
    amounts: number[],
    mode: TaxMilCalculationMode,
    isExempt: boolean,
  ): TaxMilBatchSummary {
    const lines = amounts
      .filter((a) => a > 0)
      .map((amount) => ({
        amount,
        result: engine.breakdown(mode, amount, isExempt),
      }));
    return {
      lines,
      totalTax: lines.reduce((s, l) => s + l.result.tax, 0),
      totalNet: lines.reduce((s, l) => s + l.result.net, 0),
      totalGross: lines.reduce((s, l) => s + l.result.total, 0),
    };
  }
}

// ─── Currency Converter ───────────────────────────────

export type TaxMilRateSource = 'official' | 'manual';

export type TaxMilRateStatus =
  | 'idle'
  | 'updating'
  | 'ready'
  | 'offline'
  | 'source-unavailable'
  | 'retrying';

export interface TaxMilRateHistoryEntry {
  date: string;
  rate: number;
  source: TaxMilRateSource;
  syncedAt: string;
}

export interface TaxMilRateSnapshot {
  rate: number;
  source: TaxMilRateSource;
  status: TaxMilRateStatus;
  sourceDate: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  retryAt: string | null;
  history: TaxMilRateHistoryEntry[];
}

interface TaxMilOfficialRatePayload {
  fecha?: unknown;
  hora?: unknown;
  precioPromedio?: unknown;
  precioXHora?: unknown;
  precioCierre?: unknown;
  precioApertura?: unknown;
}

export class TaxMilCurrencyConverter {
  private static readonly LEGACY_RATE_KEY = 'taxmil.usdrate.v1';
  private static readonly STORAGE_KEY = TaxMilCurrencyConverter.LEGACY_RATE_KEY;
  private static readonly SNAPSHOT_STORAGE_KEY = 'taxmil.usdrate.snapshot.v2';
  private static readonly HISTORY_STORAGE_KEY = 'taxmil.usdrate.history.v1';
  private static readonly OFFICIAL_ENDPOINT =
    'https://suameca.banrep.gov.co/estadisticas-economicas-back/rest/estadisticaEconomicaRestService/consultaTablaMercadoCambiario';
  private static readonly MAX_HISTORY_DAYS = 120;
  private static readonly FRESH_RATE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

  rate = 4_150;
  source: TaxMilRateSource = 'manual';
  status: TaxMilRateStatus = 'idle';
  sourceDate: string | null = null;
  lastSyncedAt: string | null = null;
  lastError: string | null = null;
  retryAt: string | null = null;
  history: TaxMilRateHistoryEntry[] = [];

  constructor() {
    this.load();
  }

  snapshot(): TaxMilRateSnapshot {
    return {
      rate: this.rate,
      source: this.source,
      status: this.status,
      sourceDate: this.sourceDate,
      lastSyncedAt: this.lastSyncedAt,
      lastError: this.lastError,
      retryAt: this.retryAt,
      history: [...this.history],
    };
  }

  toUSD(cop: number): number {
    return cop / this.rate;
  }

  formatUSD(cop: number): string {
    return (
      'US$ ' +
      this.toUSD(cop).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }

  setRate(rate: number): void {
    this.rate = Math.max(1, Math.round(rate));
    this.source = 'manual';
    this.status = 'ready';
    this.lastError = null;
    this.retryAt = null;
    this.lastSyncedAt = new Date().toISOString();
    if (!this.sourceDate) {
      this.sourceDate = this.lastSyncedAt;
    }
    this.pushHistory(
      (this.sourceDate ?? this.lastSyncedAt).slice(0, 10),
      this.rate,
      'manual',
      this.lastSyncedAt,
    );
    this.persist();
  }

  hasFreshOfficialRate(maxAgeMs = TaxMilCurrencyConverter.FRESH_RATE_MAX_AGE_MS): boolean {
    if (this.source !== 'official' || !this.lastSyncedAt) {
      return false;
    }

    return Date.now() - Date.parse(this.lastSyncedAt) < maxAgeMs;
  }

  setRetryState(retryAtISO: string): void {
    this.retryAt = retryAtISO;
    this.persist();
  }

  clearRetryState(): void {
    this.retryAt = null;
    if (this.status === 'retrying') {
      this.status = 'ready';
    }
    this.persist();
  }

  markOfflineState(): void {
    this.status = 'offline';
    this.lastError = 'offline';
    this.persist();
  }

  dailyVariation(): number | null {
    const sorted = [...this.history].sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length < 2) {
      return null;
    }

    const latest = sorted[sorted.length - 1];
    const previous = sorted[sorted.length - 2];
    return latest.rate - previous.rate;
  }

  dailyVariationPercent(): number | null {
    const sorted = [...this.history].sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length < 2) {
      return null;
    }

    const latest = sorted[sorted.length - 1];
    const previous = sorted[sorted.length - 2];
    if (previous.rate <= 0) {
      return null;
    }

    return ((latest.rate - previous.rate) / previous.rate) * 100;
  }

  async refreshOfficialRate(options?: {
    force?: boolean;
    now?: Date;
    fetchFn?: typeof fetch;
  }): Promise<TaxMilRateSnapshot> {
    const force = options?.force ?? false;
    const now = options?.now ?? new Date();
    const fetchFn = options?.fetchFn ?? globalThis.fetch?.bind(globalThis);

    if (!force && this.hasFreshOfficialRate()) {
      this.status = 'ready';
      this.retryAt = null;
      this.lastError = null;
      this.persist();
      return this.snapshot();
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.status = 'offline';
      this.lastError = 'offline';
      this.persist();
      return this.snapshot();
    }

    if (!fetchFn) {
      this.status = 'source-unavailable';
      this.lastError = 'fetch-unavailable';
      this.persist();
      return this.snapshot();
    }

    this.status = 'updating';
    this.lastError = null;
    this.persist();

    try {
      const controller =
        typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller
        ? setTimeout(() => controller.abort(), 12_000)
        : null;

      const response = await fetchFn(TaxMilCurrencyConverter.OFFICIAL_ENDPOINT, {
        cache: 'no-store',
        signal: controller?.signal,
      });

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        throw new Error(`http-${response.status}`);
      }

      const payload = (await response.json()) as TaxMilOfficialRatePayload;
      const parsed = TaxMilCurrencyConverter.parseOfficialResponse(payload);

      if (!parsed) {
        throw new Error('malformed-payload');
      }

      this.rate = parsed.rate;
      this.source = 'official';
      this.status = 'ready';
      this.sourceDate = parsed.sourceDate;
      this.lastSyncedAt = now.toISOString();
      this.lastError = null;
      this.retryAt = null;

      const day = (parsed.sourceDate ?? this.lastSyncedAt).slice(0, 10);
      this.pushHistory(day, parsed.rate, 'official', this.lastSyncedAt);
      this.persist();

      return this.snapshot();
    } catch (error) {
      const offlineNow =
        typeof navigator !== 'undefined' && navigator.onLine === false;
      this.status = offlineNow ? 'offline' : 'source-unavailable';

      if (error instanceof DOMException && error.name === 'AbortError') {
        this.lastError = 'timeout';
      } else if (error instanceof Error) {
        this.lastError = error.message || 'source-unavailable';
      } else {
        this.lastError = 'source-unavailable';
      }

      this.persist();
      return this.snapshot();
    }
  }

  static parseOfficialResponse(
    payload: TaxMilOfficialRatePayload,
  ): { rate: number; sourceDate: string | null } | null {
    const rateCandidates = [
      payload.precioPromedio,
      payload.precioXHora,
      payload.precioCierre,
      payload.precioApertura,
    ];

    let parsedRate: number | null = null;
    for (const candidate of rateCandidates) {
      parsedRate = this.parseNumeric(candidate);
      if (parsedRate !== null && parsedRate > 0) {
        break;
      }
    }

    if (!parsedRate || parsedRate <= 0) {
      return null;
    }

    return {
      rate: Math.max(1, Math.round(parsedRate)),
      sourceDate: this.parseSourceDate(payload.fecha, payload.hora),
    };
  }

  private static parseNumeric(input: unknown): number | null {
    if (typeof input === 'number' && Number.isFinite(input)) {
      return input;
    }

    if (typeof input === 'string') {
      const normalized = input
        .trim()
        .replaceAll(/\s/g, '')
        .replaceAll(',', '.');

      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private static parseSourceDate(fechaRaw: unknown, horaRaw: unknown): string | null {
    if (typeof fechaRaw !== 'string') {
      return null;
    }

    const fecha = fechaRaw.trim();
    if (!/^\d{8}$/.test(fecha)) {
      return null;
    }

    const yyyy = fecha.slice(0, 4);
    const mm = fecha.slice(4, 6);
    const dd = fecha.slice(6, 8);

    const hourCandidate =
      typeof horaRaw === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(horaRaw.trim())
        ? horaRaw.trim()
        : '00:00:00';

    const iso = `${yyyy}-${mm}-${dd}T${hourCandidate}-05:00`;
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toISOString();
  }

  private pushHistory(
    date: string,
    rate: number,
    source: TaxMilRateSource,
    syncedAt: string,
  ): void {
    const day = date.slice(0, 10);
    const entry: TaxMilRateHistoryEntry = {
      date: day,
      rate: Math.max(1, Math.round(rate)),
      source,
      syncedAt,
    };

    const existingIndex = this.history.findIndex((item) => item.date === day);
    if (existingIndex >= 0) {
      this.history[existingIndex] = entry;
    } else {
      this.history.push(entry);
    }

    this.history = this.history
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-TaxMilCurrencyConverter.MAX_HISTORY_DAYS);
  }

  private load(): void {
    try {
      const rawSnapshot = localStorage.getItem(
        TaxMilCurrencyConverter.SNAPSHOT_STORAGE_KEY,
      );
      if (rawSnapshot) {
        const parsed = JSON.parse(rawSnapshot) as Partial<TaxMilRateSnapshot>;
        if (typeof parsed.rate === 'number' && parsed.rate > 0) {
          this.rate = Math.round(parsed.rate);
        }
        if (parsed.source === 'official' || parsed.source === 'manual') {
          this.source = parsed.source;
        }
        if (
          parsed.status === 'idle' ||
          parsed.status === 'updating' ||
          parsed.status === 'ready' ||
          parsed.status === 'offline' ||
          parsed.status === 'source-unavailable' ||
          parsed.status === 'retrying'
        ) {
          this.status = parsed.status;
        }
        this.sourceDate = parsed.sourceDate ?? null;
        this.lastSyncedAt = parsed.lastSyncedAt ?? null;
        this.lastError = parsed.lastError ?? null;
        this.retryAt = parsed.retryAt ?? null;
      } else {
        const legacy = localStorage.getItem(TaxMilCurrencyConverter.LEGACY_RATE_KEY);
        if (legacy) {
          const legacyRate = Number(legacy);
          if (Number.isFinite(legacyRate) && legacyRate > 0) {
            this.rate = Math.round(legacyRate);
          }
        }
      }

      const rawHistory = localStorage.getItem(
        TaxMilCurrencyConverter.HISTORY_STORAGE_KEY,
      );
      if (rawHistory) {
        const parsedHistory = JSON.parse(rawHistory) as TaxMilRateHistoryEntry[];
        this.history = parsedHistory
          .filter(
            (entry) =>
              typeof entry?.date === 'string' &&
              typeof entry?.rate === 'number' &&
              (entry?.source === 'manual' || entry?.source === 'official') &&
              typeof entry?.syncedAt === 'string',
          )
          .map((entry) => ({
            ...entry,
            rate: Math.max(1, Math.round(entry.rate)),
            date: entry.date.slice(0, 10),
          }))
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(-TaxMilCurrencyConverter.MAX_HISTORY_DAYS);
      }
    } catch {
      /* noop */
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(
        TaxMilCurrencyConverter.STORAGE_KEY,
        String(this.rate),
      );

      const snapshot: TaxMilRateSnapshot = {
        rate: this.rate,
        source: this.source,
        status: this.status,
        sourceDate: this.sourceDate,
        lastSyncedAt: this.lastSyncedAt,
        lastError: this.lastError,
        retryAt: this.retryAt,
        history: [],
      };

      localStorage.setItem(
        TaxMilCurrencyConverter.SNAPSHOT_STORAGE_KEY,
        JSON.stringify(snapshot),
      );
      localStorage.setItem(
        TaxMilCurrencyConverter.HISTORY_STORAGE_KEY,
        JSON.stringify(this.history),
      );
    } catch {
      /* noop */
    }
  }
}

// ─── Theme Store ──────────────────────────────────────

export type TaxMilTheme = 'dark' | 'light' | 'auto';

export class TaxMilThemeStore {
  private static readonly STORAGE_KEY = 'taxmil.theme.v1';
  preference: TaxMilTheme = 'auto';

  constructor() {
    this.load();
  }

  get resolved(): 'dark' | 'light' {
    if (this.preference !== 'auto') {
      return this.preference;
    }

    return globalThis.window !== undefined &&
      globalThis.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  }

  cycle(): void {
    const order: TaxMilTheme[] = ['auto', 'light', 'dark'];
    const idx = order.indexOf(this.preference);
    this.preference = order[(idx + 1) % order.length];
    this.persist();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(
        TaxMilThemeStore.STORAGE_KEY,
      ) as TaxMilTheme | null;
      if (raw === 'dark' || raw === 'light' || raw === 'auto') {
        this.preference = raw;
      }
    } catch {
      /* noop */
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(TaxMilThemeStore.STORAGE_KEY, this.preference);
    } catch {
      /* noop */
    }
  }
}

// ─── i18n ─────────────────────────────────────────────

export type TaxMilLang = 'es' | 'en';

const TRANSLATIONS: Record<TaxMilLang, Record<string, string>> = {
  es: {
    'app.title': 'TaxMil',
    'app.tagline': 'Calculadora 4×1000',
    'app.subtitle':
      'Simulador estratégico de GMF: modo total o meta neta, con exención legal y desglose inmediato.',
    'mode.label': 'Modo de cálculo',
    'mode.total': 'Total a enviar',
    'mode.net': 'Meta neta',
    'policy.title': 'Exención vigente:',
    'policy.desc': 'mensuales (350 UVT).',
    'input.label.total': 'Monto total a enviar',
    'input.label.net': 'Monto neto que quiero recibir',
    'input.aria': 'Monto en pesos colombianos',
    'exempt.label': 'Aplicar cuenta exenta (límite legal)',
    'exempt.hint':
      'La exención cubre hasta {limit} por mes. El excedente sí paga 4×1000.',
    'exempt.ok': 'Exención aplicada: no se causa GMF dentro del tope mensual.',
    'exempt.exceeded.prefix': 'Exención usada:',
    'exempt.exceeded.suffix': 'Exceso gravado:',
    clear: 'Limpiar',
    'result.label.total': 'Puedes enviar',
    'result.label.net': 'Debes transferir',
    'result.desc.total': 'Monto neto después del impuesto aplicable',
    'result.desc.net': 'Transferencia mínima para lograr tu meta neta',
    'tax.label': 'Impuesto 4×1000',
    'tax.retention': 'Retención del {pct}% del total',
    'breakdown.title': 'Desglose de tu transacción',
    'breakdown.send': 'Envío',
    'breakdown.tax': 'Impuesto',
    'breakdown.exempt': 'Exento',
    'breakdown.excess': 'Exceso gravado',
    'impact.label': 'Impacto fiscal',
    share: 'Compartir',
    save: 'Guardar',
    copy: 'Copiar',
    copied: 'Copiado',
    'goal.title': 'Opciones por tramo',
    'goal.extra': 'extra',
    'frequent.title': 'Montos frecuentes',
    'history.title': 'Historial reciente',
    'history.empty': 'Aún no hay cálculos guardados',
    'history.clear': 'Borrar',
    'filter.all': 'Todos',
    'filter.exempt': 'Exentos',
    'filter.taxed': 'Gravados',
    'filter.search': 'Buscar nota…',
    'note.add': 'Agregar nota…',
    'budget.title': 'Presupuesto mensual GMF',
    'budget.set': 'Definir',
    'budget.spent': 'Gastado',
    'budget.remaining': 'Restante',
    'budget.over': '⚠ Presupuesto excedido',
    'budget.placeholder': 'Presupuesto en COP',
    'batch.title': 'Cálculo por lotes',
    'batch.placeholder': 'Pega montos, uno por línea',
    'batch.process': 'Procesar',
    'batch.clear': 'Limpiar',
    'batch.totalTax': 'Impuesto total',
    'batch.totalNet': 'Neto total',
    'batch.totalGross': 'Bruto total',
    'chart.title': 'Impuesto mensual',
    'chart.txns': 'txns',
    'simulator.title': 'Simulador de exención',
    'simulator.current': 'Impuesto mensual actual',
    'simulator.ifExempt': 'Si marcaras cuenta exenta',
    'simulator.annual': 'Ahorro anual estimado',
    'currency.title': 'Equivalente USD',
    'currency.rate': 'Tasa',
    'currency.approx': '(aproximado)',
    'currency.placeholder': 'Tasa COP/USD',
    'currency.refresh': 'Actualizar TRM',
    'currency.source.official': 'Fuente: Banco de la República',
    'currency.source.manual': 'Fuente: tasa manual',
    'currency.refDate': 'Fecha TRM: {date}',
    'currency.syncedAt': 'Actualizada: {date}',
    'currency.variation': 'Variación diaria: {delta} COP ({pct}%)',
    'currency.variation.none': 'Sin variación diaria disponible todavía',
    'currency.manual': 'Ajuste manual',
    'currency.error.offline': 'Sin internet: usando la última TRM guardada localmente.',
    'currency.error.source': 'Fuente oficial no disponible por ahora: usando TRM local.',
    'currency.retry': 'Reintento automático en {seconds}s',
    'currency.status.updating': 'Actualizando TRM oficial...',
    'currency.status.ready': 'TRM lista para conversión',
    'pro.title': 'Panel profesional',
    'pro.monthly': 'Impuesto pagado este mes',
    'pro.savings': 'Ahorro potencial si fuera exenta',
    'export.csv': 'Exportar CSV',
    'export.pdf': 'Exportar PDF',
    'feedback.title': 'Feedback y mejora',
    'feedback.hint':
      'Ayuda a mejorar TaxMil: comparte ideas o califica la app.',
    'feedback.send': 'Enviar feedback',
    'footer.info':
      'El GMF (4×1000) grava movimientos financieros en Colombia. La exención para cuenta aplica hasta 350 UVT mensuales (Art. 879 E.T.) y el excedente sí genera impuesto.',
    'footer.rights': 'Todos los derechos reservados.',
    'empty.title': 'Simula en segundos',
    'empty.desc':
      'Ingresa un monto o usa un preset para obtener inmediatamente el neto, el impuesto y el desglose fiscal.',
    'pill.mode': 'Modo',
    'pill.limit': 'Tope exento',
    'pill.tax': 'Impuesto estimado',
    'pill.usd': 'USD equiv.',
    'summary.input': 'Monto ingresado',
    'summary.taxE': '(-) GMF sobre excedente',
    'summary.taxR': '(-) Impuesto 4×1000',
    'summary.taxEP': '(+) GMF sobre excedente',
    'summary.taxRP': '(+) Impuesto 4×1000',
    'summary.netResult': '= Puedes enviar',
    'summary.netGoal': 'Meta neta',
    'summary.totalResult': '= Total a transferir',
  },
  en: {
    'app.title': 'TaxMil',
    'app.tagline': '4×1000 Calculator',
    'app.subtitle':
      'Strategic GMF simulator: total or net goal mode, with legal exemption and instant breakdown.',
    'mode.label': 'Calculation mode',
    'mode.total': 'Total to send',
    'mode.net': 'Net goal',
    'policy.title': 'Active exemption:',
    'policy.desc': 'monthly (350 UVT).',
    'input.label.total': 'Total amount to send',
    'input.label.net': 'Net amount I want to receive',
    'input.aria': 'Amount in Colombian pesos',
    'exempt.label': 'Apply exempt account (legal limit)',
    'exempt.hint':
      'Exemption covers up to {limit} per month. The excess does pay 4×1000.',
    'exempt.ok': 'Exemption applied: no GMF incurred within the monthly cap.',
    'exempt.exceeded.prefix': 'Exemption used:',
    'exempt.exceeded.suffix': 'Taxed excess:',
    clear: 'Clear',
    'result.label.total': 'You can send',
    'result.label.net': 'You must transfer',
    'result.desc.total': 'Net amount after applicable tax',
    'result.desc.net': 'Minimum transfer to reach your net goal',
    'tax.label': 'Tax 4×1000',
    'tax.retention': '{pct}% retention of total',
    'breakdown.title': 'Transaction breakdown',
    'breakdown.send': 'Send',
    'breakdown.tax': 'Tax',
    'breakdown.exempt': 'Exempt',
    'breakdown.excess': 'Taxed excess',
    'impact.label': 'Tax impact',
    share: 'Share',
    save: 'Save',
    copy: 'Copy',
    copied: 'Copied',
    'goal.title': 'Step options',
    'goal.extra': 'extra',
    'frequent.title': 'Frequent amounts',
    'history.title': 'Recent history',
    'history.empty': 'No calculations saved yet',
    'history.clear': 'Clear',
    'filter.all': 'All',
    'filter.exempt': 'Exempt',
    'filter.taxed': 'Taxed',
    'filter.search': 'Search note…',
    'note.add': 'Add note…',
    'budget.title': 'Monthly GMF budget',
    'budget.set': 'Set',
    'budget.spent': 'Spent',
    'budget.remaining': 'Remaining',
    'budget.over': '⚠ Budget exceeded',
    'budget.placeholder': 'Budget in COP',
    'batch.title': 'Batch calculation',
    'batch.placeholder': 'Paste amounts, one per line',
    'batch.process': 'Process',
    'batch.clear': 'Clear',
    'batch.totalTax': 'Total tax',
    'batch.totalNet': 'Total net',
    'batch.totalGross': 'Total gross',
    'chart.title': 'Monthly tax',
    'chart.txns': 'txns',
    'simulator.title': 'Exemption simulator',
    'simulator.current': 'Current monthly tax',
    'simulator.ifExempt': 'If you marked exempt account',
    'simulator.annual': 'Estimated annual savings',
    'currency.title': 'USD equivalent',
    'currency.rate': 'Rate',
    'currency.approx': '(approximate)',
    'currency.placeholder': 'COP/USD rate',
    'currency.refresh': 'Refresh TRM',
    'currency.source.official': 'Source: Banco de la República',
    'currency.source.manual': 'Source: manual rate',
    'currency.refDate': 'TRM date: {date}',
    'currency.syncedAt': 'Updated: {date}',
    'currency.variation': 'Daily variation: {delta} COP ({pct}%)',
    'currency.variation.none': 'No daily variation available yet',
    'currency.manual': 'Manual override',
    'currency.error.offline': 'Offline: using last TRM saved locally.',
    'currency.error.source': 'Official source is unavailable right now: using local TRM.',
    'currency.retry': 'Automatic retry in {seconds}s',
    'currency.status.updating': 'Refreshing official TRM...',
    'currency.status.ready': 'TRM ready for conversion',
    'pro.title': 'Professional panel',
    'pro.monthly': 'Tax paid this month',
    'pro.savings': 'Potential savings if exempt',
    'export.csv': 'Export CSV',
    'export.pdf': 'Export PDF',
    'feedback.title': 'Feedback & improvement',
    'feedback.hint': 'Help improve TaxMil: share ideas or rate the app.',
    'feedback.send': 'Send feedback',
    'footer.info':
      'The GMF (4×1000) taxes financial movements in Colombia. The account exemption applies up to 350 UVT monthly (Art. 879 E.T.) and the excess does generate tax.',
    'footer.rights': 'All rights reserved.',
    'empty.title': 'Simulate in seconds',
    'empty.desc':
      'Enter an amount or use a preset to instantly get the net, tax, and fiscal breakdown.',
    'pill.mode': 'Mode',
    'pill.limit': 'Exempt cap',
    'pill.tax': 'Estimated tax',
    'pill.usd': 'USD equiv.',
    'summary.input': 'Amount entered',
    'summary.taxE': '(-) GMF on excess',
    'summary.taxR': '(-) Tax 4×1000',
    'summary.taxEP': '(+) GMF on excess',
    'summary.taxRP': '(+) Tax 4×1000',
    'summary.netResult': '= You can send',
    'summary.netGoal': 'Net goal',
    'summary.totalResult': '= Total to transfer',
  },
};

export class TaxMilI18n {
  private static readonly STORAGE_KEY = 'taxmil.lang.v1';
  lang: TaxMilLang = 'es';

  constructor() {
    this.load();
  }

  t(key: string, params?: Record<string, string>): string {
    let text = TRANSLATIONS[this.lang]?.[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, v);
      }
    }
    return text;
  }

  toggle(): void {
    this.lang = this.lang === 'es' ? 'en' : 'es';
    this.persist();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(TaxMilI18n.STORAGE_KEY);
      if (raw === 'en' || raw === 'es') this.lang = raw;
    } catch {
      /* noop */
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(TaxMilI18n.STORAGE_KEY, this.lang);
    } catch {
      /* noop */
    }
  }
}
