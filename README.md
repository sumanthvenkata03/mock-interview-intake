# Mock Interview Intake

A small, mobile-friendly form where consultants submit their mock-interview details
and three required documents (résumé, self-introduction, job description). On submit,
everything is emailed — with the files attached — to a configured inbox.

**Stack:** Angular 21 (standalone, signals, zoneless) + one Vercel serverless function
(`/api/submit`) that sends email via Nodemailer + Gmail.

## Prerequisites
- Node.js 20.19+ or 22.12+ (built with Node 22)
- npm

## Install
```bash
npm install
```

## Run the frontend (UI only)
```bash
npm start          # ng serve → http://localhost:4200
```
> Note: `ng serve` runs **only the Angular UI**. The `/api/submit` endpoint exists on
> Vercel, so **submitting will fail (404) under plain `ng serve`** — that's expected.
> Use the form UI to check layout/validation; wire up sending via Vercel (below) later.

## Run frontend + the email function locally (optional, later)
```bash
npm i -g vercel
cp .env.example .env     # fill in your Gmail app password
vercel dev               # serves the app AND /api/submit together
```

## Build
```bash
npm run build            # → dist/mock-interview-intake/browser
```

## Deploy (free, later)
1. Create a **Gmail app password** for the sending account (enable 2-Step Verification →
   Google Account → Security → App passwords).
2. Push this repo to GitHub.
3. Import it on **Vercel** (free). Add Environment Variables:
   `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `TO_EMAIL` (see `.env.example`).
4. Deploy → you get a free `*.vercel.app` URL.

## What's required
All fields and all three files are required (the JD may be a blank document if they don't
have one). The **Submit button stays disabled until everything is valid** — driven by a
`computed()` signal. Files are limited to 2 MB each / under 4 MB combined, PDF/DOC/DOCX only.
