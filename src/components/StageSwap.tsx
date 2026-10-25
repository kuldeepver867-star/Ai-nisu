import React, { useState, useRef } from "react";
import {
  Upload,
  Layers,
  Download,
  ArrowRight,
  RefreshCw,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { inspectCharacterImage, ImageInspection } from "../utils/mediaTools";

interface StageSwapProps {
  onUseCharacter: (dataUrl: string, fileName: string) => void;
}

export const StageSwap: React.FC<StageSwapProps> = ({ onUseCharacter }) => {
  const [charImage, setCharImage] = useState<ImageInspection | null>(null);
  const [envImage, setEnvImage] = useState<ImageInspection | null>(null);
  const [replaceExistingPerson, setReplaceExistingPerson] = useState(true);
  const [lightingNotes, setLightingNotes] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);

  const charInputRef = useRef<HTMLInputElement>(null);
  const envInputRef = useRef<HTMLInputElement>(null);

  const handleCharFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const inspected = await inspectCharacterImage(file);
      setCharImage(inspected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid character image.");
    }
    e.target.value = "";
  };

  const handleEnvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const inspected = await inspectCharacterImage(file);
      setEnvImage(inspected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid environment image.");
    }
    e.target.value = "";
  };

  const handleSwap = async () => {
    if (!charImage || !envImage || isGenerating) return;
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/character/environment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterImage: {
            data: charImage.base64,
            mimeType: charImage.mimeType,
          },
          environmentImage: {
            data: envImage.base64,
            mimeType: envImage.mimeType,
          },
          replaceExistingPerson,
          lightingNotes: lightingNotes.trim(),
          aspectRatio: envImage.aspectRatioLabel === "9:16" ? "9:16" : "16:9",
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Environment replacement failed.");
      }
      setOutputUrl(data.imageUrl);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Environment replacement is currently unavailable."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!outputUrl) return;
    const link = document.createElement("a");
    link.href = outputUrl;
    link.download = `stage_swap_character.png`;
    link.click();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left Inputs */}
      <div className="lg:col-span-5 bg-[#11131C] border border-white/[0.08] rounded-2xl p-6 space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-[#F3F4F8] tracking-tight">
            Change Character Environment
          </h2>
          <p className="text-sm text-[#9499AD] mt-1">
            Composite your character into a new scene while matching camera angle, ambient lighting, and natural skin texture.
          </p>
        </div>

        <input
          ref={charInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          onChange={handleCharFile}
          className="hidden"
        />
        <input
          ref={envInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          onChange={handleEnvFile}
          className="hidden"
        />

        {/* Input 1: Character Image */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-[#D5D8E6]">
            01. Character Image (Identity & Wardrobe)
          </label>
          {charImage ? (
            <div className="p-3 rounded-xl bg-[#090A0F] border border-white/[0.08] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={charImage.dataUrl}
                  alt="Character input"
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 rounded-lg object-cover shrink-0 border border-white/[0.08]"
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[#F3F4F8] truncate">
                    {charImage.fileName}
                  </p>
                  <p className="text-xs text-[#9499AD] font-mono tabular-nums mt-0.5">
                    {charImage.width}×{charImage.height} · {charImage.aspectRatioLabel}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => charInputRef.current?.click()}
                  className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-[#1A1D2B] hover:bg-[#232738] text-xs text-[#F3F4F8] whitespace-nowrap shrink-0"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => setCharImage(null)}
                  className="min-h-[38px] min-w-[38px] rounded-lg bg-[#1A1D2B] hover:bg-red-500/20 text-[#9499AD] hover:text-red-300 flex items-center justify-center"
                  aria-label="Remove character image"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => charInputRef.current?.click()}
              className="cursor-pointer border border-dashed border-white/[0.14] hover:border-[#7C5CFF] rounded-xl p-5 text-center bg-[#090A0F]/60 transition-colors"
            >
              <Upload className="w-5 h-5 text-[#9499AD] mx-auto mb-2" />
              <p className="text-xs font-medium text-[#F3F4F8]">
                Upload Character Image
              </p>
              <p className="text-[11px] text-[#6E7387] mt-0.5">
                JPG, PNG, or WebP
              </p>
            </div>
          )}
        </div>

        {/* Input 2: Environment Image */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-[#D5D8E6]">
            02. Environment Image (Location & Lighting)
          </label>
          {envImage ? (
            <div className="p-3 rounded-xl bg-[#090A0F] border border-white/[0.08] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={envImage.dataUrl}
                  alt="Environment input"
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 rounded-lg object-cover shrink-0 border border-white/[0.08]"
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[#F3F4F8] truncate">
                    {envImage.fileName}
                  </p>
                  <p className="text-xs text-[#9499AD] font-mono tabular-nums mt-0.5">
                    {envImage.width}×{envImage.height} · {envImage.aspectRatioLabel}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => envInputRef.current?.click()}
                  className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-[#1A1D2B] hover:bg-[#232738] text-xs text-[#F3F4F8] whitespace-nowrap shrink-0"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => setEnvImage(null)}
                  className="min-h-[38px] min-w-[38px] rounded-lg bg-[#1A1D2B] hover:bg-red-500/20 text-[#9499AD] hover:text-red-300 flex items-center justify-center"
                  aria-label="Remove environment image"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => envInputRef.current?.click()}
              className="cursor-pointer border border-dashed border-white/[0.14] hover:border-[#7C5CFF] rounded-xl p-5 text-center bg-[#090A0F]/60 transition-colors"
            >
              <Upload className="w-5 h-5 text-[#9499AD] mx-auto mb-2" />
              <p className="text-xs font-medium text-[#F3F4F8]">
                Upload Target Environment Image
              </p>
              <p className="text-[11px] text-[#6E7387] mt-0.5">
                Preserves scene camera angle, lighting, and background
              </p>
            </div>
          )}
        </div>

        {/* Pose / Subject Replacement Toggle */}
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#090A0F] border border-white/[0.06]">
          <div className="pr-3">
            <p className="text-xs font-medium text-[#F3F4F8]">
              Adopt Existing Subject Pose
            </p>
            <p className="text-[11px] text-[#6E7387] mt-0.5">
              Replace any existing person in the environment image while matching their pose
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={replaceExistingPerson}
            onClick={() => setReplaceExistingPerson(!replaceExistingPerson)}
            className={`w-11 h-6 rounded-full transition-colors p-0.5 shrink-0 ${
              replaceExistingPerson ? "bg-[#7C5CFF]" : "bg-[#1A1D2B]"
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                replaceExistingPerson ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="lighting-notes" className="text-sm font-medium text-[#D5D8E6]">
              Relighting Notes
            </label>
            <span className="text-xs text-[#6E7387]">Optional</span>
          </div>
          <input
            id="lighting-notes"
            type="text"
            value={lightingNotes}
            onChange={(e) => setLightingNotes(e.target.value)}
            placeholder="e.g., Match golden hour warm rim light from the left window"
            className="w-full min-h-[44px] px-3.5 py-2 bg-[#090A0F] border border-white/[0.1] rounded-xl text-sm text-[#F3F4F8] placeholder-[#6E7387] focus:outline-none focus:border-[#7C5CFF]"
          />
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 flex items-start gap-2.5 text-xs text-red-300">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleSwap}
          disabled={!charImage || !envImage || isGenerating}
          className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#7C5CFF] hover:bg-[#6B4AE8] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Compositing & Relighting...</span>
            </>
          ) : (
            <>
              <Layers className="w-4 h-4" />
              <span>Composite Character into Environment</span>
            </>
          )}
        </button>
      </div>

      {/* Right Result */}
      <div className="lg:col-span-7 bg-[#11131C] border border-white/[0.08] rounded-2xl p-6 flex flex-col justify-between min-h-[480px]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-[#F3F4F8]">
              Relighted Environment Composite
            </h3>
            <div className="flex items-center gap-2 text-xs text-[#9499AD] mt-0.5 font-mono tabular-nums">
              <span>Photorealistic Composite</span>
              <span aria-hidden="true">·</span>
              <span>Shadow & Color Matched</span>
            </div>
          </div>
        </div>

        {outputUrl ? (
          <div className="space-y-5">
            <div className="rounded-xl overflow-hidden border border-white/[0.08] bg-[#090A0F]">
              <img
                src={outputUrl}
                alt="Character composited into environment"
                referrerPolicy="no-referrer"
                className="w-full max-h-[440px] object-contain mx-auto"
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleDownload}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#1A1D2B] hover:bg-[#232738] text-[#F3F4F8] text-xs font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>Download Image</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onUseCharacter(outputUrl, "stage_swapped_character.png")
                }
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#7C5CFF] hover:bg-[#6B4AE8] text-white text-xs font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
              >
                <span>Use in Motion Control</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-16 px-4 border border-dashed border-white/[0.08] rounded-xl bg-[#090A0F]/50">
            <div className="w-12 h-12 rounded-2xl bg-[#1A1D2B] flex items-center justify-center text-[#9499AD] mb-3">
              <Layers className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-[#D5D8E6]">
              No environment composite yet
            </p>
            <p className="text-xs text-[#6E7387] max-w-sm mt-1">
              Upload both a character image and an environment photo on the left to relight and place your character into the scene.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
