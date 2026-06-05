import { Component, computed, inject, OnDestroy, signal, WritableSignal } from '@angular/core';
import { SubmissionService } from '../submission.service';
import { TrimDirective } from '../directives/trim.directive';
import { isValidEmail } from '../validators/email-validator';
import {
  scheduledUtcMs,
  windowStateFor,
  WINDOW_OPEN_MIN,
  WINDOW_CLOSE_MIN,
  INTERVIEW_TZ,
} from '../utils/time-window';

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB per file
const MAX_TOTAL = 4 * 1024 * 1024; // 4 MB combined (Vercel request-body limit)
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const ALLOWED_EXT = ['.pdf', '.doc', '.docx'];

type FileKey = 'resume' | 'selfIntro' | 'jobDescription' | 'additionalDoc';
type Status = 'idle' | 'sending' | 'success' | 'error';

@Component({
  selector: 'app-intake-form',
  imports: [TrimDirective],
  templateUrl: './intake-form.html',
  styleUrl: './intake-form.css',
})
export class IntakeForm implements OnDestroy {
  private readonly submission = inject(SubmissionService);

  // Ticking clock so the submission-window state updates live.
  readonly now = signal(Date.now());
  private readonly timer: ReturnType<typeof setInterval>;

  constructor() {
    this.timer = setInterval(() => this.now.set(Date.now()), 1000);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  // Text fields
  readonly fullName = signal('');
  readonly email = signal('');
  readonly mockDate = signal('');
  readonly mockTime = signal('');
  readonly gpcEmail = signal('');
  readonly gpcPassword = signal('');
  readonly gpcAccessCode = signal('');
  readonly notes = signal('');

  // Files
  readonly resume = signal<File | null>(null);
  readonly selfIntro = signal<File | null>(null);
  readonly jobDescription = signal<File | null>(null);
  readonly additionalDoc = signal<File | null>(null);

  // UI state
  readonly showPassword = signal(false);
  readonly submitted = signal(false);
  readonly formTouched = signal(false);
  readonly status = signal<Status>('idle');
  readonly statusMessage = signal('');

  // Derived validation
  readonly emailValid = computed(() => isValidEmail(this.email()));
  readonly gpcEmailValid = computed(() => isValidEmail(this.gpcEmail()));

  readonly resumeError = computed(() => this.fileError(this.resume()));
  readonly selfIntroError = computed(() => this.fileError(this.selfIntro()));
  readonly jobDescriptionError = computed(() => this.fileError(this.jobDescription()));
  // Optional: only invalid when a file is present and fails type/size checks.
  readonly additionalDocError = computed(() => {
    const f = this.additionalDoc();
    return f ? this.fileError(f) : '';
  });

  readonly totalSize = computed(
    () =>
      (this.resume()?.size ?? 0) +
      (this.selfIntro()?.size ?? 0) +
      (this.jobDescription()?.size ?? 0) +
      (this.additionalDoc()?.size ?? 0),
  );
  readonly tooLargeTotal = computed(() => this.totalSize() > MAX_TOTAL);

  readonly subject = computed(() => {
    const name = this.fullName().trim();
    const d = this.mockDate();
    const t = this.mockTime();
    const details = d && t ? `Mock interview details — ${d} ${t} EST` : 'Mock interview details';
    return name ? `${name} — ${details}` : details;
  });

  // Live list of everything still missing or invalid (human-readable).
  readonly missing = computed(() => {
    const m: string[] = [];

    if (this.fullName().trim() === '') m.push('Full name is missing');

    if (this.email().trim() === '') m.push('Email address is missing');
    else if (!this.emailValid()) m.push('Email address is not valid');

    if (this.mockDate() === '') m.push('Interview date is missing');
    if (this.mockTime() === '') m.push('Interview time is missing');

    if (this.gpcEmail().trim() === '') m.push('GoToMyPC email is missing');
    else if (!this.gpcEmailValid()) m.push('GoToMyPC email is not valid');

    if (this.gpcPassword().trim() === '') m.push('GoToMyPC password is missing');
    if (this.gpcAccessCode().trim() === '') m.push('GoToMyPC access code is missing');

    this.pushFileMissing(m, this.resume(), 'Résumé');
    this.pushFileMissing(m, this.selfIntro(), 'Self-introduction');
    this.pushFileMissing(m, this.jobDescription(), 'Job description');

    // Optional: only flag when a file is present but invalid.
    if (this.additionalDocError()) m.push(`Additional documents: ${this.additionalDocError()}`);

    if (this.tooLargeTotal()) m.push('Total file size exceeds 4 MB');

    return m;
  });

  // ── Submission time window (DST-correct, authoritative copy lives on the server) ──
  readonly scheduledMs = computed(() => scheduledUtcMs(this.mockDate(), this.mockTime()));
  readonly windowState = computed(() => windowStateFor(this.scheduledMs(), this.now()));
  readonly withinWindow = computed(() => this.windowState() === 'open');

  private readonly fmtEST = new Intl.DateTimeFormat('en-US', {
    timeZone: INTERVIEW_TZ,
    hour: '2-digit',
    minute: '2-digit',
  });

  readonly windowOpenMs = computed(() => {
    const s = this.scheduledMs();
    return s == null ? null : s - WINDOW_OPEN_MIN * 60000;
  });
  readonly windowCloseMs = computed(() => {
    const s = this.scheduledMs();
    return s == null ? null : s - WINDOW_CLOSE_MIN * 60000;
  });
  readonly openTimeEST = computed(() => {
    const m = this.windowOpenMs();
    return m == null ? '' : this.fmtEST.format(new Date(m));
  });
  readonly closeTimeEST = computed(() => {
    const m = this.windowCloseMs();
    return m == null ? '' : this.fmtEST.format(new Date(m));
  });

  // Live mm:ss countdown to the relevant boundary (window open when too early, close when open).
  readonly countdown = computed(() => {
    const state = this.windowState();
    const targetMs =
      state === 'tooEarly' ? this.windowOpenMs() : state === 'open' ? this.windowCloseMs() : null;
    if (targetMs == null) return '';
    const total = Math.max(0, Math.floor((targetMs - this.now()) / 1000));
    const mm = Math.floor(total / 60);
    const ss = total % 60;
    return `${mm}:${String(ss).padStart(2, '0')}`;
  });

  readonly windowMessage = computed(() => {
    switch (this.windowState()) {
      case 'tooEarly':
        return `Too early to submit. Your window opens at ${this.openTimeEST()} EST — in ${this.countdown()}. Submissions are not accepted more than 15 minutes before your interview.`;
      case 'open':
        return `✅ Your submission window is OPEN. Please submit now — it closes at ${this.closeTimeEST()} EST (in ${this.countdown()}), 5 minutes before your interview.`;
      case 'tooLate':
        return `❌ The submission window has closed (it closed at ${this.closeTimeEST()} EST, 5 minutes before your interview). Submissions are no longer accepted — please contact the coordinator to reschedule.`;
      default:
        return 'Pick your interview date and time to see your submission window (it opens 15 minutes before and closes 5 minutes before your interview).';
    }
  });

  readonly canSubmit = computed(() => this.missing().length === 0 && this.withinWindow());

  private pushFileMissing(m: string[], f: File | null, label: string): void {
    if (!f) {
      m.push(`${label} file is missing`);
      return;
    }
    const e = this.fileError(f);
    if (e) m.push(`${label}: ${e}`);
  }

  private fileError(f: File | null): string {
    if (!f) return 'Required.';
    if (f.size > MAX_BYTES) return 'File must be 2 MB or smaller.';
    const okType =
      ALLOWED_TYPES.includes(f.type) ||
      ALLOWED_EXT.some((ext) => f.name.toLowerCase().endsWith(ext));
    if (!okType) return 'Use a PDF, DOC, or DOCX file.';
    return '';
  }

  // Handlers
  setText(sig: WritableSignal<string>, ev: Event): void {
    sig.set((ev.target as HTMLInputElement | HTMLTextAreaElement).value);
  }

  setFile(key: FileKey, ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0] ?? null;
    if (key === 'resume') this.resume.set(file);
    else if (key === 'selfIntro') this.selfIntro.set(file);
    else if (key === 'jobDescription') this.jobDescription.set(file);
    else this.additionalDoc.set(file);
  }

  // Date/time inputs are picker-only: open the native picker on click.
  openPicker(el: HTMLInputElement): void {
    el.showPicker?.();
  }

  // Block manual typing while keeping keyboard navigation and picker access.
  blockTyping(ev: KeyboardEvent, el: HTMLInputElement): void {
    if (ev.key === 'Tab') return; // allow Tab / Shift+Tab for navigation
    if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
      ev.preventDefault();
      el.showPicker?.();
      return;
    }
    ev.preventDefault(); // block digits, letters, etc.
  }

  togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  async onSubmit(ev: Event): Promise<void> {
    ev.preventDefault();
    this.submitted.set(true);
    this.formTouched.set(true);

    // Guard: never submit outside the window — surface the same timing message.
    const state = this.windowState();
    if (state === 'tooEarly' || state === 'tooLate') {
      this.status.set('error');
      this.statusMessage.set(this.windowMessage());
      return;
    }
    if (!this.canSubmit()) return;

    this.status.set('sending');
    this.statusMessage.set('');

    const fd = new FormData();
    fd.append('fullName', this.fullName().trim());
    fd.append('email', this.email().trim());
    fd.append('mockDate', this.mockDate());
    fd.append('mockTime', this.mockTime());
    fd.append('gotomypcEmail', this.gpcEmail().trim());
    fd.append('gotomypcPassword', this.gpcPassword().trim());
    fd.append('gotomypcAccessCode', this.gpcAccessCode().trim());
    fd.append('notes', this.notes().trim());
    fd.append('subject', this.subject());
    fd.append('resume', this.resume()!);
    fd.append('selfIntro', this.selfIntro()!);
    fd.append('jobDescription', this.jobDescription()!);
    if (this.additionalDoc()) fd.append('additionalDoc', this.additionalDoc()!);

    try {
      const result = await this.submission.submit(fd);
      if (result.ok) {
        this.status.set('success');
      } else {
        this.status.set('error');
        this.statusMessage.set(result.error ?? 'Your details could not be sent. Please try again.');
      }
    } catch {
      this.status.set('error');
      this.statusMessage.set('Something went wrong sending your details. Please try again.');
    }
  }

  resetForm(): void {
    this.fullName.set('');
    this.email.set('');
    this.mockDate.set('');
    this.mockTime.set('');
    this.gpcEmail.set('');
    this.gpcPassword.set('');
    this.gpcAccessCode.set('');
    this.notes.set('');
    this.resume.set(null);
    this.selfIntro.set(null);
    this.jobDescription.set(null);
    this.additionalDoc.set(null);
    this.submitted.set(false);
    this.formTouched.set(false);
    this.status.set('idle');
    this.statusMessage.set('');
  }
}
