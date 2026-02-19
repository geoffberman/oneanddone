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

function getBaseUrl(): string {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

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

export async function sendMemberAddedEmail(
  email: string,
  gameName: string,
  addedByName: string,
) {
  const client = getResendClient();
  if (!client) {
    console.log(`[Email] Would send member-added email to ${email} for game "${gameName}"`);
    return false;
  }

  const loginUrl = `${getBaseUrl()}/login`;

  try {
    const { error } = await client.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `You've been added to ${gameName} on One and Done`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #16a34a;">One and Done</h2>
          <p>Hey! <strong>${addedByName}</strong> added you to the league <strong>${gameName}</strong>.</p>
          <p>You're all set — log in to make your picks:</p>
          <p style="margin: 24px 0;">
            <a href="${loginUrl}"
               style="background-color: #16a34a; color: white; padding: 12px 24px;
                      border-radius: 6px; text-decoration: none; display: inline-block;">
              Go to One and Done
            </a>
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("[Email] Failed to send member-added email:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[Email] Error sending member-added email:", err);
    return false;
  }
}

export async function sendManagerEmail(
  email: string,
  memberName: string,
  gameName: string,
  subject: string,
  message: string,
) {
  const client = getResendClient();
  if (!client) return false;

  const gameUrl = getBaseUrl();

  try {
    const { error } = await client.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #16a34a;">One and Done — ${gameName}</h2>
          <p>Hi ${memberName},</p>
          <p style="white-space: pre-wrap;">${message}</p>
          <p style="margin-top: 24px;">
            <a href="${gameUrl}"
               style="background-color: #16a34a; color: white; padding: 12px 24px;
                      border-radius: 6px; text-decoration: none; display: inline-block;">
              Go to One and Done
            </a>
          </p>
          <p style="color: #999; font-size: 12px; margin-top: 24px;">
            You're receiving this because you're a member of the ${gameName} league.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("[Email] Failed to send manager email:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Email] Error sending manager email:", err);
    return false;
  }
}

export async function sendPicksReminderEmail(
  email: string,
  memberName: string,
  gameName: string,
  gameId: number,
  tournamentName: string,
  deadline: Date,
) {
  const client = getResendClient();
  if (!client) return false;

  const picksUrl = `${getBaseUrl()}/games/${gameId}`;
  const deadlineStr = deadline.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });

  try {
    const { error } = await client.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `Reminder: Make your pick for ${tournamentName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #16a34a;">One and Done — ${gameName}</h2>
          <p>Hi ${memberName},</p>
          <p>Don't forget to submit your pick for <strong>${tournamentName}</strong>.</p>
          <p style="color: #b45309;">Picks lock on <strong>${deadlineStr}</strong>.</p>
          <p style="margin: 24px 0;">
            <a href="${picksUrl}"
               style="background-color: #16a34a; color: white; padding: 12px 24px;
                      border-radius: 6px; text-decoration: none; display: inline-block;">
              Make Your Pick
            </a>
          </p>
          <p style="color: #999; font-size: 12px; margin-top: 24px;">
            You're receiving this because you're a member of the ${gameName} league.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("[Email] Failed to send reminder email:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Email] Error sending reminder email:", err);
    return false;
  }
}

export async function sendInviteEmail(
  email: string,
  gameName: string,
  addedByName: string,
  setupUrl: string,
) {
  const client = getResendClient();
  if (!client) {
    console.log(`[Email] Would send invite email to ${email} for game "${gameName}" — setup: ${setupUrl}`);
    return false;
  }

  try {
    const { error } = await client.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `${addedByName} invited you to ${gameName} on One and Done`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #16a34a;">One and Done</h2>
          <p>Hey! <strong>${addedByName}</strong> invited you to play in the league <strong>${gameName}</strong>.</p>
          <p>An account has been created for you. Set your password to get started:</p>
          <p style="margin: 24px 0;">
            <a href="${setupUrl}"
               style="background-color: #16a34a; color: white; padding: 12px 24px;
                      border-radius: 6px; text-decoration: none; display: inline-block;">
              Set Up Your Account
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">
            This link expires in 24 hours. You can also sign in with Google using this email address.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("[Email] Failed to send invite email:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[Email] Error sending invite email:", err);
    return false;
  }
}
