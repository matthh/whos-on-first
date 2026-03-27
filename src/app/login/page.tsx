"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-sm w-full space-y-6 text-center">
        {/* Pennant logo */}
        <div className="flex justify-center">
          <img src="/logo.png" alt="Who's On First" className="h-28 object-contain" />
        </div>

        <div>
          <h1 className="text-3xl font-bold text-[#002d62]">Who&apos;s On First</h1>
          <p className="text-sm text-gray-500 mt-1">
            Game Day Defensive Roster Calculator
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <a
          href="/api/auth/google-login"
          className="flex items-center justify-center gap-3 w-full py-3 px-4 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path
              d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 01-1.8 2.71v2.26h2.92a8.78 8.78 0 002.68-6.62z"
              fill="#4285F4"
            />
            <path
              d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A8.99 8.99 0 009 18z"
              fill="#34A853"
            />
            <path
              d="M3.96 10.71A5.41 5.41 0 013.68 9c0-.59.1-1.16.28-1.71V4.96H.96A8.99 8.99 0 000 9c0 1.45.35 2.82.96 4.04l3-2.33z"
              fill="#FBBC05"
            />
            <path
              d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A8.99 8.99 0 00.96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"
              fill="#EA4335"
            />
          </svg>
          <span className="text-sm font-medium text-gray-700">
            Sign in with Google
          </span>
        </a>

        <p className="text-xs text-gray-400">
          New coaches will need admin approval before accessing the app.
        </p>

        <div className="flex justify-center gap-4 pt-2">
          <a href="/terms" className="text-xs text-gray-400 hover:text-gray-600 underline">Terms of Service</a>
          <a href="/privacy" className="text-xs text-gray-400 hover:text-gray-600 underline">Privacy Policy</a>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-gray-400">Loading...</div></div>}>
      <LoginContent />
    </Suspense>
  );
}
