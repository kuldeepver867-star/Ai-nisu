import React, { useState } from "react";
import { User, Sparkles, Download, ArrowRight, RefreshCw, AlertCircle } from "lucide-react";

interface CharacterLabProps {
  onUseCharacter: (dataUrl: string, fileName: string) => void;
}

export const CharacterLab: React.FC<CharacterLabProps> = ({ onUseCharacter }) => {
  const [gender, setGender] = useState<string>("Female");
  const [age, setAge] = useState<number>(26);
  const [ethnicity, setEthnicity] = useState<string>("South Asian");
  const [description, setDescription] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);

  const canGenerate = Boolean(gender.trim() && ethnicity.trim() && age >= 18 && age <= 70);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canGenerate || isGenerating) return;

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/character/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gender,
          age,
          ethnicity,
          description: description.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Character generation failed.");
      }
      setResultImage(data.imageUrl);
      setExpandedPrompt(data.expandedPrompt || null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Character generation is currently unavailable. Please try again later."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!resultImage) return;
    const link = document.createElement("a");
    link.href = resultImage;
    link.download = `character_${gender.toLowerCase()}_${age}.png`;
    link.click();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left Form Card */}
      <form
        onSubmit={handleGenerate}
        className="lg:col-span-5 bg-[#11131C] border border-white/[0.08] rounded-2xl p-6 space-y-6"
      >
        <div>
          <h2 className="text-xl font-semibold text-[#F3F4F8] tracking-tight">
            Character Lab
          </h2>
          <p className="text-sm text-[#9499AD] mt-1">
            Generate a photorealistic AI character portrait with natural skin texture and studio lighting for motion transfer.
          </p>
        </div>

        {/* Gender */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-[#D5D8E6]">
            Gender
          </label>
          <div className="grid grid-cols-3 gap-2 p-1 bg-[#090A0F] rounded-xl border border-white/[0.06]">
            {["Female", "Male", "Non-binary"].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setGender(option)}
                className={`min-h-[42px] px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  gender === option
                    ? "bg-[#7C5CFF] text-white"
                    : "text-[#9499AD] hover:text-[#F3F4F8]"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {/* Age Slider (18 to 70) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <label htmlFor="char-age" className="font-medium text-[#D5D8E6]">
              Age
            </label>
            <span className="font-mono text-sm text-[#F3F4F8] tabular-nums">
              {age} yrs
            </span>
          </div>
          <input
            id="char-age"
            type="range"
            min={18}
            max={70}
            value={age}
            onChange={(e) => setAge(Number(e.target.value))}
            className="w-full accent-[#7C5CFF] h-2 bg-[#090A0F] rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-xs text-[#6E7387] font-mono tabular-nums">
            <span>18</span>
            <span>35</span>
            <span>50</span>
            <span>70</span>
          </div>
        </div>

        {/* Ethnicity */}
        <div className="space-y-2">
          <label htmlFor="char-ethnicity" className="block text-sm font-medium text-[#D5D8E6]">
            Ethnicity
          </label>
          <select
            id="char-ethnicity"
            value={ethnicity}
            onChange={(e) => setEthnicity(e.target.value)}
            className="w-full min-h-[44px] px-3.5 py-2.5 bg-[#090A0F] border border-white/[0.1] rounded-xl text-sm text-[#F3F4F8] focus:outline-none focus:border-[#7C5CFF]"
          >
            <option value="South Asian">South Asian</option>
            <option value="East Asian">East Asian</option>
            <option value="Middle Eastern">Middle Eastern</option>
            <option value="Black / African">Black / African</option>
            <option value="Hispanic / Latino">Hispanic / Latino</option>
            <option value="European / Caucasian">European / Caucasian</option>
            <option value="Southeast Asian">Southeast Asian</option>
            <option value="Mixed Heritage">Mixed Heritage</option>
          </select>
        </div>

        {/* Optional Appearance Description */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="char-desc" className="block text-sm font-medium text-[#D5D8E6]">
              Appearance Description
            </label>
            <span className="text-xs text-[#6E7387]">Optional</span>
          </div>
          <textarea
            id="char-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., Shoulder-length wavy dark hair, subtle freckles, charcoal linen blazer, soft warm lighting..."
            className="w-full px-3.5 py-2.5 bg-[#090A0F] border border-white/[0.1] rounded-xl text-sm text-[#F3F4F8] placeholder-[#6E7387] focus:outline-none focus:border-[#7C5CFF] resize-none"
          />
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 flex items-start gap-2.5 text-xs text-red-300">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={!canGenerate || isGenerating}
          className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#7C5CFF] hover:bg-[#6B4AE8] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Rendering with Nano Banana 2.1...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Generate Character Portrait</span>
            </>
          )}
        </button>
      </form>

      {/* Right Preview Panel */}
      <div className="lg:col-span-7 bg-[#11131C] border border-white/[0.08] rounded-2xl p-6 flex flex-col justify-between min-h-[480px]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-[#F3F4F8]">
              Generated Portrait
            </h3>
            <div className="flex items-center gap-2 text-xs text-[#9499AD] mt-0.5 font-mono tabular-nums">
              <span>Portrait 3:4</span>
              <span aria-hidden="true">·</span>
              <span>Nano Banana 2.1</span>
              <span aria-hidden="true">·</span>
              <span>Identity Lock Ready</span>
            </div>
          </div>
        </div>

        {resultImage ? (
          <div className="space-y-5">
            <div className="relative max-w-sm mx-auto overflow-hidden rounded-xl border border-white/[0.08] bg-[#090A0F]">
              <img
                src={resultImage}
                alt="Generated AI character portrait"
                referrerPolicy="no-referrer"
                className="w-full h-auto object-cover"
              />
            </div>

            {expandedPrompt && (
              <div className="p-3.5 rounded-xl bg-[#090A0F] border border-white/[0.06] text-xs text-[#9499AD] leading-relaxed">
                <span className="text-[#D5D8E6] font-medium">Expanded Photography Prompt: </span>
                {expandedPrompt}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleDownload}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#1A1D2B] hover:bg-[#232738] text-[#F3F4F8] text-xs font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>Download Portrait</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onUseCharacter(
                    resultImage,
                    `character_${gender.toLowerCase()}_${age}.png`
                  )
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
              <User className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-[#D5D8E6]">
              No portrait generated yet
            </p>
            <p className="text-xs text-[#6E7387] max-w-xs mt-1">
              Select gender, age, and ethnicity on the left to render a realistic character with natural skin texture.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
