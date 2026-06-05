import { Component, computed, inject, signal, WritableSignal } from '@angular/core';
import { SubmissionService } from '../submission.service';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB per file
const MAX_TOTAL = 4 * 1024 * 1024; // 4 MB combined (Vercel request-body limit)
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const ALLOWED_EXT = ['.pdf', '.doc', '.docx'];

type FileKey = 'resume' | 'selfIntro' | 'jobDescription';
type Status = 'idle' | 'sending' | 'success' | 'error';

@Component({
  selector: 'app-intake-form',
  imports: [],
  templateUrl: './intake-form.html',
  styleUrl: './intake-form.css',
})
export class IntakeForm {
  private readonly submission = inject(SubmissionService);

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

  // UI state
  readonly showPassword = signal(false);
  readonly submitted = signal(false);
  readonly status = signal<Status>('idle');
  readonly statusMessage = signal('');

  // Derived validation
  readonly emailValid = computed(() => EMAIL_RE.test(this.email().trim()));
  readonly gpcEmailValid = computed(() => EMAIL_RE.test(this.gpcEmail().trim()));

  readonly resumeError = computed(() => this.fileError(this.resume()));
  readonly selfIntroError = computed(() => this.fileError(this.selfIntro()));
  readonly jobDescriptionError = computed(() => this.fileError(this.jobDescription()));

  readonly totalSize = computed(
    () =>
      (this.resume()?.size ?? 0) +
      (this.selfIntro()?.size ?? 0) +
      (this.jobDescription()?.size ?? 0),
  );
  readonly tooLargeTotal = computed(() => this.totalSize() > MAX_TOTAL);

  readonly subject = computed(() => {
    const d = this.mockDate();
    const t = this.mockTime();
    return d && t ? `Mock interview details — ${d} ${t} EST` : 'Mock interview details';
  });

  readonly formValid = computed(
    () =>
      this.fullName().trim() !== '' &&
      this.emailValid() &&
      this.mockDate() !== '' &&
      this.mockTime() !== '' &&
      this.gpcEmailValid() &&
      this.gpcPassword().trim() !== '' &&
      this.gpcAccessCode().trim() !== '' &&
      this.resumeError() === '' &&
      this.selfIntroError() === '' &&
      this.jobDescriptionError() === '' &&
      !this.tooLargeTotal(),
  );

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
    else this.jobDescription.set(file);
  }

  togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  async onSubmit(ev: Event): Promise<void> {
    ev.preventDefault();
    this.submitted.set(true);
    if (!this.formValid()) return;

    this.status.set('sending');
    this.statusMessage.set('');

    const fd = new FormData();
    fd.append('fullName', this.fullName().trim());
    fd.append('email', this.email().trim());
    fd.append('mockDate', this.mockDate());
    fd.append('mockTime', this.mockTime());
    fd.append('gotomypcEmail', this.gpcEmail().trim());
    fd.append('gotomypcPassword', this.gpcPassword());
    fd.append('gotomypcAccessCode', this.gpcAccessCode().trim());
    fd.append('notes', this.notes().trim());
    fd.append('subject', this.subject());
    fd.append('resume', this.resume()!);
    fd.append('selfIntro', this.selfIntro()!);
    fd.append('jobDescription', this.jobDescription()!);

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
    this.submitted.set(false);
    this.status.set('idle');
    this.statusMessage.set('');
  }
}
