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
  copied = signal(false);

  amount = computed(() => {
    const cleaned = this.rawInput().replace(/\D/g, '');
    return cleaned ? Number(cleaned) : 0;
  });

  taxAmount = computed(() => {
    const a = this.amount();
    if (a <= 0) return 0;
    return Math.round((a * this.TAX_RATE) / (1 + this.TAX_RATE));
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

  onInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const raw = input.value.replace(/\D/g, '');
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
      // Fallback for older browsers / insecure contexts
      const textarea = document.createElement('textarea');
      textarea.value = value.toString();
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }
  }

  formatCOP(value: number): string {
    return '$ ' + value.toLocaleString('es-CO');
  }
}
