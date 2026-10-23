/** The welcome email. Plain tables and inline styles, because email apps ignore most CSS. */

export const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://thaanafont.com").replace(/\/$/, "");

const STEPS = [
  { title: "Pick a way to start", text: "Play with a font, make one from your handwriting, or draw your own letters.", alt: "Three cards: play with a font, handwriting, draw" },
  { title: "Make your letters", text: "Write them on our template and take a photo, or draw them in the editor. Tidy each one and set the spacing.", alt: "A printed template and a phone taking a photo of it" },
  { title: "Test and download", text: "Type Dhivehi with your font to check it, then download a font file you can install.", alt: "Dhivehi text in the new font and a download button" },
];

export const WELCOME_SUBJECT = "Welcome to ThaanaFont";

export function welcomeHtml(site: string = SITE): string {
  const cards = STEPS.map((s, i) => `
<tr><td style="padding:0 0 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #DCE8DF;border-radius:14px">
<tr><td style="padding:12px 12px 0"><img src="${site}/email/step-${i + 1}.png" width="100%" alt="${s.alt}" style="display:block;width:100%;height:auto;border-radius:10px"></td></tr>
<tr><td style="padding:14px 18px 18px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td valign="middle"><div style="width:28px;height:28px;border-radius:14px;background:#264022;color:#ffffff;font-weight:700;font-size:14px;line-height:28px;text-align:center">${i + 1}</div></td>
<td style="padding-left:10px;font-weight:700;font-size:17px;color:#264022">${s.title}</td></tr></table>
<div style="font-size:14px;line-height:1.5;color:#5D797B;margin-top:8px">${s.text}</div>
</td></tr></table></td></tr>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${WELCOME_SUBJECT}</title></head>
<body style="margin:0;background:#EAF5EF;font-family:Arial,Helvetica,sans-serif;color:#264022">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EAF5EF"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">
<tr><td align="center" style="padding-bottom:20px;font-size:20px;font-weight:700;color:#264022">ThaanaFont</td></tr>
<tr><td style="background:#ffffff;border:1px solid #DCE8DF;border-radius:16px;padding:36px 32px">
<h1 style="margin:0 0 12px;font-size:26px;line-height:1.25;color:#264022">Welcome to ThaanaFont</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:#264022">Your account is ready. Make a Thaana font from your own handwriting, in three steps.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cards}</table>
<p style="margin:6px 0 0"><a href="${site}" style="display:inline-block;background:#FA7E00;color:#ffffff;font-weight:700;font-size:16px;padding:14px 28px;border-radius:999px;text-decoration:none">Start my font</a></p>
<p style="margin:24px 0 0;font-size:14px;line-height:1.5;color:#5D797B">ThaanaFont is in beta, so some things may still change.</p>
</td></tr>
<tr><td align="center" style="padding-top:20px;font-size:13px;color:#5D797B">ThaanaFont · thaanafont.com</td></tr>
</table></td></tr></table></body></html>`;
}

export function welcomeText(site: string = SITE): string {
  return [
    "Welcome to ThaanaFont",
    "",
    "Your account is ready. Make a Thaana font from your own handwriting, in three steps.",
    "",
    ...STEPS.map((s, i) => `${i + 1}. ${s.title}\n${s.text}`),
    "",
    `Start my font: ${site}`,
    "",
    "ThaanaFont is in beta, so some things may still change.",
  ].join("\n");
}
