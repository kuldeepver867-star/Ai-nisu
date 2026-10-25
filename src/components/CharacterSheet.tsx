import React, { useState, useRef } from "react";
import { Upload, Grid, Download, RefreshCw, Trash2, AlertCircle } from "lucide-react";
import { inspectCharacterImage, ImageInspection } from "../utils/mediaTools";

export const CharacterSheet: React.FC = () => {
  const [refImage, setRefImage] = useState<ImageInspection | null>(null);
  const [notes, setNotes] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const inspected = await inspectCharacterImage(file);
      setRefImage(inspected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid image file.");
    }
    e.target.value = "";
  };

  const handleGenerateSheet = async () => {
    if (!refImage || isGenerating) return;
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/character/sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceImage: {
            data: refImage.base64,
            mimeType: refImage.mimeType,
          },
          notes: notes.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Character sheet generation failed.");
      }
      setSheetUrl(data.imageUrl);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Character sheet generation is currently unavailable."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!sheetUrl) return;
    const link = document.createElement("a");
    link.href = sheetUrl;
    link.download = `character_sheet_16x9.png`;
    link.click();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left Input Card */}
      <div className="lg:col-span-5 bg-[#11131C] border border-white/[0.08] rounded-2xl p-6 space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-[#F3F4F8] tracking-tight">
            Character Reference Sheet
          </h2>
          <p className="text-sm text-[#9499AD] mt-1">
            Upload one character image to generate a unified 16:9 turnaround and facial detail sheet.
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="hidden"
        />

        {refImage ? (
          <div className="space-y-3">
            <div className="relative rounded-xl overflow-hidden border border-white/[0.08] bg-[#090A0F]">
              <img
                src={refImage.dataUrl}
                alt="Reference character"
                referrerPolicy="no-referrer"
                className="w-full max-h-72 object-contain mx-auto"
              />
            </div>
            <div className="flex items-center justify-between text-xs text-[#9499AD] font-mono tabular-nums">
              <span className="truncate max-w-[180px]">{refImage.fileName}</span>
              <span>
                {refImage.width}×{refImage.height} · {refImage.aspectRatioLabel}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-[#1A1D2B] hover:bg-[#232738] text-xs font-medium text-[#F3F4F8] transition-colors whitespace-nowrap shrink-0"
              >
                Replace Image
              </button>
              <button
                type="button"
                onClick={() => {
                  setRefImage(null);
                  setSheetUrl(null);
                }}
                className="min-h-[42px] px-3 py-2 rounded-xl bg-[#1A1D2B] hover:bg-red-500/20 text-xs font-medium text-[#9499AD] hover:text-red-300 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer border border-dashed border-white/[0.14] hover:border-[#7C5CFF] rounded-2xl p-8 text-center bg-[#090A0F]/60 transition-colors"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#1A1D2B] flex items-center justify-center text-[#9499AD] mx-auto mb-3">
              <Upload className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium text-[#F3F4F8]">
              Upload Reference Character
            </p>
            <p className="text-xs text-[#6E7387] mt-1">
              JPG, JPEG, PNG, or WebP
            </p>
            <button
              type="button"
              className="mt-4 min-h-[42px] px-4 py-2 rounded-xl bg-[#1A1D2B] text-xs font-medium text-[#F3F4F8] whitespace-nowrap shrink-0"
            >
              Select Reference Image
            </button>
          </div>
        )}

        <div className="space-y-2 text-xs text-[#9499AD] bg-[#090A0F] p-4 rounded-xl border border-white/[0.06]">
          <p className="font-medium text-[#D5D8E6]">Included in 16:9 Sheet:</p>
          <p>
            Full-body front, side, and back views · Portrait angles · Eye, ear, hair, cheek, nose, and lip close-ups · Natural smile and laughing expressions
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="sheet-notes" className="text-sm font-medium text-[#D5D8E6]">
              Wardrobe or Consistency Notes
            </label>
            <span className="text-xs text-[#6E7387]">Optional</span>
          </div>
          <input
            id="sheet-notes"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., Keep exact footwear and silver earrings visible across all views"
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
          onClick={handleGenerateSheet}
          disabled={!refImage || isGenerating}
          className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#7C5CFF] hover:bg-[#6B4AE8] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Generating 16:9 Character Sheet...</span>
            </>
          ) : (
            <>
              <Grid className="w-4 h-4" />
              <span>Generate Character Sheet</span>
            </>
          )}
        </button>
      </div>

      {/* Right 16:9 Output Card */}
      <div className="lg:col-span-7 bg-[#11131C] border border-white/[0.08] rounded-2xl p-6 flex flex-col justify-between min-h-[480px]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-[#F3F4F8]">
              16:9 Multi-View Reference Sheet
            </h3>
            <div className="flex items-center gap-2 text-xs text-[#9499AD] mt-0.5 font-mono tabular-nums">
              <span>Landscape 16:9</span>
              <span aria-hidden="true">·</span>
              <span>Single Composite Image</span>
              <span aria-hidden="true">·</span>
              <span>Nano Banana 2.1</span>
            </div>
          </div>
          {sheetUrl && (
            <button
              type="button"
              onClick={handleDownload}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#7C5CFF] hover:bg-[#6B4AE8] text-white text-xs font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>Download 16:9 Sheet</span>
            </button>
          )}
        </div>

        {sheetUrl ? (
          <div className="rounded-xl overflow-hidden border border-white/[0.08] bg-[#090A0F]">
            <img
              src={sheetUrl}
              alt="Generated 16:9 character reference sheet"
              referrerPolicy="no-referrer"
              className="w-full h-auto object-contain"
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-16 px-4 border border-dashed border-white/[0.08] rounded-xl bg-[#090A0F]/50">
            <div className="w-12 h-12 rounded-2xl bg-[#1A1D2B] flex items-center justify-center text-[#9499AD] mb-3">
              <Grid className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-[#D5D8E6]">
              No character sheet generated yet
            </p>
            <p className="text-xs text-[#6E7387] max-w-sm mt-1">
              Upload a reference character image on the left to generate a complete 16:9 multi-angle turnaround sheet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
