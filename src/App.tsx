import React, { useState, useRef, useEffect } from "react";
import {
  Image as ImageIcon,
  Video as VideoIcon,
  Sliders,
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  Download,
  RotateCcw,
  Plus,
  Trash2,
  AlertTriangle,
  AlertCircle,
  Volume2,
  VolumeX,
  Music,
  X,
  CheckCircle2,
  User,
  Grid,
  Layers,
  Film,
} from "lucide-react";
import {
  inspectCharacterImage,
  inspectDrivingVideo,
  synthesizeNaturalBackgroundTrack,
  ImageInspection,
  VideoInspection,
} from "./utils/mediaTools";
import { CharacterLab } from "./components/CharacterLab";
import { CharacterSheet } from "./components/CharacterSheet";
import { StageSwap } from "./components/StageSwap";

type ActiveTab = "motion" | "lab" | "sheet" | "stage";

interface MotionJobStatus {
  id: string;
  status:
    | "uploading"
    | "processing_video"
    | "generating_base"
    | "extending_15s"
    | "composing_music"
    | "completed"
    | "failed"
    | "cancelled";
  stageLabel: string;
  progress: number;
  estimatedSecondsRemaining?: number;
  videoUrl?: string;
  videoMimeType?: string;
  outputDurationSeconds?: number;
  musicAudioUrl?: string;
  musicMimeType?: string;
  error?: string;
  errorCode?: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("motion");

  // Step 1: Character Image + up to 3 extra references
  const [characterImage, setCharacterImage] = useState<ImageInspection | null>(
    null
  );
  const [extraImages, setExtraImages] = useState<ImageInspection[]>([]);

  // Step 2: Driving Reference Video
  const [drivingVideo, setDrivingVideo] = useState<VideoInspection | null>(null);

  // Step 3: Basic Settings (Collapsible)
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">(
    "9:16"
  );
  const [resolution, setResolution] = useState<"720p" | "1080p">("1080p");
  const [targetDuration, setTargetDuration] = useState<"10s" | "15s">("15s");
  const [characterOrientation, setCharacterOrientation] = useState<
    "match_video" | "match_image"
  >("match_video");
  const [aspectRatioFit, setAspectRatioFit] = useState<"crop" | "extend">(
    "crop"
  );
  const [environmentMode, setEnvironmentMode] = useState<
    "keep_character" | "custom"
  >("keep_character");
  const [customEnvironment, setCustomEnvironment] = useState<string>("");
  const [copyCameraMotion, setCopyCameraMotion] = useState<boolean>(false);
  const [musicStyle, setMusicStyle] = useState<
    | "natural_acoustic"
    | "soft_piano"
    | "cinematic_organic"
    | "ambient_nature"
    | "none"
  >("natural_acoustic");
  const [customMusicPrompt, setCustomMusicPrompt] = useState<string>("");

  // Validation & API state
  const [validationError, setValidationError] = useState<string | null>(null);
  const [apiConfigured, setApiConfigured] = useState<boolean>(true);

  // Step 4 & 5: Generation Job & Result
  const [activeJob, setActiveJob] = useState<MotionJobStatus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [synthesizedMusicUrl, setSynthesizedMusicUrl] = useState<string | null>(
    null
  );
  const [isPreviewingMusic, setIsPreviewingMusic] = useState<boolean>(false);
  const [isResultPlaying, setIsResultPlaying] = useState<boolean>(false);
  const [musicMuted, setMusicMuted] = useState<boolean>(false);
  const [musicVolume, setMusicVolume] = useState<number>(0.65);

  const charInputRef = useRef<HTMLInputElement>(null);
  const extraCharInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const resultVideoRef = useRef<HTMLVideoElement>(null);
  const bgAudioRef = useRef<HTMLAudioElement>(null);
  const previewAudioRef = useRef<HTMLAudioElement>(null);

  // Check server API status on mount
  useEffect(() => {
    fetch("/api/status")
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.configured === "boolean") {
          setApiConfigured(data.configured);
        }
      })
      .catch(() => {});
  }, []);

  // Poll active generation job
  useEffect(() => {
    if (
      !activeJob ||
      activeJob.status === "completed" ||
      activeJob.status === "failed" ||
      activeJob.status === "cancelled"
    ) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/motion/status/${activeJob.id}`);
        if (!res.ok) return;
        const updated: MotionJobStatus = await res.json();
        setActiveJob(updated);

        if (
          updated.status === "completed" &&
          !updated.musicAudioUrl &&
          musicStyle !== "none"
        ) {
          // Ensure a natural acoustic soundtrack is always ready for the 10-15s clip
          const wavUrl = await synthesizeNaturalBackgroundTrack(
            musicStyle,
            updated.outputDurationSeconds || 15
          );
          setSynthesizedMusicUrl(wavUrl);
        }
      } catch {
        // Ignore transient poll errors
      }
    }, 2200);

    return () => clearInterval(interval);
  }, [activeJob, musicStyle]);

  // Synchronize background music volume
  useEffect(() => {
    if (bgAudioRef.current) {
      bgAudioRef.current.volume = musicMuted ? 0 : musicVolume;
    }
  }, [musicVolume, musicMuted]);

  const handleCharacterUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setValidationError(null);
    try {
      const inspected = await inspectCharacterImage(file);
      setCharacterImage(inspected);
    } catch (err) {
      setValidationError(
        err instanceof Error ? err.message : "Please upload a valid character image."
      );
    }
    e.target.value = "";
  };

  const handleExtraCharacterUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (extraImages.length >= 3) return;
    setValidationError(null);
    try {
      const inspected = await inspectCharacterImage(file);
      setExtraImages((prev) => [...prev.slice(0, 2), inspected]);
    } catch (err) {
      setValidationError(
        err instanceof Error
          ? err.message
          : "Could not read additional reference image."
      );
    }
    e.target.value = "";
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setValidationError(null);
    try {
      const inspected = await inspectDrivingVideo(file);
      setDrivingVideo(inspected);
      // Automatically match aspect ratio if standard
      if (
        inspected.aspectRatioLabel === "9:16" ||
        inspected.aspectRatioLabel === "16:9" ||
        inspected.aspectRatioLabel === "1:1"
      ) {
        setAspectRatio(inspected.aspectRatioLabel);
      }
    } catch (err) {
      setValidationError(
        err instanceof Error ? err.message : "Please upload a valid MP4 or MOV video."
      );
    }
    e.target.value = "";
  };

  // Receive character image from Character Lab or Stage Swap
  const handleUseGeneratedCharacter = async (
    dataUrl: string,
    fileName: string
  ) => {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], fileName, {
        type: blob.type || "image/png",
      });
      const inspected = await inspectCharacterImage(file);
      setCharacterImage(inspected);
      setActiveTab("motion");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setValidationError("Could not import generated character image.");
    }
  };

  // Preview natural background music
  const handleToggleMusicPreview = async () => {
    if (musicStyle === "none") return;

    if (isPreviewingMusic && previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
      setIsPreviewingMusic(false);
      return;
    }

    const wavUrl = await synthesizeNaturalBackgroundTrack(musicStyle, 15);
    setSynthesizedMusicUrl(wavUrl);
    if (previewAudioRef.current) {
      previewAudioRef.current.src = wavUrl;
      previewAudioRef.current.volume = musicVolume;
      previewAudioRef.current.play().catch(() => {});
      setIsPreviewingMusic(true);
    }
  };

  // Smart cross-input warnings
  const crossWarnings: string[] = [];
  if (characterImage) {
    crossWarnings.push(...characterImage.warnings);
  }
  if (drivingVideo) {
    crossWarnings.push(...drivingVideo.warnings);
  }
  if (
    characterImage &&
    drivingVideo &&
    characterImage.framingEstimate === "close_portrait" &&
    drivingVideo.aspectRatioLabel === "9:16"
  ) {
    crossWarnings.push(
      "Close-up portrait paired with a vertical full-body motion video. Consider adding a full-body reference angle or using 'Extend Background' for smoother lower-body synthesis."
    );
  }

  const aspectMismatch =
    characterImage && characterImage.aspectRatioLabel !== aspectRatio;

  const isGenerating =
    isSubmitting ||
    Boolean(
      activeJob &&
        activeJob.status !== "completed" &&
        activeJob.status !== "failed" &&
        activeJob.status !== "cancelled"
    );

  const canGenerate = Boolean(characterImage && drivingVideo && !isGenerating);

  const handleStartGeneration = async () => {
    if (!characterImage) {
      setValidationError("Please upload a character image.");
      return;
    }
    if (!drivingVideo) {
      setValidationError("Please upload a motion reference video.");
      return;
    }

    setValidationError(null);
    setIsSubmitting(true);

    try {
      // Pre-synthesize the natural acoustic soundtrack so it's ready alongside Lyria
      if (musicStyle !== "none") {
        synthesizeNaturalBackgroundTrack(
          musicStyle,
          targetDuration === "15s" ? 15 : 10
        )
          .then((url) => setSynthesizedMusicUrl(url))
          .catch(() => {});
      }

      const response = await fetch("/api/motion/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterImage: {
            data: characterImage.base64,
            mimeType: characterImage.mimeType,
          },
          extraCharacterImages: extraImages.map((img) => ({
            data: img.base64,
            mimeType: img.mimeType,
          })),
          drivingVideo: {
            data: drivingVideo.base64,
            mimeType: drivingVideo.mimeType,
            duration: drivingVideo.duration,
            width: drivingVideo.width,
            height: drivingVideo.height,
            fps: drivingVideo.fps,
          },
          settings: {
            aspectRatio,
            resolution,
            targetDuration,
            characterOrientation,
            aspectRatioFit,
            environmentMode,
            customEnvironment,
            copyCameraMotion,
            musicStyle,
            customMusicPrompt,
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data.error ||
            "Video generation is currently unavailable. Please try again later."
        );
      }

      setActiveJob({
        id: data.jobId,
        status: "uploading",
        stageLabel: "Uploading character and driving video...",
        progress: 10,
        estimatedSecondsRemaining: targetDuration === "15s" ? 75 : 45,
      });
    } catch (err) {
      setValidationError(
        err instanceof Error
          ? err.message
          : "Video generation is currently unavailable. Please try again later."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelJob = async () => {
    if (!activeJob) return;
    try {
      await fetch(`/api/motion/cancel/${activeJob.id}`, { method: "POST" });
      setActiveJob((prev) =>
        prev
          ? {
              ...prev,
              status: "cancelled",
              stageLabel: "Generation cancelled.",
            }
          : null
      );
    } catch {
      // Ignore cancel error
    }
  };

  const handleStartNewProject = () => {
    setCharacterImage(null);
    setExtraImages([]);
    setDrivingVideo(null);
    setActiveJob(null);
    setValidationError(null);
    setIsResultPlaying(false);
  };

  const handleToggleResultPlay = () => {
    const video = resultVideoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      if (bgAudioRef.current && musicStyle !== "none") {
        bgAudioRef.current.currentTime = video.currentTime;
        bgAudioRef.current.play().catch(() => {});
      }
      setIsResultPlaying(true);
    } else {
      video.pause();
      if (bgAudioRef.current) {
        bgAudioRef.current.pause();
      }
      setIsResultPlaying(false);
    }
  };

  const handleDownloadResultVideo = () => {
    if (!activeJob?.videoUrl) return;
    const link = document.createElement("a");
    link.href = activeJob.videoUrl;
    link.download = `motion_studio_${targetDuration}_${resolution}.mp4`;
    link.click();
  };

  const effectiveMusicUrl = activeJob?.musicAudioUrl || synthesizedMusicUrl;

  return (
    <div className="min-h-screen bg-[#090A0F] text-[#F3F4F8] pb-24 md:pb-16">
      {/* Hidden audio element for natural music preview */}
      <audio
        ref={previewAudioRef}
        onEnded={() => setIsPreviewingMusic(false)}
        className="hidden"
      />

      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-[#090A0F]/90 backdrop-blur-md border-b border-white/[0.08]">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8 px-4 sm:px-6 h-14">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab("motion");
            }}
            className="text-lg font-bold tracking-tight text-[#F3F4F8] whitespace-nowrap shrink-0"
          >
            Motion Studio
          </a>

          {/* Zone 2: 4 concise single-line navigation links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
            <button
              type="button"
              onClick={() => setActiveTab("motion")}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeTab === "motion"
                  ? "text-[#F3F4F8] border-[#7C5CFF]"
                  : "text-[#9499AD] hover:text-[#F3F4F8] border-transparent"
              }`}
            >
              Motion Control
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("lab")}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeTab === "lab"
                  ? "text-[#F3F4F8] border-[#7C5CFF]"
                  : "text-[#9499AD] hover:text-[#F3F4F8] border-transparent"
              }`}
            >
              Character Lab
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("sheet")}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeTab === "sheet"
                  ? "text-[#F3F4F8] border-[#7C5CFF]"
                  : "text-[#9499AD] hover:text-[#F3F4F8] border-transparent"
              }`}
            >
              Character Sheet
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("stage")}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeTab === "stage"
                  ? "text-[#F3F4F8] border-[#7C5CFF]"
                  : "text-[#9499AD] hover:text-[#F3F4F8] border-transparent"
              }`}
            >
              Stage Swap
            </button>
          </nav>

          {/* Zone 3: 1 primary action (Settings trigger) */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => {
                setActiveTab("motion");
                setSettingsOpen((prev) => !prev);
              }}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#161926] hover:bg-[#1F2335] border border-white/[0.08] text-xs font-medium text-[#F3F4F8] flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
              aria-label="Toggle studio settings"
            >
              <Sliders className="w-3.5 h-3.5 text-[#7C5CFF]" />
              <span>Settings</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8">
        {/* Subtitle & Workspace Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-6 mb-6 border-b border-white/[0.06]">
          <div>
            <p className="text-xs font-medium text-[#9499AD]">
              AI Character Motion Control
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#F3F4F8] mt-0.5">
              {activeTab === "motion" && "Transfer Video Motion to Your Character"}
              {activeTab === "lab" && "AI Influencer & Character Generator"}
              {activeTab === "sheet" && "16:9 Multi-View Character Reference Sheet"}
              {activeTab === "stage" && "Relight & Change Character Environment"}
            </h1>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#9499AD] font-mono tabular-nums">
            <span>Omni 1.1 Flash</span>
            <span aria-hidden="true">·</span>
            <span>10s–15s Output</span>
            <span aria-hidden="true">·</span>
            <span>Natural Acoustic Audio</span>
          </div>
        </div>

        {!apiConfigured && (
          <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-3 text-xs text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Provider Configuration Required</p>
              <p className="text-amber-200/80 mt-0.5">
                Video motion transfer requires a valid Gemini API key configured in Settings &gt; Secrets.
              </p>
            </div>
          </div>
        )}

        {/* TAB 1: MOTION CONTROL (DEFAULT LANDING PAGE) */}
        {activeTab === "motion" && (
          <div className="space-y-6">
            {/* Hidden file inputs */}
            <input
              ref={charInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={handleCharacterUpload}
              className="hidden"
            />
            <input
              ref={extraCharInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={handleExtraCharacterUpload}
              className="hidden"
            />
            <input
              ref={videoInputRef}
              type="file"
              accept=".mp4,.mov,video/mp4,video/quicktime"
              onChange={handleVideoUpload}
              className="hidden"
            />

            {/* Step 1 & Step 2 Side-by-Side on Desktop, Stacked on Mobile */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              {/* STEP 1: UPLOAD CHARACTER IMAGE */}
              <section className="bg-[#11131C] border border-white/[0.08] rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <span className="text-xs font-medium text-[#9499AD]">
                        01. Identity & Appearance
                      </span>
                      <h2 className="text-lg font-semibold text-[#F3F4F8]">
                        Upload Character Image
                      </h2>
                    </div>
                    <span className="text-xs text-[#6E7387] font-mono">
                      JPG · PNG · WebP
                    </span>
                  </div>

                  {characterImage ? (
                    <div className="space-y-4">
                      <div className="relative rounded-xl overflow-hidden bg-[#090A0F] border border-white/[0.08] flex items-center justify-center min-h-[260px] max-h-[340px]">
                        <img
                          src={characterImage.dataUrl}
                          alt="Uploaded character"
                          referrerPolicy="no-referrer"
                          className="max-h-[320px] w-auto object-contain"
                        />
                      </div>

                      {/* Unboxed clean metadata with typographic separators */}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#9499AD] font-mono tabular-nums">
                        <span className="truncate max-w-[200px] text-[#D5D8E6]">
                          {characterImage.fileName}
                        </span>
                        <div className="flex items-center gap-2">
                          <span>
                            {characterImage.width}×{characterImage.height}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{characterImage.aspectRatioLabel}</span>
                          <span aria-hidden="true">·</span>
                          <span>{characterImage.fileSizeMB.toFixed(1)} MB</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => charInputRef.current?.click()}
                          className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-[#1A1D2B] hover:bg-[#232738] text-xs font-medium text-[#F3F4F8] transition-colors whitespace-nowrap shrink-0"
                        >
                          Replace Character
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCharacterImage(null);
                            setExtraImages([]);
                          }}
                          className="min-h-[44px] px-4 py-2 rounded-xl bg-[#1A1D2B] hover:bg-red-500/20 text-xs font-medium text-[#9499AD] hover:text-red-300 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Remove</span>
                        </button>
                      </div>

                      {/* Optional: Up to 3 Extra Reference Images */}
                      <div className="pt-3 border-t border-white/[0.06]">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-[#D5D8E6]">
                            Extra Identity Angles (Optional)
                          </span>
                          <span className="text-xs text-[#6E7387] font-mono tabular-nums">
                            {extraImages.length} / 3
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          {extraImages.map((img, idx) => (
                            <div
                              key={idx}
                              className="relative w-14 h-14 rounded-lg overflow-hidden border border-white/[0.1] bg-[#090A0F] group shrink-0"
                            >
                              <img
                                src={img.dataUrl}
                                alt={`Extra reference ${idx + 1}`}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setExtraImages((prev) =>
                                    prev.filter((_, i) => i !== idx)
                                  )
                                }
                                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"
                                aria-label="Remove reference image"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                          {extraImages.length < 3 && (
                            <button
                              type="button"
                              onClick={() => extraCharInputRef.current?.click()}
                              className="min-h-[56px] px-3.5 rounded-lg border border-dashed border-white/[0.14] hover:border-[#7C5CFF] bg-[#090A0F]/60 text-xs text-[#9499AD] hover:text-[#F3F4F8] flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                            >
                              <Plus className="w-4 h-4" />
                              <span>Add Angle</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => charInputRef.current?.click()}
                      className="cursor-pointer border border-dashed border-white/[0.14] hover:border-[#7C5CFF] rounded-2xl p-8 sm:p-10 text-center bg-[#090A0F]/60 transition-colors flex flex-col items-center justify-center min-h-[280px]"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-[#1A1D2B] flex items-center justify-center text-[#7C5CFF] mb-4">
                        <ImageIcon className="w-6 h-6" />
                      </div>
                      <p className="text-base font-semibold text-[#F3F4F8]">
                        Drop character photo here
                      </p>
                      <p className="text-xs text-[#9499AD] mt-1 max-w-xs">
                        Clear face and outfit visibility ensures strict identity lock across motion frames.
                      </p>
                      <button
                        type="button"
                        className="mt-5 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#7C5CFF] hover:bg-[#6B4AE8] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                      >
                        Upload Character
                      </button>
                    </div>
                  )}
                </div>

                <p className="text-xs text-[#6E7387] mt-4 pt-3 border-t border-white/[0.05]">
                  Preserves face structure, skin tone, hair, and clothing without beautification or face swapping.
                </p>
              </section>

              {/* STEP 2: UPLOAD REFERENCE VIDEO */}
              <section className="bg-[#11131C] border border-white/[0.08] rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <span className="text-xs font-medium text-[#9499AD]">
                        02. Driving Performance
                      </span>
                      <h2 className="text-lg font-semibold text-[#F3F4F8]">
                        Upload Reference Video
                      </h2>
                    </div>
                    <span className="text-xs text-[#6E7387] font-mono">
                      MP4 · MOV
                    </span>
                  </div>

                  {drivingVideo ? (
                    <div className="space-y-4">
                      <div className="relative rounded-xl overflow-hidden bg-[#090A0F] border border-white/[0.08] flex items-center justify-center min-h-[260px] max-h-[340px]">
                        <video
                          src={drivingVideo.objectUrl}
                          controls
                          playsInline
                          className="max-h-[320px] w-auto object-contain"
                        />
                      </div>

                      {/* Unboxed video metadata: duration, resolution, frame rate, aspect ratio */}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#9499AD] font-mono tabular-nums">
                        <span className="truncate max-w-[180px] text-[#D5D8E6]">
                          {drivingVideo.fileName}
                        </span>
                        <div className="flex items-center gap-2">
                          <span>{drivingVideo.duration.toFixed(1)}s</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {drivingVideo.width}×{drivingVideo.height}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{drivingVideo.fps} fps</span>
                          <span aria-hidden="true">·</span>
                          <span>{drivingVideo.aspectRatioLabel}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => videoInputRef.current?.click()}
                          className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-[#1A1D2B] hover:bg-[#232738] text-xs font-medium text-[#F3F4F8] transition-colors whitespace-nowrap shrink-0"
                        >
                          Replace Video
                        </button>
                        <button
                          type="button"
                          onClick={() => setDrivingVideo(null)}
                          className="min-h-[44px] px-4 py-2 rounded-xl bg-[#1A1D2B] hover:bg-red-500/20 text-xs font-medium text-[#9499AD] hover:text-red-300 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => videoInputRef.current?.click()}
                      className="cursor-pointer border border-dashed border-white/[0.14] hover:border-[#7C5CFF] rounded-2xl p-8 sm:p-10 text-center bg-[#090A0F]/60 transition-colors flex flex-col items-center justify-center min-h-[280px]"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-[#1A1D2B] flex items-center justify-center text-[#7C5CFF] mb-4">
                        <VideoIcon className="w-6 h-6" />
                      </div>
                      <p className="text-base font-semibold text-[#F3F4F8]">
                        Drop driving motion video here
                      </p>
                      <p className="text-xs text-[#9499AD] mt-1 max-w-xs">
                        10 to 15 second single-person clip recommended for full-body gesture and expression transfer.
                      </p>
                      <button
                        type="button"
                        className="mt-5 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#1A1D2B] hover:bg-[#25293C] border border-white/[0.1] text-[#F3F4F8] text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                      >
                        Upload Motion Video
                      </button>
                    </div>
                  )}
                </div>

                <p className="text-xs text-[#9499AD] mt-4 pt-3 border-t border-white/[0.05]">
                  Your video provides the motion only. Your uploaded character provides the identity and appearance.
                </p>
              </section>
            </div>

            {/* Smart Validation Warnings */}
            {crossWarnings.length > 0 && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-1.5">
                {crossWarnings.map((warning, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 text-xs text-amber-200"
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>{warning}</span>
                  </div>
                ))}
              </div>
            )}

            {/* STEP 3: COLLAPSIBLE BASIC SETTINGS */}
            <section className="bg-[#11131C] border border-white/[0.08] rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => setSettingsOpen(!settingsOpen)}
                className="w-full min-h-[56px] px-5 sm:px-6 py-4 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-semibold text-[#F3F4F8]">
                    03. Basic Settings
                  </span>
                  <div className="flex items-center gap-2 text-xs text-[#9499AD] font-mono tabular-nums">
                    <span>{targetDuration} Duration</span>
                    <span aria-hidden="true">·</span>
                    <span>{aspectRatio}</span>
                    <span aria-hidden="true">·</span>
                    <span>{resolution}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {characterOrientation === "match_video"
                        ? "Match Video"
                        : "Match Image"}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {musicStyle === "none" ? "No Music" : "Natural Music"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-[#9499AD] shrink-0">
                  <span>{settingsOpen ? "Hide" : "Customize"}</span>
                  {settingsOpen ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </div>
              </button>

              {settingsOpen && (
                <div className="px-5 sm:px-6 pb-6 pt-2 border-t border-white/[0.06] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Output Duration (10s - 15s Priority) */}
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-[#D5D8E6]">
                      Output Video Duration (10s–15s)
                    </label>
                    <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#090A0F] rounded-xl border border-white/[0.06]">
                      <button
                        type="button"
                        onClick={() => setTargetDuration("15s")}
                        className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          targetDuration === "15s"
                            ? "bg-[#7C5CFF] text-white"
                            : "text-[#9499AD] hover:text-[#F3F4F8]"
                        }`}
                      >
                        15 Seconds (Full)
                      </button>
                      <button
                        type="button"
                        onClick={() => setTargetDuration("10s")}
                        className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          targetDuration === "10s"
                            ? "bg-[#7C5CFF] text-white"
                            : "text-[#9499AD] hover:text-[#F3F4F8]"
                        }`}
                      >
                        10 Seconds
                      </button>
                    </div>
                    <p className="text-[11px] text-[#6E7387]">
                      15s uses Omni 1.1 Flash 10s generation + 5s seamless continuation.
                    </p>
                  </div>

                  {/* Aspect Ratio */}
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-[#D5D8E6]">
                      Aspect Ratio
                    </label>
                    <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#090A0F] rounded-xl border border-white/[0.06]">
                      {(["9:16", "16:9", "1:1"] as const).map((ratio) => (
                        <button
                          key={ratio}
                          type="button"
                          onClick={() => setAspectRatio(ratio)}
                          className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap shrink-0 ${
                            aspectRatio === ratio
                              ? "bg-[#7C5CFF] text-white"
                              : "text-[#9499AD] hover:text-[#F3F4F8]"
                          }`}
                        >
                          {ratio}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Resolution */}
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-[#D5D8E6]">
                      Resolution
                    </label>
                    <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#090A0F] rounded-xl border border-white/[0.06]">
                      {(["720p", "1080p"] as const).map((res) => (
                        <button
                          key={res}
                          type="button"
                          onClick={() => setResolution(res)}
                          className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap shrink-0 ${
                            resolution === res
                              ? "bg-[#7C5CFF] text-white"
                              : "text-[#9499AD] hover:text-[#F3F4F8]"
                          }`}
                        >
                          {res}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Character Orientation */}
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-[#D5D8E6]">
                      Character Orientation
                    </label>
                    <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#090A0F] rounded-xl border border-white/[0.06]">
                      <button
                        type="button"
                        onClick={() => setCharacterOrientation("match_video")}
                        className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          characterOrientation === "match_video"
                            ? "bg-[#7C5CFF] text-white"
                            : "text-[#9499AD] hover:text-[#F3F4F8]"
                        }`}
                      >
                        Match Video
                      </button>
                      <button
                        type="button"
                        onClick={() => setCharacterOrientation("match_image")}
                        className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          characterOrientation === "match_image"
                            ? "bg-[#7C5CFF] text-white"
                            : "text-[#9499AD] hover:text-[#F3F4F8]"
                        }`}
                      >
                        Match Image
                      </button>
                    </div>
                    <p className="text-[11px] text-[#6E7387]">
                      {characterOrientation === "match_video"
                        ? "Follows the reference video's body orientation and facing direction."
                        : "Preserves the character image's original facing direction as much as possible."}
                    </p>
                  </div>

                  {/* Natural Background Music */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="music-style"
                        className="block text-xs font-medium text-[#D5D8E6]"
                      >
                        Natural Background Music
                      </label>
                      {musicStyle !== "none" && (
                        <button
                          type="button"
                          onClick={handleToggleMusicPreview}
                          className="text-xs text-[#7C5CFF] hover:underline flex items-center gap-1 whitespace-nowrap shrink-0"
                        >
                          <Music className="w-3 h-3" />
                          <span>
                            {isPreviewingMusic ? "Stop Preview" : "Preview Audio"}
                          </span>
                        </button>
                      )}
                    </div>
                    <select
                      id="music-style"
                      value={musicStyle}
                      onChange={(e) => setMusicStyle(e.target.value as any)}
                      className="w-full min-h-[42px] px-3 py-2 bg-[#090A0F] border border-white/[0.1] rounded-xl text-xs text-[#F3F4F8] focus:outline-none focus:border-[#7C5CFF]"
                    >
                      <option value="natural_acoustic">
                        Natural Acoustic Guitar & Studio Room Tone
                      </option>
                      <option value="soft_piano">
                        Warm Felt Piano & Organic Ambience
                      </option>
                      <option value="cinematic_organic">
                        Subtle Organic Strings & Natural Air
                      </option>
                      <option value="ambient_nature">
                        Natural Outdoor Breeze & Soft Harmonics
                      </option>
                      <option value="none">No Background Music</option>
                    </select>
                  </div>

                  {/* Copy Camera Motion */}
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-[#D5D8E6]">
                      Camera & Framing
                    </label>
                    <div className="flex items-center justify-between min-h-[42px] px-3.5 py-2 rounded-xl bg-[#090A0F] border border-white/[0.06]">
                      <span className="text-xs text-[#D5D8E6]">
                        Copy Camera Motion
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={copyCameraMotion}
                        onClick={() => setCopyCameraMotion(!copyCameraMotion)}
                        className={`w-10 h-5 rounded-full transition-colors p-0.5 shrink-0 ${
                          copyCameraMotion ? "bg-[#7C5CFF]" : "bg-[#1A1D2B]"
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full bg-white transition-transform ${
                            copyCameraMotion ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                    {aspectMismatch && (
                      <div className="grid grid-cols-2 gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setAspectRatioFit("crop")}
                          className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                            aspectRatioFit === "crop"
                              ? "bg-[#1A1D2B] border-[#7C5CFF] text-white"
                              : "bg-[#090A0F] border-white/[0.06] text-[#9499AD]"
                          }`}
                        >
                          Crop Image
                        </button>
                        <button
                          type="button"
                          onClick={() => setAspectRatioFit("extend")}
                          className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                            aspectRatioFit === "extend"
                              ? "bg-[#1A1D2B] border-[#7C5CFF] text-white"
                              : "bg-[#090A0F] border-white/[0.06] text-[#9499AD]"
                          }`}
                        >
                          Extend Background
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Environment Control */}
                  <div className="md:col-span-2 lg:col-span-3 pt-2 border-t border-white/[0.06] grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                    <div className="md:col-span-4 space-y-1">
                      <label className="block text-xs font-medium text-[#D5D8E6]">
                        Background & Environment
                      </label>
                      <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#090A0F] rounded-xl border border-white/[0.06]">
                        <button
                          type="button"
                          onClick={() => setEnvironmentMode("keep_character")}
                          className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                            environmentMode === "keep_character"
                              ? "bg-[#7C5CFF] text-white"
                              : "text-[#9499AD] hover:text-[#F3F4F8]"
                          }`}
                        >
                          Keep Character BG
                        </button>
                        <button
                          type="button"
                          onClick={() => setEnvironmentMode("custom")}
                          className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                            environmentMode === "custom"
                              ? "bg-[#7C5CFF] text-white"
                              : "text-[#9499AD] hover:text-[#F3F4F8]"
                          }`}
                        >
                          New Environment
                        </button>
                      </div>
                    </div>

                    <div className="md:col-span-8">
                      {environmentMode === "custom" ? (
                        <input
                          type="text"
                          value={customEnvironment}
                          onChange={(e) => setCustomEnvironment(e.target.value)}
                          placeholder="Describe the new environment (e.g., Sunlit modern architectural loft with warm wooden floors)..."
                          className="w-full min-h-[42px] px-3.5 py-2 bg-[#090A0F] border border-white/[0.1] rounded-xl text-xs text-[#F3F4F8] placeholder-[#6E7387] focus:outline-none focus:border-[#7C5CFF]"
                        />
                      ) : (
                        <p className="text-xs text-[#6E7387]">
                          Preserves the uploaded character image's background, lighting, and color palette. The driving video's background is never copied.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Validation / Error Alert */}
            {(validationError || activeJob?.status === "failed") && (
              <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 text-xs text-red-200">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-300">
                      {validationError ? "Input Check" : "Generation Notice"}
                    </p>
                    <p className="mt-0.5 leading-relaxed">
                      {validationError || activeJob?.error}
                    </p>
                  </div>
                </div>
                {activeJob?.status === "failed" && (
                  <button
                    type="button"
                    onClick={handleStartGeneration}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-200 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}

            {/* STEP 4: GENERATE BUTTON & LIVE PROGRESS */}
            {activeJob &&
            activeJob.status !== "completed" &&
            activeJob.status !== "failed" &&
            activeJob.status !== "cancelled" ? (
              <section className="bg-[#11131C] border border-[#7C5CFF]/40 rounded-2xl p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-medium text-[#7C5CFF] uppercase tracking-wider">
                      Status: {activeJob.status.replace(/_/g, " ")}
                    </span>
                    <h3 className="text-base font-semibold text-[#F3F4F8] mt-0.5">
                      {activeJob.stageLabel}
                    </h3>
                  </div>
                  <div className="flex items-center gap-4">
                    {typeof activeJob.estimatedSecondsRemaining === "number" &&
                      activeJob.estimatedSecondsRemaining > 0 && (
                        <span className="text-xs text-[#9499AD] font-mono tabular-nums">
                          ~{activeJob.estimatedSecondsRemaining}s remaining
                        </span>
                      )}
                    <span className="text-sm font-mono font-semibold text-[#F3F4F8] tabular-nums">
                      {activeJob.progress}%
                    </span>
                  </div>
                </div>

                <div className="w-full h-2 bg-[#090A0F] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#7C5CFF] transition-all duration-300"
                    style={{ width: `${activeJob.progress}%` }}
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-[#6E7387]">
                    Target: {targetDuration} · {resolution} · {aspectRatio} · Identity Lock Active
                  </span>
                  <button
                    type="button"
                    onClick={handleCancelJob}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-[#1A1D2B] hover:bg-red-500/20 text-xs font-medium text-[#D5D8E6] hover:text-red-300 transition-colors whitespace-nowrap shrink-0"
                  >
                    Cancel Generation
                  </button>
                </div>
              </section>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#11131C] border border-white/[0.08] rounded-2xl p-5 sm:p-6">
                <div className="text-center sm:text-left">
                  <p className="text-sm font-semibold text-[#F3F4F8]">
                    Ready to Generate {targetDuration} Motion Video
                  </p>
                  <p className="text-xs text-[#9499AD] mt-0.5">
                    {characterImage && drivingVideo
                      ? `Character identity locked from ${characterImage.fileName} · Motion from ${drivingVideo.fileName}`
                      : "Upload both a character image and a reference motion video above to enable generation."}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={!canGenerate}
                  onClick={handleStartGeneration}
                  className="w-full sm:w-auto min-h-[52px] px-8 py-3.5 rounded-xl bg-[#7C5CFF] hover:bg-[#6B4AE8] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2.5 shadow-lg shadow-[#7C5CFF]/20 transition-all whitespace-nowrap shrink-0"
                >
                  <Film className="w-4 h-4" />
                  <span>Generate Motion Video</span>
                </button>
              </div>
            )}

            {/* STEP 5: RESULT PANEL */}
            {activeJob?.status === "completed" && activeJob.videoUrl && (
              <section className="bg-[#11131C] border border-white/[0.12] rounded-2xl p-6 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div>
                      <h3 className="text-lg font-semibold text-[#F3F4F8]">
                        Generated Motion Video
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-[#9499AD] font-mono tabular-nums mt-0.5">
                        <span>{activeJob.outputDurationSeconds || 15}s Duration</span>
                        <span aria-hidden="true">·</span>
                        <span>{resolution}</span>
                        <span aria-hidden="true">·</span>
                        <span>{aspectRatio}</span>
                        <span aria-hidden="true">·</span>
                        <span>Natural Background Audio</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={handleToggleResultPlay}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-[#1A1D2B] hover:bg-[#232738] text-xs font-medium text-[#F3F4F8] flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                    >
                      {isResultPlaying ? (
                        <>
                          <Pause className="w-4 h-4" />
                          <span>Pause</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          <span>Play</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadResultVideo}
                      className="min-h-[44px] px-5 py-2 rounded-xl bg-[#7C5CFF] hover:bg-[#6B4AE8] text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download Video</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleStartGeneration}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-[#1A1D2B] hover:bg-[#232738] text-xs font-medium text-[#F3F4F8] flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Generate Again</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleStartNewProject}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-[#090A0F] hover:bg-[#1A1D2B] border border-white/[0.08] text-xs font-medium text-[#9499AD] hover:text-[#F3F4F8] transition-colors whitespace-nowrap shrink-0"
                    >
                      Start New Project
                    </button>
                  </div>
                </div>

                {/* Video Player */}
                <div className="relative rounded-xl overflow-hidden bg-[#090A0F] border border-white/[0.08] flex items-center justify-center max-h-[540px]">
                  <video
                    ref={resultVideoRef}
                    src={activeJob.videoUrl}
                    controls
                    loop
                    playsInline
                    onPlay={() => {
                      setIsResultPlaying(true);
                      if (bgAudioRef.current && musicStyle !== "none") {
                        bgAudioRef.current.currentTime =
                          resultVideoRef.current?.currentTime || 0;
                        bgAudioRef.current.play().catch(() => {});
                      }
                    }}
                    onPause={() => {
                      setIsResultPlaying(false);
                      bgAudioRef.current?.pause();
                    }}
                    className="max-h-[520px] w-auto object-contain"
                  />
                </div>

                {/* Synchronized Natural Background Music Bar */}
                {musicStyle !== "none" && effectiveMusicUrl && (
                  <div className="p-4 rounded-xl bg-[#090A0F] border border-white/[0.06] flex flex-wrap items-center justify-between gap-4">
                    <audio
                      ref={bgAudioRef}
                      src={effectiveMusicUrl}
                      loop
                      className="hidden"
                    />
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setMusicMuted(!musicMuted)}
                        className="min-h-[40px] min-w-[40px] rounded-lg bg-[#1A1D2B] flex items-center justify-center text-[#F3F4F8]"
                        aria-label="Mute or unmute background music"
                      >
                        {musicMuted ? (
                          <VolumeX className="w-4 h-4 text-[#9499AD]" />
                        ) : (
                          <Volume2 className="w-4 h-4 text-[#7C5CFF]" />
                        )}
                      </button>
                      <div>
                        <p className="text-xs font-medium text-[#F3F4F8]">
                          Synchronized Natural Background Music
                        </p>
                        <p className="text-[11px] text-[#9499AD]">
                          {activeJob.musicAudioUrl
                            ? "Generated by Lyria 3 Clip"
                            : "Natural Acoustic Studio Soundtrack"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[#9499AD]">Mix</span>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={musicMuted ? 0 : musicVolume}
                          onChange={(e) => {
                            setMusicMuted(false);
                            setMusicVolume(Number(e.target.value));
                          }}
                          className="w-24 accent-[#7C5CFF] cursor-pointer"
                        />
                      </div>
                      <a
                        href={effectiveMusicUrl}
                        download="natural_background_music.wav"
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#1A1D2B] hover:bg-[#232738] text-xs text-[#D5D8E6] flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Audio (.wav)</span>
                      </a>
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        {/* TAB 2: CHARACTER LAB */}
        {activeTab === "lab" && (
          <CharacterLab onUseCharacter={handleUseGeneratedCharacter} />
        )}

        {/* TAB 3: CHARACTER SHEET */}
        {activeTab === "sheet" && <CharacterSheet />}

        {/* TAB 4: STAGE SWAP */}
        {activeTab === "stage" && (
          <StageSwap onUseCharacter={handleUseGeneratedCharacter} />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (Thumb-zone ergonomic 4-tab bar) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#090A0F]/95 backdrop-blur-md border-t border-white/[0.08] grid grid-cols-4 items-center h-16 px-2">
        <button
          type="button"
          onClick={() => setActiveTab("motion")}
          className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors ${
            activeTab === "motion" ? "text-[#7C5CFF]" : "text-[#9499AD]"
          }`}
        >
          <Film className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1 whitespace-nowrap">
            Motion Control
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("lab")}
          className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors ${
            activeTab === "lab" ? "text-[#7C5CFF]" : "text-[#9499AD]"
          }`}
        >
          <User className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1 whitespace-nowrap">
            Character Lab
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("sheet")}
          className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors ${
            activeTab === "sheet" ? "text-[#7C5CFF]" : "text-[#9499AD]"
          }`}
        >
          <Grid className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1 whitespace-nowrap">
            Ref Sheet
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("stage")}
          className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors ${
            activeTab === "stage" ? "text-[#7C5CFF]" : "text-[#9499AD]"
          }`}
        >
          <Layers className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1 whitespace-nowrap">
            Stage Swap
          </span>
        </button>
      </nav>
    </div>
  );
}
