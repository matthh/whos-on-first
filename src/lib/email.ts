import { signOAuthState } from "./auth";

const ADMIN_EMAIL = "matthh@gmail.com";

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[EMAIL] No RESEND_API_KEY — would send to ${to}: ${subject}`);
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.FROM_EMAIL || "Who's On First <onboarding@resend.dev>",
        to,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      console.error(`[EMAIL] Failed to send: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error("[EMAIL] Error:", err);
  }
}

function generateAdminActionUrl(userId: number, action: "approve" | "reject"): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://whos-on-first.vercel.app";
  const token = signOAuthState({ userId, action, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  return `${baseUrl}/api/admin/users/action?token=${token}`;
}

export async function sendNewSignupNotification(
  userName: string | null,
  userEmail: string,
  provider: string
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://whos-on-first.vercel.app";

  // Get user ID for approve/reject links
  let approveUrl = `${baseUrl}/admin`;
  let rejectUrl = `${baseUrl}/admin`;
  try {
    const { db } = await import("./db");
    const { users } = await import("./schema");
    const { eq } = await import("drizzle-orm");
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, userEmail)).limit(1);
    if (user) {
      approveUrl = generateAdminActionUrl(user.id, "approve");
      rejectUrl = generateAdminActionUrl(user.id, "reject");
    }
  } catch { /* fall back to admin panel link */ }

  await sendEmail(
    ADMIN_EMAIL,
    `New coach signup: ${userName || userEmail}`,
    `
    <div style="font-family: sans-serif; max-width: 480px;">
      <h2>New Coach Signup</h2>
      <p><strong>${userName || "Unknown"}</strong> (${userEmail}) just signed up via ${provider}.</p>
      <p>They're in <strong>pending</strong> status.</p>
      <div style="margin: 20px 0;">
        <a href="${approveUrl}" style="background: #48bb78; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; margin-right: 8px;">Approve</a>
        <a href="${rejectUrl}" style="background: #e53e3e; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Reject</a>
      </div>
      <p style="font-size: 13px; color: #888;">Or <a href="${baseUrl}/admin">manage in admin panel</a>. Links expire in 7 days.</p>
    </div>
    `
  );
}

export async function sendPendingSignupEmail(
  userEmail: string,
  userName: string | null
) {
  await sendEmail(
    userEmail,
    "Account pending — Who's On First",
    `
    <div style="font-family: sans-serif; max-width: 480px;">
      <h2>Thanks for signing up!</h2>
      <p>Hi ${userName || "there"},</p>
      <p>Your <strong>Who's On First</strong> account has been created and is <strong>pending approval</strong>. A league admin has been notified and will review your request shortly.</p>
      <p>You'll receive another email once your account is approved and ready to use.</p>
      <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;" />
      <p style="font-size: 12px; color: #888;">Who's On First — Game day defensive roster calculator for youth baseball</p>
    </div>
    `
  );
}

export async function sendInviteEmail(userEmail: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://whos-on-first.vercel.app";
  await sendEmail(
    userEmail,
    "You're invited to Who's On First!",
    `
    <div style="font-family: sans-serif; max-width: 480px;">
      <h2>You've been invited!</h2>
      <p>A coach has invited you to <strong>Who's On First</strong> — the game day defensive roster calculator for youth baseball.</p>
      <p>Your account is ready to go. Sign in with Google to get started:</p>
      <ol>
        <li>Sign in with your Google account</li>
        <li>Set up your team name and roster</li>
        <li>Generate your first game day lineup</li>
      </ol>
      <p><a href="${baseUrl}/login" style="background: #002d62; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Sign In to Get Started</a></p>
    </div>
    `
  );
}

export async function sendApprovalNotification(
  userEmail: string,
  userName: string | null
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://whos-on-first.vercel.app";
  await sendEmail(
    userEmail,
    "You're in — welcome to Who's On First!",
    `
    <div style="font-family: sans-serif; max-width: 480px;">
      <h2>Welcome${userName ? `, ${userName}` : ""}!</h2>
      <p>Your account has been approved. You can now create your roster and start generating game sheets.</p>
      <h3>Getting Started:</h3>
      <ol>
        <li>Add your players and drag to rank them (best at top)</li>
        <li>Mark any absent players before each game</li>
        <li>Click Generate to create your defensive lineup</li>
        <li>Export to PDF and bring it to the field!</li>
      </ol>
      <p><a href="${baseUrl}" style="background: #002d62; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block;">Open Who's On First</a></p>
    </div>
    `
  );
}
