import { Component } from '@angular/core';
import { SubnetCalculatorComponent } from './components/subnet-calculator.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [SubnetCalculatorComponent],
  template: `
    <div class="min-h-screen bg-slate-50">
      <app-subnet-calculator />
    </div>
  `
})
export class AppComponent {}