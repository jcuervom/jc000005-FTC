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

  rawInput = signal('');

  amount = computed(() => {
    const cleaned = this.rawInput().replace(/\D/g, '');
    return cleaned ? Number(cleaned) : 0;
  });

  taxAmount = computed(() => {
    const a = this.amount();
    if (a <= 0) return 0;
    // tax = amount * 0.004 / 1.004
    return Math.round((a * this.TAX_RATE) / (1 + this.TAX_RATE));
  });

  netAmount = computed(() => {
    const a = this.amount();
    if (a <= 0) return 0;
    // net = amount / 1.004
    return a - this.taxAmount();
  });

  taxPercentageOfTotal = computed(() => {
    const a = this.amount();
    if (a <= 0) return 0;
    return (this.taxAmount() / a) * 100;
  });

  onInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const raw = input.value.replace(/\D/g, '');
    this.rawInput.set(raw);

    // Format with thousands separator
    if (raw) {
      const formatted = Number(raw).toLocaleString('es-CO');
      input.value = formatted;
    } else {
      input.value = '';
    }
  }

  clear() {
    this.rawInput.set('');
  }

  formatCOP(value: number): string {
    return '$ ' + value.toLocaleString('es-CO');
  }
}
