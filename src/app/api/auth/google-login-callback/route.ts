import { NextRequest, NextResponse } from "next/server";
import { verifyOAuthState } from "@/lib/auth";
import { createSessionToken, SESSION_COOKIE, COOKIE_OPTIONS } from "@/lib/session";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { sendNewSignupNotification, sendPendingSignupEmail } from "@/lib/email";

const OAUTH_STATE_COOKIE = "wof-oauth-state";

function redirectWithStateCleared(loginUrl: URL): NextResponse {
  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://whos-on-first.vercel.app";
  const loginUrl = new URL("/login", baseUrl);

  if (error) {
    loginUrl.searchParams.set("error", error);
    return redirectWithStateCleared(loginUrl);
  }

  if (!code || !state) {
    loginUrl.searchParams.set("error", "Missing code or state");
    return redirectWithStateCleared(loginUrl);
  }

  // Verify state HMAC
  const stateData = verifyOAuthState(state);
  if (!stateData || stateData.provider !== "google") {
    loginUrl.searchParams.set("error", "Invalid state");
    return redirectWithStateCleared(loginUrl);
  }

  // Verify state is session-bound via cookie nonce and not expired.
  const cookieNonce = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (
    typeof stateData.nonce !== "string" ||
    typeof stateData.exp !== "number" ||
    !cookieNonce ||
    stateData.nonce !== cookieNonce
  ) {
    loginUrl.searchParams.set("error", "Invalid state");
    return redirectWithStateCleared(loginUrl);
  }
  if (stateData.exp <= Date.now()) {
    loginUrl.searchParams.set("error", "State expired");
    return redirectWithStateCleared(loginUrl);
  }

  try {
    // Exchange code for tokens
    const redirectUri =
      process.env.GOOGLE_LOGIN_REDIRECT_URI || `${baseUrl}/api/auth/google-login-callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      console.error("[GOOGLE-LOGIN] Token exchange failed:", await tokenRes.text());
      loginUrl.searchParams.set("error", "Token exchange failed");
      return redirectWithStateCleared(loginUrl);
    }

    const tokens = await tokenRes.json();

    // Fetch user profile
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!profileRes.ok) {
      loginUrl.searchParams.set("error", "Failed to fetch profile");
      return redirectWithStateCleared(loginUrl);
    }

    const profile = await profileRes.json();
    const email = profile.email?.toLowerCase().trim();
    const name = profile.name || null;
    const googleId = profile.id;

    if (!email) {
      loginUrl.searchParams.set("error", "No email from Google");
      return redirectWithStateCleared(loginUrl);
    }

    // Find or create user
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.authProviderId, googleId))
      .limit(1);

    let isNewUser = false;

    if (!user) {
      // Try by email
      [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (user) {
        // Link Google auth to existing account
        await db
          .update(users)
          .set({ authProvider: "google", authProviderId: googleId, name: name || user.name })
          .where(eq(users.id, user.id));
      } else {
        // New user — create as pending
        const [newUser] = await db
          .insert(users)
          .values({
            email,
            name,
            role: "user",
            status: "pending",
            authProvider: "google",
            authProviderId: googleId,
          })
          .returning();
        user = newUser;
        isNewUser = true;
      }
    }

    if (user.status === "suspended") {
      loginUrl.searchParams.set("error", "Account suspended");
      return redirectWithStateCleared(loginUrl);
    }

    // Send notifications for new signups
    if (isNewUser) {
      await sendNewSignupNotification(name, email, "Google");
      if (user.status === "pending") {
        sendPendingSignupEmail(email, name).catch(err =>
          console.error("[GOOGLE-LOGIN] Failed to send pending email:", err)
        );
      }
    }

    // Create session
    const token = createSessionToken(user.id);
    const response = NextResponse.redirect(new URL("/", baseUrl));
    response.cookies.set(SESSION_COOKIE, token, COOKIE_OPTIONS);
    // Clear the one-shot OAuth state cookie on success.
    response.cookies.delete(OAUTH_STATE_COOKIE);
    return response;
  } catch (err) {
    console.error("[GOOGLE-LOGIN] Error:", err);
    loginUrl.searchParams.set("error", "Authentication failed");
    return redirectWithStateCleared(loginUrl);
  }
}
