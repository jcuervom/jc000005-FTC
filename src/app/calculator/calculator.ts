import { Component, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-calculator',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './calculator.html',
  styleUrl: './calculator.scss',
})
export class Calculator {
  readonly TAX_RATE = 4 / 1000; // 4x1000
  readonly EXEMPT_LIMIT_UVT = 350;
  readonly UVT_VALUE_COP = 52_374; // Referencia UVT 2026
  readonly EXEMPT_LIMIT_COP = Math.round(
    this.EXEMPT_LIMIT_UVT * this.UVT_VALUE_COP,
  );

  rawInput = signal('');
  copied = signal(false);
  isExempt = signal(false);

  amount = computed(() => {
    const cleaned = this.rawInput().replaceAll(/\D/g, '');
    return cleaned ? Number(cleaned) : 0;
  });

  taxAmount = computed(() => {
    const a = this.amount();
    if (a <= 0) return 0;

    if (!this.isExempt()) {
      return Math.round((a * this.TAX_RATE) / (1 + this.TAX_RATE));
    }

    if (a <= this.EXEMPT_LIMIT_COP) {
      return 0;
    }

    // Bajo exencion limitada, el GMF se calcula solo sobre el excedente.
    const taxableGross = a - this.EXEMPT_LIMIT_COP;
    return Math.round((taxableGross * this.TAX_RATE) / (1 + this.TAX_RATE));
  });

  netAmount = computed(() => {
    const a = this.amount();
    if (a <= 0) return 0;
    return a - this.taxAmount();
  });

  taxPercentageOfTotal = computed(() => {
    const a = this.amount();
    if (a <= 0) return 0;
    return (this.taxAmount() / a) * 100;
  });

  exemptCoveredAmount = computed(() => {
    if (!this.isExempt()) return 0;
    return Math.min(this.netAmount(), this.EXEMPT_LIMIT_COP);
  });

  taxableExcessAmount = computed(() => {
    if (!this.isExempt()) return this.netAmount();
    return Math.max(0, this.netAmount() - this.EXEMPT_LIMIT_COP);
  });

  exemptionExceeded = computed(() => {
    return this.isExempt() && this.taxableExcessAmount() > 0;
  });

  onInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const raw = input.value.replaceAll(/\D/g, '');
    this.rawInput.set(raw);

    if (raw) {
      const formatted = Number(raw).toLocaleString('es-CO');
      input.value = formatted;
    } else {
      input.value = '';
    }

    // Reset copied state on new input
    this.copied.set(false);
  }

  onExemptToggle(event: Event) {
    const input = event.target as HTMLInputElement;
    this.isExempt.set(input.checked);
    this.copied.set(false);
  }

  clear() {
    this.rawInput.set('');
    this.copied.set(false);
  }

  async copyNetAmount() {
    const value = this.netAmount();
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
    return '$ ' + value.toLocaleString('es-CO');
  }
}
