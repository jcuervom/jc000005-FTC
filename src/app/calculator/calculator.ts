import { Component, signal, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import {
  TaxMilCalculatorEngine,
  type TaxMilCalculationMode,
  type TaxMilGoalOption,
} from './tax-mil.engine';

type SummaryTone = 'default' | 'tax' | 'net';

interface SummaryRow<TValue = string> {
  id: string;
  label: string;
  value: TValue;
  tone?: SummaryTone;
  total?: boolean;
}

interface HeaderPill<TValue = string> {
  id: string;
  label: string;
  value: TValue;
  tone: 'neutral' | 'cyan' | 'mint';
}

@Component({
  selector: 'app-calculator',
  imports: [DecimalPipe],
  templateUrl: './calculator.html',
  styleUrl: './calculator.scss',
})
export class Calculator {
  private readonly engine = new TaxMilCalculatorEngine();

  readonly TAX_RATE = this.engine.taxRate;
  readonly EXEMPT_LIMIT_UVT = this.engine.EXEMPT_LIMIT_UVT;
  readonly UVT_VALUE_COP = this.engine.UVT_VALUE_COP;
  readonly EXEMPT_LIMIT_COP = this.engine.exemptLimitCOP;

  readonly modeOptions: ReadonlyArray<{
    id: TaxMilCalculationMode;
    label: string;
  }> = [
    { id: 'totalToSend', label: 'Total a enviar' },
    { id: 'desiredNet', label: 'Meta neta' },
  ];

  readonly quickAmounts: ReadonlyArray<number> = [
    100_000,
    250_000,
    500_000,
    1_000_000,
  ];

  rawInput = signal('');
  copied = signal(false);
  isExempt = signal(false);
  calculationMode = signal<TaxMilCalculationMode>('totalToSend');

  amount = computed(() => this.engine.amountFrom(this.rawInput()));

  result = computed(() =>
    this.engine.breakdown(
      this.calculationMode(),
      this.amount(),
      this.isExempt(),
    ),
  );

  modeTitle = computed(() =>
    this.calculationMode() === 'totalToSend' ? 'Total a enviar' : 'Meta neta',
  );

  amountInputLabel = computed(() =>
    this.calculationMode() === 'totalToSend'
      ? 'Monto total a enviar'
      : 'Monto neto que quiero recibir',
  );

  primaryLabel = computed(() =>
    this.calculationMode() === 'totalToSend' ? 'Puedes enviar' : 'Debes transferir',
  );

  primaryDescription = computed(() =>
    this.calculationMode() === 'totalToSend'
      ? 'Monto neto después del impuesto aplicable'
      : 'Transferencia mínima para lograr tu meta neta',
  );

  primaryAmount = computed(() =>
    this.calculationMode() === 'totalToSend'
      ? this.result().net
      : this.result().total,
  );

  goalOptions = computed<ReadonlyArray<TaxMilGoalOption>>(() =>
    this.calculationMode() === 'desiredNet'
      ? this.engine.goalOptions(this.amount(), this.isExempt())
      : [],
  );

  dashboardPills = computed<ReadonlyArray<HeaderPill>>(() => [
    {
      id: 'mode',
      label: 'Modo',
      value: this.modeTitle(),
      tone: 'neutral',
    },
    {
      id: 'limit',
      label: 'Tope exento',
      value: this.formatCOP(this.EXEMPT_LIMIT_COP),
      tone: 'cyan',
    },
    {
      id: 'tax',
      label: 'Impuesto estimado',
      value: this.amount() > 0 ? this.formatCOP(this.taxAmount()) : '—',
      tone: 'mint',
    },
  ]);

  summaryRows = computed<ReadonlyArray<SummaryRow>>(() => {
    if (this.calculationMode() === 'totalToSend') {
      return [
        {
          id: 'input',
          label: 'Monto ingresado',
          value: this.formatCOP(this.amount()),
        },
        {
          id: 'tax',
          label: this.isExempt()
            ? '(-) GMF sobre excedente'
            : '(-) Impuesto 4×1000',
          value: `- ${this.formatCOP(this.taxAmount())}`,
          tone: 'tax',
        },
        {
          id: 'total',
          label: '= Puedes enviar',
          value: this.formatCOP(this.netAmount()),
          tone: 'net',
          total: true,
        },
      ];
    }

    return [
      {
        id: 'input',
        label: 'Meta neta',
        value: this.formatCOP(this.amount()),
      },
      {
        id: 'tax',
        label: this.isExempt()
          ? '(+) GMF sobre excedente'
          : '(+) Impuesto 4×1000',
        value: this.formatCOP(this.taxAmount()),
        tone: 'tax',
      },
      {
        id: 'total',
        label: '= Total a transferir',
        value: this.formatCOP(this.totalAmount()),
        tone: 'net',
        total: true,
      },
    ];
  });

  taxAmount = computed(() => {
    return this.result().tax;
  });

  netAmount = computed(() => {
    return this.result().net;
  });

  totalAmount = computed(() => {
    return this.result().total;
  });

  taxPercentageOfTotal = computed(() => {
    return this.result().taxPercentageOfTotal;
  });

  exemptCoveredAmount = computed(() => {
    return this.result().exemptCovered;
  });

  taxableExcessAmount = computed(() => {
    return this.result().taxableBase;
  });

  exemptionExceeded = computed(() => {
    return this.isExempt() && this.taxableExcessAmount() > 0;
  });

  onInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const digits = this.engine.digitsOnly(input.value);
    this.rawInput.set(digits);
    input.value = this.engine.formatGroupedDigits(digits);

    this.copied.set(false);
  }

  onExemptToggle(event: Event) {
    const input = event.target as HTMLInputElement;
    this.isExempt.set(input.checked);
    this.copied.set(false);
  }

  onModeChange(mode: TaxMilCalculationMode) {
    if (this.calculationMode() === mode) {
      return;
    }

    this.calculationMode.set(mode);
    this.copied.set(false);
  }

  applyQuickAmount(value: number) {
    const normalizedValue = Math.max(0, Math.round(value));
    this.rawInput.set(String(normalizedValue));
    this.copied.set(false);
  }

  clear() {
    this.rawInput.set('');
    this.copied.set(false);
  }

  async copyNetAmount() {
    const value = this.primaryAmount();
    if (value <= 0) return;

    try {
      await navigator.clipboard.writeText(value.toString());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.copied.set(false);
    }
  }

  formatCOP(value: number): string {
    return this.engine.formatCOP(value);
  }
}
