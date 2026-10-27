/**
 * Temporary diagnostic endpoint — NOT part of the Spin to Win feature.
 * Sends the same "you won" email a real winner would get, to confirm
 * Resend is wired up correctly. Ignores all input and always sends to
 * a single fixed address, so it can't be used to spam arbitrary inboxes
 * or to probe anything about real spins/winners.
 *
 * Delete this file once the test email is confirmed received.
 */
const RESEND_API_URL = "https://api.resend.com/emails";
const TEST_RECIPIENT = "williamleework@icloud.com";

module.exports = async (req, res) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "RESEND_API_KEY is not configured" });
  }

  const fromEmail = process.env.SPIN_FROM_EMAIL || process.env.QUOTE_FROM_EMAIL || "noreply@therarepull.co.uk";

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `The Rare Pull <${fromEmail}>`,
      to: TEST_RECIPIENT,
      subject: "🎉 You won a Fun Pack from The Rare Pull!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color:#14142b;">You won!</h2>
          <p>Your free daily spin landed on a Fun Pack. Nice one!</p>
          <p>Reply to this email with your name and postal address and we'll get it sent out to you.</p>
          <p style="color:#888; font-size:12px; margin-top:24px;">(This is a one-off test send to confirm email delivery is working — not a real win.)</p>
        </div>
      `,
      text: "You won! Your free daily spin landed on a Fun Pack. Reply to this email with your name and postal address and we'll get it sent out to you. (This is a one-off test send to confirm email delivery is working — not a real win.)",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return res.status(502).json({ error: `Resend API error (${response.status}): ${body}` });
  }

  const data = await response.json();
  return res.status(200).json({ sent: true, resendId: data.id });
};
