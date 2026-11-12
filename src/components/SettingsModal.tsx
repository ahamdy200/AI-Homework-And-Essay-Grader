"use client";

import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Info,
  KeyRound,
  Loader2,
  X,
} from "lucide-react";

interface SettingsModalProps {
  isOpen: boolean;
  envConfigured: boolean;
  sessionApiKey: string;
  onSaveSessionKey: (key: string) => void;
  onClose: () => void;
}

export function SettingsModal({
  isOpen,
  envConfigured,
  sessionApiKey,
  onSaveSessionKey,
  onClose,
}: SettingsModalProps) {
  const [keyInput, setKeyInput] = useState(sessionApiKey);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setKeyInput(sessionApiKey);
      setTestResult(null);
    }
  }, [isOpen, sessionApiKey]);

  if (!isOpen) return null;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const headers: Record<string, string> = {};
      if (keyInput.trim()) {
        headers["x-gemini-api-key"] = keyInput.trim();
      }
      const res = await fetch("/api/health", {
        method: "POST",
        headers,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setTestResult({
          ok: false,
          message: json.error || "Connection check failed.",
        });
      } else {
        setTestResult({
          ok: true,
          message: `Connected to ${json.model}: "${json.message}"`,
        });
      }
    } catch (err) {
      setTestResult({
        ok: false,
        message:
          err instanceof Error ? err.message : "Network error testing API.",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    onSaveSessionKey(keyInput.trim());
    onClose();
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl border border-[#E6DFD2] bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#E6DFD2] pb-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-[#1F5E4B]" />
            <h2 className="font-serif-paper text-lg font-semibold text-stone-900">
              Gemini API &amp; Model Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs leading-relaxed text-emerald-950">
            <div className="flex items-center gap-1.5 font-semibold">
              <Info className="h-4 w-4 shrink-0 text-emerald-700" />
              <span>Model &amp; Free Tier: Gemini 3.8 Flash</span>
            </div>
            <p className="mt-1 text-emerald-900">
              This workbench uses{" "}
              <code className="rounded bg-emerald-100 px-1 py-0.5 font-mono">
                gemini-3.8-flash
              </code>{" "}
              via the Gemini Interactions API, which is included on Google&apos;s{" "}
              <strong>Free Tier</strong> (no paid billing required for text,
              photo, and PDF grading).
            </p>
            <p className="mt-1.5 text-emerald-900/90">
              <strong>Using Free Tier:</strong> Make sure your API key comes
              from a Google AI Studio project whose Billing Tier shows{" "}
              <strong>Free</strong> (projects with depleted Prepay billing
              return HTTP 402 instead of auto-downgrading).
            </p>
          </div>

          <div className="rounded-xl border border-[#E6DFD2] bg-[#FAF8F4] p-3.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-stone-800">
                Server Environment Key (.env.local)
              </span>
              {envConfigured ? (
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Configured
                </span>
              ) : (
                <span className="font-medium text-amber-700">Not set</span>
              )}
            </div>
            <p className="mt-1.5 text-stone-600">
              Recommended for daily use: add{" "}
              <code className="rounded bg-stone-200 px-1 py-0.5 font-mono">
                GEMINI_API_KEY=your_key
              </code>{" "}
              to <code className="font-mono">.env.local</code> and restart the
              dev server.
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-[#1F5E4B] hover:underline"
              >
                <span>Create / view API Keys</span>
                <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href="https://aistudio.google.com/projects"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-[#1F5E4B] hover:underline"
              >
                <span>Manage Free Tier Projects</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-700">
              Optional Browser Session Key Override
            </label>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={
                envConfigured
                  ? "Using server .env.local key (paste a Free Tier key here to override)..."
                  : "Paste Gemini API key (AQ... or AIza...) for this browser session"
              }
              className="w-full rounded-xl border border-[#E6DFD2] bg-white px-3.5 py-2 text-sm text-stone-900 outline-none focus:border-[#1F5E4B]"
            />
            <p className="mt-1 text-[11px] text-stone-500">
              Stored only in this browser tab&apos;s sessionStorage, never saved
              to disk.
            </p>
          </div>

          {testResult && (
            <div
              className={`rounded-xl border p-3 text-xs ${
                testResult.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-red-200 bg-red-50 text-red-800"
              }`}
            >
              {testResult.message}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-[#E6DFD2] pt-4">
            <button
              type="button"
              disabled={testing}
              onClick={handleTest}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6DFD2] bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-60"
            >
              {testing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Test Gemini 3.8 Flash</span>
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[#E6DFD2] px-4 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="rounded-xl bg-[#1F5E4B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#174839]"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
