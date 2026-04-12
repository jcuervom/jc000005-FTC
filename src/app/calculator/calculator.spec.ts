import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Calculator } from './calculator';

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
      component.rawInput.set((component.EXEMPT_LIMIT_COP + 1_004_000).toString());

      const expectedTax = Math.round((1_004_000 * component.TAX_RATE) / (1 + component.TAX_RATE));
      expect(component.taxAmount()).toBe(expectedTax);
      expect(component.exemptionExceeded()).toBe(true);
      expect(component.taxableExcessAmount()).toBeGreaterThan(0);
      expect(component.exemptCoveredAmount()).toBe(component.EXEMPT_LIMIT_COP);
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
      const toggle = el.querySelector('input#exempt-toggle') as HTMLInputElement;
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

    it('should have aria-describedby on input', () => {
      const el: HTMLElement = fixture.nativeElement;
      const input = el.querySelector('input#amount');
      expect(input?.getAttribute('aria-describedby')).toBe('input-help');
      expect(el.querySelector('#input-help')).toBeTruthy();
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
});
