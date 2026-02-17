import { Resend } from "resend";

let resend: Resend | null = null;

function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[Email] RESEND_API_KEY not set — emails will be skipped");
    return null;
  }
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

const FROM_EMAIL = process.env.EMAIL_FROM || "oneanddone@resend.dev";

export async function sendPasswordResetEmail(
  email: string,
  resetUrl: string,
) {
  const client = getResendClient();
  if (!client) return false;

  try {
    const { error } = await client.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "Reset your One and Done password",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #16a34a;">One and Done</h2>
          <p>You requested a password reset. Click the link below to set a new password:</p>
          <p style="margin: 24px 0;">
            <a href="${resetUrl}"
               style="background-color: #16a34a; color: white; padding: 12px 24px;
                      border-radius: 6px; text-decoration: none; display: inline-block;">
              Reset Password
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">
            This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("[Email] Failed to send:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[Email] Error:", err);
    return false;
  }
}
