/** An update email written in the admin. Same look as the welcome email: plain tables and inline styles. */
import { SITE } from "@/lib/email/welcome";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Blank lines start a new paragraph, single line breaks stay, web addresses become links. */
function paragraphs(body: string): string {
  return body.trim().split(/\n\s*\n/).map((p) => {
    const html = esc(p.trim()).replace(/\n/g, "<br>").replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" style="color:#264022;font-weight:700">${u}</a>`);
    return `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#264022">${html}</p>`;
  }).join("");
}

export function unsubscribeUrl(id: string, token: string, site: string = SITE): string {
  return `${site}/unsubscribe?u=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}`;
}

export function updateHtml(subject: string, body: string, unsubUrl: string, site: string = SITE): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#EAF5EF;font-family:Arial,Helvetica,sans-serif;color:#264022">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EAF5EF"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">
<tr><td align="center" style="padding-bottom:20px;font-size:20px;font-weight:700;color:#264022">ThaanaFont</td></tr>
<tr><td style="background:#ffffff;border:1px solid #DCE8DF;border-radius:16px;padding:36px 32px">
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:#264022">${esc(subject)}</h1>
${paragraphs(body)}
<p style="margin:8px 0 0"><a href="${site}" style="display:inline-block;background:#FA7E00;color:#ffffff;font-weight:700;font-size:16px;padding:14px 28px;border-radius:999px;text-decoration:none">Open ThaanaFont</a></p>
</td></tr>
<tr><td align="center" style="padding-top:20px;font-size:13px;line-height:1.5;color:#5D797B">You get this because you chose to hear about ThaanaFont updates.<br><a href="${unsubUrl}" style="color:#5D797B">Unsubscribe</a> · thaanafont.com</td></tr>
</table></td></tr></table></body></html>`;
}

export function updateText(subject: string, body: string, unsubUrl: string, site: string = SITE): string {
  return [subject, "", body.trim(), "", `Open ThaanaFont: ${site}`, "", "You get this because you chose to hear about ThaanaFont updates.", `Unsubscribe: ${unsubUrl}`].join("\n");
}
