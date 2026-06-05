// Vercel serverless function: receives the multipart form (fields + 3 files),
// validates, and emails everything (with attachments) via Gmail (Nodemailer).
// Env vars required: GMAIL_USER, GMAIL_APP_PASSWORD, TO_EMAIL
const Busboy = require('busboy');
const nodemailer = require('nodemailer');

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB per file
// WHATWG HTML Living Standard email regex, tightened to require a dotted TLD.
// Must stay identical to src/app/validators/email-validator.ts (single source of truth).
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const REQUIRED_TEXT = [
  'fullName',
  'email',
  'mockDate',
  'mockTime',
  'gotomypcEmail',
  'gotomypcPassword',
  'gotomypcAccessCode',
];
const REQUIRED_FILES = ['resume', 'selfIntro', 'jobDescription'];
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({
      headers: req.headers,
      limits: { fileSize: MAX_BYTES + 1, files: REQUIRED_FILES.length + 1 },
    });
    const fields = {};
    const files = {};
    let tooLarge = false;

    bb.on('field', (name, val) => {
      fields[name] = val;
    });
    bb.on('file', (name, stream, info) => {
      const chunks = [];
      stream.on('data', (d) => chunks.push(d));
      stream.on('limit', () => {
        tooLarge = true;
        stream.resume();
      });
      stream.on('end', () => {
        files[name] = {
          filename: info.filename,
          mimeType: info.mimeType,
          content: Buffer.concat(chunks),
        };
      });
    });
    bb.on('error', reject);
    bb.on('close', () => resolve({ fields, files, tooLarge }));
    req.pipe(bb);
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(
    /[&<>]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c],
  );
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed.' });
    return;
  }

  try {
    const { fields, files, tooLarge } = await parseMultipart(req);

    if (tooLarge) {
      res.status(400).json({ ok: false, error: 'A file exceeds the 2 MB limit.' });
      return;
    }

    // Trim every incoming text field (leading/trailing) before using or validating it.
    for (const key of Object.keys(fields)) {
      fields[key] = String(fields[key] == null ? '' : fields[key]).trim();
    }

    for (const name of REQUIRED_TEXT) {
      if (!fields[name]) {
        res.status(400).json({ ok: false, error: `Missing field: ${name}` });
        return;
      }
    }

    if (!EMAIL_REGEX.test(fields.email)) {
      res.status(400).json({ ok: false, error: 'Email address is not valid.' });
      return;
    }

    for (const key of REQUIRED_FILES) {
      const file = files[key];
      if (!file || !file.content || file.content.length === 0) {
        res.status(400).json({ ok: false, error: `Missing file: ${key}` });
        return;
      }
      const okType =
        ALLOWED_TYPES.has(file.mimeType) || /\.(pdf|docx?)$/i.test(file.filename || '');
      if (!okType) {
        res.status(400).json({ ok: false, error: `Invalid file type for ${key}. Use PDF, DOC, or DOCX.` });
        return;
      }
    }

    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      res.status(500).json({ ok: false, error: 'Email is not configured on the server.' });
      return;
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });

    // Optional extra attachment — only included when one was uploaded.
    const extra = files.additionalDoc;
    const hasExtra = !!(extra && extra.content && extra.content.length > 0);

    const html = `
      <h2>New mock interview submission</h2>
      <table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif">
        <tr><td><b>Name</b></td><td>${escapeHtml(fields.fullName)}</td></tr>
        <tr><td><b>Email</b></td><td>${escapeHtml(fields.email)}</td></tr>
        <tr><td><b>Interview (EST)</b></td><td>${escapeHtml(fields.mockDate)} ${escapeHtml(fields.mockTime)}</td></tr>
        <tr><td><b>GoToMyPC email</b></td><td>${escapeHtml(fields.gotomypcEmail)}</td></tr>
        <tr><td><b>GoToMyPC password</b></td><td>${escapeHtml(fields.gotomypcPassword)}</td></tr>
        <tr><td><b>GoToMyPC access code</b></td><td>${escapeHtml(fields.gotomypcAccessCode)}</td></tr>
        <tr><td valign="top"><b>Notes</b></td><td>${escapeHtml(fields.notes) || '—'}</td></tr>
      </table>
      <p style="color:#888">Résumé, self-introduction, and job description${hasExtra ? ', and an additional document' : ''} are attached.</p>`;

    const attachments = REQUIRED_FILES.map((key) => ({
      filename: files[key].filename,
      content: files[key].content,
    }));
    if (hasExtra) {
      attachments.push({ filename: extra.filename, content: extra.content });
    }

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: process.env.TO_EMAIL || process.env.GMAIL_USER,
      replyTo: fields.email,
      subject: fields.subject || 'Mock interview details',
      html,
      attachments,
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Failed to send. Please try again.' });
  }
};
