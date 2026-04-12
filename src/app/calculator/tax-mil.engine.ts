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

  abstract breakdown(mode: TMode, inputAmount: number, isExempt: boolean): TResult;
}

export class TaxMilCalculatorEngine extends FinancialCalculatorEngine<
  TaxMilCalculationMode,
  TaxMilResult
> {
  readonly EXEMPT_LIMIT_UVT = 350;
  readonly UVT_VALUE_COP = 52_374;
  readonly exemptLimitCOP = Math.round(this.EXEMPT_LIMIT_UVT * this.UVT_VALUE_COP);

  constructor() {
    super(4 / 1000, 'es-CO');
  }

  breakdown(mode: TaxMilCalculationMode, inputAmount: number, isExempt: boolean): TaxMilResult {
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

  requiredTotalForDesiredNet(desiredNet: number, isExempt = false): TaxMilResult {
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

    const estimatedTax = Math.round((desiredNet - this.exemptLimitCOP) * this.taxRate);
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

  private makeResult(base: Omit<TaxMilResult, 'taxPercentageOfTotal'>): TaxMilResult {
    const taxPercentageOfTotal =
      base.total > 0 ? (base.tax / base.total) * 100 : 0;

    return {
      ...base,
      taxPercentageOfTotal,
    };
  }
}