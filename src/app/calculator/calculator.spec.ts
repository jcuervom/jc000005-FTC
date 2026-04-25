/// <reference types="jasmine" />

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Calculator } from './calculator';
import {
  TaxMilHistoryStore,
  TaxMilExportBuilder,
  TaxMilCalculatorEngine,
  TaxMilBatchProcessor,
  TaxMilBudgetStore,
  TaxMilCurrencyConverter,
  TaxMilThemeStore,
  TaxMilI18n,
} from './tax-mil.engine';

describe('Calculator', () => {
  let component: Calculator;
  let fixture: ComponentFixture<Calculator>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Calculator],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(Calculator);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ─── Signal & Computed Tests ──────────────────────────

  describe('amount computation', () => {
    it('should return 0 when rawInput is empty', () => {
      component.rawInput.set('');
      expect(component.amount()).toBe(0);
    });

    it('should parse numeric string correctly', () => {
      component.rawInput.set('270000');
      expect(component.amount()).toBe(270000);
    });

    it('should strip non-digit characters', () => {
      component.rawInput.set('270.000');
      expect(component.amount()).toBe(270000);
    });

    it('should handle single digit', () => {
      component.rawInput.set('5');
      expect(component.amount()).toBe(5);
    });

    it('should handle large numbers', () => {
      component.rawInput.set('1000000000');
      expect(component.amount()).toBe(1000000000);
    });
  });

  describe('taxAmount computation', () => {
    it('should return 0 when amount is 0', () => {
      component.rawInput.set('');
      expect(component.taxAmount()).toBe(0);
    });

    it('should calculate 4x1000 tax correctly for 270000', () => {
      component.rawInput.set('270000');
      // tax = 270000 * 0.004 / 1.004 = 1076.09... => rounded to 1076
      expect(component.taxAmount()).toBe(1076);
    });

    it('should calculate tax correctly for 1000000', () => {
      component.rawInput.set('1000000');
      // tax = 1000000 * 0.004 / 1.004 = 3984.06... => rounded to 3984
      expect(component.taxAmount()).toBe(3984);
    });

    it('should calculate tax correctly for 100000', () => {
      component.rawInput.set('100000');
      // tax = 100000 * 0.004 / 1.004 = 398.40... => rounded to 398
      expect(component.taxAmount()).toBe(398);
    });

    it('should handle very small amounts', () => {
      component.rawInput.set('1000');
      // tax = 1000 * 0.004 / 1.004 = 3.98... => rounded to 4
      expect(component.taxAmount()).toBe(4);
    });

    it('should not charge tax when exempt and under monthly limit', () => {
      component.isExempt.set(true);
      component.rawInput.set((component.EXEMPT_LIMIT_COP - 1000).toString());

      expect(component.taxAmount()).toBe(0);
      expect(component.exemptionExceeded()).toBe(false);
    });

    it('should charge tax only on excess when exempt and over monthly limit', () => {
      component.isExempt.set(true);
      component.rawInput.set(
        (component.EXEMPT_LIMIT_COP + 1_004_000).toString(),
      );

      const expectedTax = Math.round(
        (1_004_000 * component.TAX_RATE) / (1 + component.TAX_RATE),
      );
      expect(component.taxAmount()).toBe(expectedTax);
      expect(component.exemptionExceeded()).toBe(true);
      expect(component.taxableExcessAmount()).toBeGreaterThan(0);
      expect(component.exemptCoveredAmount()).toBe(component.EXEMPT_LIMIT_COP);
    });
  });

  describe('desired net mode', () => {
    it('should calculate minimum transfer for desired net amount', () => {
      component.calculationMode.set('desiredNet');
      component.rawInput.set('1000000');

      expect(component.totalAmount()).toBe(1004000);
      expect(component.taxAmount()).toBe(4000);
      expect(component.netAmount()).toBe(1000000);
      expect(component.primaryAmount()).toBe(component.totalAmount());
    });

    it('should keep desired net untaxed while exempt is under legal cap', () => {
      component.calculationMode.set('desiredNet');
      component.isExempt.set(true);
      component.rawInput.set((component.EXEMPT_LIMIT_COP - 2000).toString());

      expect(component.taxAmount()).toBe(0);
      expect(component.totalAmount()).toBe(component.amount());
      expect(component.exemptionExceeded()).toBe(false);
    });
  });

  describe('netAmount computation', () => {
    it('should return 0 when amount is 0', () => {
      component.rawInput.set('');
      expect(component.netAmount()).toBe(0);
    });

    it('should equal amount minus tax', () => {
      component.rawInput.set('270000');
      const expectedTax = component.taxAmount();
      expect(component.netAmount()).toBe(270000 - expectedTax);
    });

    it('should be less than the original amount', () => {
      component.rawInput.set('500000');
      expect(component.netAmount()).toBeLessThan(500000);
      expect(component.netAmount()).toBeGreaterThan(0);
    });

    it('net + tax should equal the original amount', () => {
      component.rawInput.set('270000');
      expect(component.netAmount() + component.taxAmount()).toBe(270000);
    });

    it('net + tax should equal original for 1M', () => {
      component.rawInput.set('1000000');
      expect(component.netAmount() + component.taxAmount()).toBe(1000000);
    });
  });

  describe('taxPercentageOfTotal computation', () => {
    it('should return 0 when amount is 0', () => {
      component.rawInput.set('');
      expect(component.taxPercentageOfTotal()).toBe(0);
    });

    it('should be approximately 0.4% (4 per 1000)', () => {
      component.rawInput.set('1000000');
      const pct = component.taxPercentageOfTotal();
      expect(pct).toBeGreaterThan(0.39);
      expect(pct).toBeLessThan(0.41);
    });
  });

  // ─── Method Tests ─────────────────────────────────────

  describe('formatCOP', () => {
    it('should format 0', () => {
      expect(component.formatCOP(0)).toContain('$ ');
      expect(component.formatCOP(0)).toContain('0');
    });

    it('should format 270000 with thousands separator', () => {
      const result = component.formatCOP(270000);
      expect(result).toContain('$');
      // Should contain some form of 270 and 000
      expect(result.replaceAll(/\D/g, '')).toBe('270000');
    });

    it('should format 1000000', () => {
      const result = component.formatCOP(1000000);
      expect(result).toContain('$');
      expect(result.replaceAll(/\D/g, '')).toBe('1000000');
    });
  });

  describe('onInput', () => {
    it('should update rawInput from input event', () => {
      const inputEl = document.createElement('input');
      inputEl.value = '270.000';
      const event = { target: inputEl } as unknown as Event;

      component.onInput(event);
      expect(component.rawInput()).toBe('270000');
    });

    it('should format the input value with separators', () => {
      const inputEl = document.createElement('input');
      inputEl.value = '1000000';
      const event = { target: inputEl } as unknown as Event;

      component.onInput(event);
      // The input value should be formatted (not raw digits)
      expect(inputEl.value).not.toBe('1000000');
      expect(inputEl.value.replaceAll(/\D/g, '')).toBe('1000000');
    });

    it('should handle empty input', () => {
      const inputEl = document.createElement('input');
      inputEl.value = '';
      const event = { target: inputEl } as unknown as Event;

      component.onInput(event);
      expect(component.rawInput()).toBe('');
      expect(inputEl.value).toBe('');
    });

    it('should reset copied state on new input', () => {
      component.copied.set(true);
      const inputEl = document.createElement('input');
      inputEl.value = '100';
      const event = { target: inputEl } as unknown as Event;

      component.onInput(event);
      expect(component.copied()).toBe(false);
    });
  });

  describe('onExemptToggle', () => {
    it('should enable exempt mode when checkbox is checked', () => {
      const inputEl = document.createElement('input');
      inputEl.checked = true;
      const event = { target: inputEl } as unknown as Event;

      component.onExemptToggle(event);
      expect(component.isExempt()).toBe(true);
    });

    it('should reset copied state when toggling exempt mode', () => {
      component.copied.set(true);
      const inputEl = document.createElement('input');
      inputEl.checked = true;
      const event = { target: inputEl } as unknown as Event;

      component.onExemptToggle(event);
      expect(component.copied()).toBe(false);
    });
  });

  describe('clear', () => {
    it('should reset rawInput to empty string', () => {
      component.rawInput.set('270000');
      component.clear();
      expect(component.rawInput()).toBe('');
    });

    it('should reset amount to 0', () => {
      component.rawInput.set('270000');
      component.clear();
      expect(component.amount()).toBe(0);
    });

    it('should reset copied state', () => {
      component.copied.set(true);
      component.clear();
      expect(component.copied()).toBe(false);
    });
  });

  describe('copyNetAmount', () => {
    it('should not copy when amount is 0', async () => {
      component.rawInput.set('');
      const clipboardSpy = spyOn(
        navigator.clipboard,
        'writeText',
      ).and.returnValue(Promise.resolve());

      await component.copyNetAmount();
      expect(clipboardSpy).not.toHaveBeenCalled();
      expect(component.copied()).toBe(false);
    });

    it('should copy net amount to clipboard', async () => {
      component.rawInput.set('270000');
      const netValue = component.netAmount();
      const clipboardSpy = spyOn(
        navigator.clipboard,
        'writeText',
      ).and.returnValue(Promise.resolve());

      await component.copyNetAmount();
      expect(clipboardSpy).toHaveBeenCalledWith(netValue.toString());
      expect(component.copied()).toBe(true);
    });

    it('should reset copied state after 2 seconds', async () => {
      component.rawInput.set('270000');
      spyOn(navigator.clipboard, 'writeText').and.returnValue(
        Promise.resolve(),
      );
      jasmine.clock().install();

      await component.copyNetAmount();
      expect(component.copied()).toBe(true);

      jasmine.clock().tick(2000);
      expect(component.copied()).toBe(false);

      jasmine.clock().uninstall();
    });
  });

  // ─── DOM / Template Tests ─────────────────────────────

  describe('template rendering', () => {
    it('should show header', () => {
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('h1')?.textContent).toContain('4×1000');
    });

    it('should show input field', () => {
      const el: HTMLElement = fixture.nativeElement;
      const input = el.querySelector('input#amount') as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.getAttribute('inputmode')).toBe('numeric');
    });

    it('should render exempt toggle control', () => {
      const el: HTMLElement = fixture.nativeElement;
      const toggle = el.querySelector(
        'input#exempt-toggle',
      ) as HTMLInputElement;
      expect(toggle).toBeTruthy();
      expect(toggle.type).toBe('checkbox');
    });

    it('should not show results when amount is 0', () => {
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.results')).toBeNull();
    });

    it('should show results after entering amount', () => {
      component.rawInput.set('270000');
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.results')).toBeTruthy();
      expect(el.querySelector('.main-card')).toBeTruthy();
      expect(el.querySelector('.tax-card')).toBeTruthy();
    });

    it('should display net amount in main card', () => {
      component.rawInput.set('270000');
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const mainValue = el.querySelector('.main-value');
      expect(mainValue?.textContent).toContain('$');
    });

    it('should show copy button when results are visible', () => {
      component.rawInput.set('270000');
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const copyBtn = el.querySelector('.copy-btn');
      expect(copyBtn).toBeTruthy();
      expect(copyBtn?.textContent?.trim()).toContain('Copiar');
    });

    it('should show "Copiado" text after copying', async () => {
      component.rawInput.set('270000');
      spyOn(navigator.clipboard, 'writeText').and.returnValue(
        Promise.resolve(),
      );

      await component.copyNetAmount();
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const copyBtn = el.querySelector('.copy-btn');
      expect(copyBtn?.textContent?.trim()).toContain('Copiado');
      expect(copyBtn?.classList.contains('copied')).toBe(true);
    });

    it('should show clear button when amount > 0', () => {
      component.rawInput.set('100000');
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.clear-btn')).toBeTruthy();
    });

    it('should hide clear button when amount is 0', () => {
      component.rawInput.set('');
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.clear-btn')).toBeNull();
    });

    it('should display breakdown section', () => {
      component.rawInput.set('500000');
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.breakdown')).toBeTruthy();
      expect(el.querySelector('.breakdown-bar')).toBeTruthy();
      expect(el.querySelector('.breakdown-summary')).toBeTruthy();
    });

    it('should show info footer', () => {
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.info-footer')).toBeTruthy();
      expect(el.querySelector('.info-footer')?.textContent).toContain('GMF');
    });

    it('should show exempt hint when exempt mode is enabled', () => {
      component.isExempt.set(true);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.exempt-hint')).toBeTruthy();
    });
  });

  // ─── Accessibility Tests ──────────────────────────────

  describe('accessibility', () => {
    it('should use semantic main element', () => {
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('main')).toBeTruthy();
    });

    it('should use semantic header element', () => {
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('header')).toBeTruthy();
    });

    it('should use semantic footer element', () => {
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('footer')).toBeTruthy();
    });

    it('should have aria-label on input', () => {
      const el: HTMLElement = fixture.nativeElement;
      const input = el.querySelector('input#amount');
      expect(input?.getAttribute('aria-label')).toBeTruthy();
    });

    it('should have aria-label on input', () => {
      const el: HTMLElement = fixture.nativeElement;
      const input = el.querySelector('input#amount');
      expect(input?.getAttribute('aria-label')).toBeTruthy();
    });

    it('should have aria-live on results section', () => {
      component.rawInput.set('270000');
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const results = el.querySelector('.results');
      expect(results?.getAttribute('aria-live')).toBe('polite');
    });

    it('should have proper aria-label on copy button', () => {
      component.rawInput.set('270000');
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const copyBtn = el.querySelector('.copy-btn');
      expect(copyBtn?.getAttribute('aria-label')).toContain('Copiar');
    });

    it('should have aria-hidden on decorative icons', () => {
      const el: HTMLElement = fixture.nativeElement;
      const headerIcon = el.querySelector('.header-icon');
      expect(headerIcon?.getAttribute('aria-hidden')).toBe('true');
    });
  });

  // ─── Edge Cases ───────────────────────────────────────

  describe('edge cases', () => {
    it('should handle amount of 1', () => {
      component.rawInput.set('1');
      expect(component.amount()).toBe(1);
      expect(component.taxAmount()).toBe(0); // rounds to 0
      expect(component.netAmount()).toBe(1);
    });

    it('should handle amount of 250 (exact 4x1000 boundary)', () => {
      component.rawInput.set('250');
      expect(component.amount()).toBe(250);
      expect(component.taxAmount()).toBe(1);
      expect(component.netAmount()).toBe(249);
    });

    it('TAX_RATE should be 0.004', () => {
      expect(component.TAX_RATE).toBe(0.004);
    });
  });

  // ─── History & Export Tests ───────────────────────────

  describe('history store', () => {
    it('should save calculation to history', () => {
      component.rawInput.set('500000');
      component.saveCalculation();

      expect(component.historyStore.entries.length).toBeGreaterThanOrEqual(1);
    });

    it('should apply history entry', () => {
      const entry = {
        id: 'test',
        date: new Date().toISOString(),
        mode: 'desiredNet' as const,
        inputAmount: 300000,
        total: 301200,
        tax: 1200,
        net: 300000,
        isExempt: false,
      };

      component.applyHistoryEntry(entry);
      expect(component.calculationMode()).toBe('desiredNet');
      expect(component.amount()).toBe(300000);
      expect(component.isExempt()).toBe(false);
    });

    it('should clear history', () => {
      component.rawInput.set('100000');
      component.saveCalculation();
      component.clearHistory();

      expect(component.historyStore.entries.length).toBe(0);
    });

    it('should not save when amount is 0', () => {
      const before = component.historyStore.entries.length;
      component.rawInput.set('');
      component.saveCalculation();
      expect(component.historyStore.entries.length).toBe(before);
    });
  });

  describe('professional panel', () => {
    it('should toggle professional panel', () => {
      expect(component.professionalExpanded()).toBe(false);
      component.toggleProfessional();
      expect(component.professionalExpanded()).toBe(true);
      component.toggleProfessional();
      expect(component.professionalExpanded()).toBe(false);
    });
  });

  describe('new template sections', () => {
    it('should render history section', () => {
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('[aria-label]')).toBeTruthy();
      expect(el.querySelector('.section-label')).toBeTruthy();
    });

    it('should render professional panel', () => {
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.panel-toggle')).toBeTruthy();
    });

    it('should render feedback section', () => {
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.feedback-section')).toBeTruthy();
    });

    it('should show result actions when amount > 0', () => {
      component.rawInput.set('500000');
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.result-actions')).toBeTruthy();
    });
  });
});

// ─── Standalone Engine & Export Tests ────────────────

describe('TaxMilCalculatorEngine', () => {
  const engine = new TaxMilCalculatorEngine();

  it('should calculate exempt limit as 350 * UVT', () => {
    expect(engine.exemptLimitCOP).toBe(Math.round(350 * 52_374));
  });

  it('should format COP correctly', () => {
    const result = engine.formatCOP(1234567);
    expect(result).toContain('$');
    expect(result.replaceAll(/\D/g, '')).toBe('1234567');
  });

  it('should strip non-digits', () => {
    expect(engine.digitsOnly('abc$123.456')).toBe('123456');
  });

  it('should format grouped digits', () => {
    const result = engine.formatGroupedDigits('1234567');
    expect(result.replaceAll(/\D/g, '')).toBe('1234567');
  });

  it('should return empty for empty digits', () => {
    expect(engine.formatGroupedDigits('')).toBe('');
  });

  it('should return 0 for empty amount', () => {
    expect(engine.amountFrom('')).toBe(0);
  });

  it('should compute goal options for desiredNet', () => {
    const options = engine.goalOptions(250_000, false);
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options[0].id).toBe('exact');
    expect(options.every((o) => o.net >= 250_000)).toBe(true);
  });

  it('should return empty goal options for 0', () => {
    expect(engine.goalOptions(0, false)).toEqual([]);
  });

  it('tax percentage should be consistent', () => {
    const result = engine.breakdown('totalToSend', 1_000_000, false);
    const expected = (result.tax / result.total) * 100;
    expect(Math.abs(result.taxPercentageOfTotal - expected)).toBeLessThan(
      0.0001,
    );
  });
});

describe('TaxMilHistoryStore', () => {
  beforeEach(() => {
    localStorage.removeItem('taxmil.history.v1');
  });

  it('should start with empty entries', () => {
    const store = new TaxMilHistoryStore();
    // may have previous entries from other tests
    store.clear();
    expect(store.entries.length).toBe(0);
  });

  it('should add entries and persist', () => {
    const store = new TaxMilHistoryStore();
    store.clear();
    const engine = new TaxMilCalculatorEngine();
    const result = engine.breakdown('totalToSend', 500_000, false);
    store.addEntry('totalToSend', 500_000, result, false);
    expect(store.entries.length).toBe(1);

    const store2 = new TaxMilHistoryStore();
    expect(store2.entries.length).toBe(1);
  });

  it('should limit to 60 entries', () => {
    const store = new TaxMilHistoryStore();
    store.clear();
    const engine = new TaxMilCalculatorEngine();

    for (let i = 1; i <= 70; i++) {
      const result = engine.breakdown('totalToSend', i * 1_000, false);
      store.addEntry('totalToSend', i * 1_000, result, false);
    }

    expect(store.entries.length).toBe(60);
  });

  it('should compute potential savings', () => {
    const store = new TaxMilHistoryStore();
    store.clear();
    const engine = new TaxMilCalculatorEngine();
    const result = engine.breakdown('totalToSend', 1_000_000, false);
    store.addEntry('totalToSend', 1_000_000, result, false);
    expect(store.potentialSavingsIfExempt()).toBe(result.tax);
  });
});

describe('TaxMilExportBuilder', () => {
  it('should generate CSV with header', () => {
    const csv = TaxMilExportBuilder.csv([]);
    expect(csv).toBe('date,mode,input,total,tax,net,isExempt');
  });

  it('should generate CSV with rows', () => {
    const entry = {
      id: '1',
      date: '2026-01-01T00:00:00.000Z',
      mode: 'totalToSend' as const,
      inputAmount: 500_000,
      total: 500_000,
      tax: 1_992,
      net: 498_008,
      isExempt: false,
    };
    const csv = TaxMilExportBuilder.csv([entry]);
    const lines = csv.split('\n');
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain('totalToSend');
  });

  it('should generate PDF HTML content', () => {
    const engine = new TaxMilCalculatorEngine();
    const result = engine.breakdown('totalToSend', 500_000, false);
    const html = TaxMilExportBuilder.generatePDFContent(
      'totalToSend',
      500_000,
      result,
      false,
      engine,
    );
    expect(html).toContain('TaxMil');
    expect(html).toContain('500');
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('should generate PDF binary data without print dialog', () => {
    const engine = new TaxMilCalculatorEngine();
    const result = engine.breakdown('totalToSend', 500_000, false);
    const pdfData = TaxMilExportBuilder.generatePDFData(
      'totalToSend',
      500_000,
      result,
      false,
      engine,
    );

    expect(pdfData.byteLength).toBeGreaterThan(0);
    const header = new TextDecoder().decode(pdfData.slice(0, 5));
    expect(header).toContain('%PDF');
  });
});

// ─── Batch Processor Tests ──────────────────────────

describe('TaxMilBatchProcessor', () => {
  const engine = new TaxMilCalculatorEngine();

  it('should process multiple amounts', () => {
    const result = TaxMilBatchProcessor.process(
      engine,
      [100_000, 200_000],
      'totalToSend',
      false,
    );
    expect(result.lines.length).toBe(2);
    expect(result.totalTax).toBeGreaterThan(0);
  });

  it('should handle exempt amounts', () => {
    const result = TaxMilBatchProcessor.process(
      engine,
      [10_000_000],
      'totalToSend',
      true,
    );
    expect(result.lines[0].result.tax).toBe(0);
    expect(result.totalTax).toBe(0);
  });

  it('should handle empty array', () => {
    const result = TaxMilBatchProcessor.process(
      engine,
      [],
      'totalToSend',
      false,
    );
    expect(result.lines.length).toBe(0);
    expect(result.totalTax).toBe(0);
  });
});

// ─── Budget Store Tests ─────────────────────────────

describe('TaxMilBudgetStore', () => {
  beforeEach(() => localStorage.removeItem('taxmil.budget.v1'));

  it('should set and get budget', () => {
    const store = new TaxMilBudgetStore();
    store.setBudget(50_000);
    expect(store.monthlyBudget).toBe(50_000);
  });

  it('should track spending', () => {
    const store = new TaxMilBudgetStore();
    store.setBudget(10_000);
    const usage = store.getUsage(3_000);
    expect(usage.spent).toBe(3_000);
    expect(usage.remaining).toBe(7_000);
    expect(usage.overBudget).toBe(false);
  });

  it('should detect over budget', () => {
    const store = new TaxMilBudgetStore();
    store.setBudget(1_000);
    expect(store.getUsage(2_000).overBudget).toBe(true);
  });
});

// ─── Currency Converter Tests ───────────────────────

describe('TaxMilCurrencyConverter', () => {
  beforeEach(() => {
    localStorage.removeItem('taxmil.usdrate.v1');
    localStorage.removeItem('taxmil.usdrate.snapshot.v2');
    localStorage.removeItem('taxmil.usdrate.history.v1');
  });

  it('should convert COP to USD', () => {
    const conv = new TaxMilCurrencyConverter();
    const usd = conv.toUSD(4_150_000);
    expect(usd).toBeCloseTo(1_000, 0);
  });

  it('should allow custom rate', () => {
    const conv = new TaxMilCurrencyConverter();
    conv.setRate(4_000);
    expect(conv.toUSD(8_000_000)).toBeCloseTo(2_000, 0);
  });

  it('should parse official TRM payload', () => {
    const parsed = TaxMilCurrencyConverter.parseOfficialResponse({
      fecha: '20260424',
      hora: '12:59:58',
      precioPromedio: 3551.2455,
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.rate).toBe(3551);
    expect(parsed?.sourceDate).toBeTruthy();
  });

  it('should refresh official TRM and mark source as official', async () => {
    const conv = new TaxMilCurrencyConverter();

    const fetchFn = (async () =>
      ({
        ok: true,
        json: async () => ({
          fecha: '20260424',
          hora: '12:00:00',
          precioPromedio: 3551.24,
        }),
      }) as Response) as typeof fetch;

    await conv.refreshOfficialRate({
      force: true,
      now: new Date('2026-04-25T12:00:00Z'),
      fetchFn,
    });

    expect(conv.source).toBe('official');
    expect(conv.rate).toBe(3551);
    expect(conv.status).toBe('ready');
    expect(conv.snapshot().history.length).toBeGreaterThan(0);
  });

  it('should keep local rate when official source fails', async () => {
    const conv = new TaxMilCurrencyConverter();
    conv.setRate(4200);

    const fetchFn = (async () => {
      throw new Error('network-error');
    }) as typeof fetch;

    await conv.refreshOfficialRate({ force: true, fetchFn });

    expect(conv.rate).toBe(4200);
    expect(conv.status).toBe('source-unavailable');
  });

  it('should compute daily variation from local TRM history', async () => {
    const conv = new TaxMilCurrencyConverter();

    const fetchDay1 = (async () =>
      ({
        ok: true,
        json: async () => ({
          fecha: '20260424',
          hora: '12:00:00',
          precioPromedio: 3500,
        }),
      }) as Response) as typeof fetch;

    const fetchDay2 = (async () =>
      ({
        ok: true,
        json: async () => ({
          fecha: '20260425',
          hora: '12:00:00',
          precioPromedio: 3550,
        }),
      }) as Response) as typeof fetch;

    await conv.refreshOfficialRate({
      force: true,
      now: new Date('2026-04-24T12:00:00Z'),
      fetchFn: fetchDay1,
    });
    await conv.refreshOfficialRate({
      force: true,
      now: new Date('2026-04-25T12:00:00Z'),
      fetchFn: fetchDay2,
    });

    expect(conv.dailyVariation()).toBe(50);
    expect(conv.dailyVariationPercent()).toBeCloseTo(1.428, 2);
  });
});

// ─── Theme Store Tests ──────────────────────────────

describe('TaxMilThemeStore', () => {
  beforeEach(() => localStorage.removeItem('taxmil.theme.v1'));

  it('should default to auto', () => {
    const store = new TaxMilThemeStore();
    expect(store.preference).toBe('auto');
  });

  it('should cycle through modes', () => {
    const store = new TaxMilThemeStore();
    store.cycle();
    expect(store.preference).toBe('light');
    store.cycle();
    expect(store.preference).toBe('dark');
    store.cycle();
    expect(store.preference).toBe('auto');
  });

  it('should resolve auto to dark or light', () => {
    const store = new TaxMilThemeStore();
    expect(['dark', 'light']).toContain(store.resolved);
  });
});

// ─── i18n Tests ─────────────────────────────────────

describe('TaxMilI18n', () => {
  beforeEach(() => localStorage.removeItem('taxmil.lang.v1'));

  it('should default to es', () => {
    const i18n = new TaxMilI18n();
    expect(i18n.lang).toBe('es');
  });

  it('should toggle language', () => {
    const i18n = new TaxMilI18n();
    i18n.toggle();
    expect(i18n.lang).toBe('en');
    i18n.toggle();
    expect(i18n.lang).toBe('es');
  });

  it('should translate keys', () => {
    const i18n = new TaxMilI18n();
    expect(i18n.t('title')).toBeTruthy();
    i18n.toggle();
    expect(i18n.t('title')).toBeTruthy();
  });

  it('should return key for unknown translations', () => {
    const i18n = new TaxMilI18n();
    expect(i18n.t('nonexistent_key_xyz')).toBe('nonexistent_key_xyz');
  });
});

// ─── History Filter & Notes Tests ───────────────────

describe('TaxMilHistoryStore advanced', () => {
  beforeEach(() => localStorage.removeItem('taxmil.history.v1'));

  it('should filter by exempt status', () => {
    const store = new TaxMilHistoryStore();
    store.clear();
    const engine = new TaxMilCalculatorEngine();
    store.addEntry(
      'totalToSend',
      500_000,
      engine.breakdown('totalToSend', 500_000, false),
      false,
    );
    store.addEntry(
      'totalToSend',
      500_000,
      engine.breakdown('totalToSend', 500_000, true),
      true,
    );
    const taxed = store.filterEntries({ isExempt: false });
    const exempt = store.filterEntries({ isExempt: true });
    expect(taxed.length).toBe(1);
    expect(exempt.length).toBe(1);
  });

  it('should update note on entry', () => {
    const store = new TaxMilHistoryStore();
    store.clear();
    const engine = new TaxMilCalculatorEngine();
    store.addEntry(
      'totalToSend',
      100_000,
      engine.breakdown('totalToSend', 100_000, false),
      false,
    );
    const id = store.entries[0].id;
    store.updateNote(id, 'Test note');
    expect(store.entries[0].note).toBe('Test note');
  });

  it('should get monthly aggregation', () => {
    const store = new TaxMilHistoryStore();
    store.clear();
    const agg = store.getMonthlyAggregation();
    expect(agg.length).toBe(12);
  });
});
