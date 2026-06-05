import { Component } from '@angular/core';
import { IntakeForm } from './intake-form/intake-form';

@Component({
  selector: 'app-root',
  imports: [IntakeForm],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
