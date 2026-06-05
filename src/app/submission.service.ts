import { Injectable } from '@angular/core';

export interface SubmitResult {
  ok: boolean;
  error?: string;
}

/** Posts the multipart form (fields + 3 files) to the Vercel function at /api/submit. */
@Injectable({ providedIn: 'root' })
export class SubmissionService {
  async submit(formData: FormData): Promise<SubmitResult> {
    const res = await fetch('/api/submit', { method: 'POST', body: formData });
    let data: { ok?: boolean; error?: string } | null = null;
    try {
      data = await res.json();
    } catch {
      /* non-JSON response */
    }
    if (res.ok && data?.ok) return { ok: true };
    return { ok: false, error: data?.error || `Request failed (${res.status}).` };
  }
}
