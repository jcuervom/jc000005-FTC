import {
  Component,
  signal,
  computed,
  ElementRef,
  inject,
  OnInit,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import {
  TaxMilCalculatorEngine,
  TaxMilHistoryStore,
  TaxMilExportBuilder,
  TaxMilBudgetStore,
  TaxMilBatchProcessor,
  TaxMilCurrencyConverter,
  TaxMilThemeStore,
  TaxMilI18n,
  type TaxMilCalculationMode,
  type TaxMilGoalOption,
  type TaxMilHistoryEntry,
  type TaxMilHistoryFilter,
  type TaxMilMonthlyAggregate,
  type TaxMilBatchSummary,
  type TaxMilBudgetUsage,
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
  imports: [DatePipe, DecimalPipe],
  templateUrl: './calculator.html',
  styleUrl: './calculator.scss',
})
export class Calculator implements OnInit {
  private readonly engine = new TaxMilCalculatorEngine();
  private readonly elRef = inject(ElementRef);

  readonly TAX_RATE = this.engine.taxRate;
  readonly EXEMPT_LIMIT_UVT = this.engine.EXEMPT_LIMIT_UVT;
  readonly UVT_VALUE_COP = this.engine.UVT_VALUE_COP;
  readonly EXEMPT_LIMIT_COP = this.engine.exemptLimitCOP;

  // ─── Stores ────────────────────────────────────────
  readonly historyStore = new TaxMilHistoryStore();
  readonly budgetStore = new TaxMilBudgetStore();
  readonly currencyConverter = new TaxMilCurrencyConverter();
  readonly themeStore = new TaxMilThemeStore();
  readonly i18n = new TaxMilI18n();

  readonly modeOptions: ReadonlyArray<{
    id: TaxMilCalculationMode;
    label: string;
  }> = [
    { id: 'totalToSend', label: 'Total a enviar' },
    { id: 'desiredNet', label: 'Meta neta' },
  ];

  readonly quickAmounts: ReadonlyArray<number> = [
    100_000, 250_000, 500_000, 1_000_000,
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
    this.calculationMode() === 'totalToSend'
      ? 'Puedes enviar'
      : 'Debes transferir',
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

  // ─── UI State ──────────────────────────────────────
  professionalExpanded = signal(false);
  batchExpanded = signal(false);
  budgetExpanded = signal(false);
  chartExpanded = signal(false);
  simulatorExpanded = signal(false);
  currencyExpanded = signal(false);
  batchInput = signal('');
  budgetInput = signal('');
  historyFilter = signal<'all' | 'exempt' | 'taxed'>('all');
  historySearch = signal('');
  editingNoteId = signal<string | null>(null);
  editingNoteText = signal('');
  themeResolved = signal(this.themeStore.resolved);
  langSignal = signal(this.i18n.lang);

  // ─── Computed ──────────────────────────────────────
  historyEntries = computed(() => {
    const filter: TaxMilHistoryFilter = {};
    const f = this.historyFilter();
    if (f === 'exempt') filter.isExempt = true;
    if (f === 'taxed') filter.isExempt = false;
    const search = this.historySearch();
    if (search) filter.search = search;
    return this.historyStore.filterEntries(filter).slice(0, 8);
  });

  frequentAmounts = computed(() => this.historyStore.frequentAmounts(4));

  monthlyTaxPaid = computed(() => this.historyStore.totalTaxPaidThisMonth());

  potentialSavings = computed(() =>
    this.historyStore.potentialSavingsIfExempt(),
  );

  budgetUsage = computed<TaxMilBudgetUsage>(() =>
    this.budgetStore.getUsage(this.monthlyTaxPaid()),
  );

  batchResult = computed<TaxMilBatchSummary | null>(() => {
    const text = this.batchInput();
    if (!text.trim()) return null;
    const amounts = text
      .split(/[\n,;]+/)
      .map((s) => this.engine.amountFrom(s.trim()))
      .filter((a) => a > 0);
    if (amounts.length === 0) return null;
    return TaxMilBatchProcessor.process(
      this.engine,
      amounts,
      this.calculationMode(),
      this.isExempt(),
    );
  });

  chartData = computed<TaxMilMonthlyAggregate[]>(() =>
    this.historyStore.getMonthlyAggregation(),
  );

  chartMax = computed(() => {
    const data = this.chartData();
    return Math.max(1, ...data.map((d) => d.totalTax));
  });

  exemptionSimulation = computed(() => this.historyStore.simulateExemption());

  usdEquivalent = computed(() =>
    this.amount() > 0
      ? this.currencyConverter.formatUSD(this.primaryAmount())
      : '—',
  );

  // ─── i18n helper ───────────────────────────────────
  t(key: string, params?: Record<string, string>): string {
    this.langSignal(); // trigger reactivity
    return this.i18n.t(key, params);
  }

  saveCalculation(): void {
    if (this.amount() <= 0) return;
    this.historyStore.addEntry(
      this.calculationMode(),
      this.amount(),
      this.result(),
      this.isExempt(),
    );
  }

  applyHistoryEntry(entry: TaxMilHistoryEntry): void {
    this.calculationMode.set(entry.mode);
    this.isExempt.set(entry.isExempt);
    this.rawInput.set(String(entry.inputAmount));
    this.copied.set(false);
  }

  clearHistory(): void {
    this.historyStore.clear();
  }

  applyFrequentAmount(amount: number): void {
    this.rawInput.set(String(amount));
    this.copied.set(false);
  }

  setHistoryFilter(filter: 'all' | 'exempt' | 'taxed'): void {
    this.historyFilter.set(filter);
  }

  onHistorySearch(event: Event): void {
    this.historySearch.set((event.target as HTMLInputElement).value);
  }

  startEditNote(entry: TaxMilHistoryEntry): void {
    this.editingNoteId.set(entry.id);
    this.editingNoteText.set(entry.note ?? '');
  }

  saveNote(id: string): void {
    this.historyStore.updateNote(id, this.editingNoteText());
    this.editingNoteId.set(null);
    this.editingNoteText.set('');
  }

  cancelEditNote(): void {
    this.editingNoteId.set(null);
    this.editingNoteText.set('');
  }

  onNoteInput(event: Event): void {
    this.editingNoteText.set((event.target as HTMLInputElement).value);
  }

  // ─── Toggles ───────────────────────────────────────
  toggleProfessional(): void {
    this.professionalExpanded.update((v) => !v);
  }

  toggleBatch(): void {
    this.batchExpanded.update((v) => !v);
  }

  toggleBudget(): void {
    this.budgetExpanded.update((v) => !v);
  }

  toggleChart(): void {
    this.chartExpanded.update((v) => !v);
  }

  toggleSimulator(): void {
    this.simulatorExpanded.update((v) => !v);
  }

  toggleCurrency(): void {
    this.currencyExpanded.update((v) => !v);
  }

  // ─── Theme ─────────────────────────────────────────
  cycleTheme(): void {
    this.themeStore.cycle();
    this.themeResolved.set(this.themeStore.resolved);
    this.applyTheme();
  }

  applyTheme(): void {
    const host = this.elRef.nativeElement as HTMLElement;
    host.dataset['theme'] = this.themeStore.resolved;
  }

  ngOnInit(): void {
    this.applyTheme();
  }

  // ─── Language ──────────────────────────────────────
  toggleLang(): void {
    this.i18n.toggle();
    this.langSignal.set(this.i18n.lang);
  }

  // ─── Batch ─────────────────────────────────────────
  onBatchInput(event: Event): void {
    this.batchInput.set((event.target as HTMLTextAreaElement).value);
  }

  clearBatch(): void {
    this.batchInput.set('');
  }

  // ─── Budget ────────────────────────────────────────
  onBudgetInput(event: Event): void {
    const digits = this.engine.digitsOnly(
      (event.target as HTMLInputElement).value,
    );
    this.budgetInput.set(digits);
  }

  setBudget(): void {
    const amount = Number(this.budgetInput());
    if (amount > 0) {
      this.budgetStore.setBudget(amount);
      this.budgetInput.set('');
    }
  }

  clearBudget(): void {
    this.budgetStore.setBudget(0);
  }

  // ─── Currency ──────────────────────────────────────
  onRateInput(event: Event): void {
    const digits = this.engine.digitsOnly(
      (event.target as HTMLInputElement).value,
    );
    if (digits) {
      this.currencyConverter.setRate(Number(digits));
    }
  }

  // ─── Exports ───────────────────────────────────────
  exportCSV(): void {
    const csv = TaxMilExportBuilder.csv(this.historyStore.entries);
    this.downloadFile(csv, 'taxmil-history.csv', 'text/csv');
  }

  exportPDF(): void {
    const html = TaxMilExportBuilder.generatePDFContent(
      this.calculationMode(),
      this.amount(),
      this.result(),
      this.isExempt(),
      this.engine,
    );
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.writeln(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  shareResult(): void {
    const mode =
      this.calculationMode() === 'totalToSend'
        ? this.t('mode.total')
        : this.t('mode.net');
    const primary =
      this.calculationMode() === 'totalToSend'
        ? this.formatCOP(this.netAmount())
        : this.formatCOP(this.totalAmount());

    const text = [
      'TaxMil',
      `${this.t('result.label.' + (this.calculationMode() === 'totalToSend' ? 'total' : 'net'))} ${primary}`,
      `${mode}: ${this.formatCOP(this.amount())}`,
      `${this.t('tax.label')}: ${this.formatCOP(this.taxAmount())}`,
      `${this.t('exempt.label')}: ${this.isExempt() ? 'Sí' : 'No'}`,
    ].join('\n');

    if (navigator.share) {
      navigator.share({ title: 'TaxMil', text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    this.saveCalculation();
  }

  private downloadFile(
    content: string,
    filename: string,
    mimeType: string,
  ): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
