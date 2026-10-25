export interface ImageInspection {
  dataUrl: string;
  base64: string;
  mimeType: string;
  fileName: string;
  fileSizeMB: number;
  width: number;
  height: number;
  aspectRatioLabel: string;
  numericRatio: number;
  sharpnessScore: number;
  isBlurry: boolean;
  isLowRes: boolean;
  framingEstimate: "close_portrait" | "half_or_full_body";
  warnings: string[];
}

export interface VideoInspection {
  objectUrl: string;
  base64: string;
  mimeType: string;
  fileName: string;
  fileSizeMB: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
  aspectRatioLabel: string;
  numericRatio: number;
  warnings: string[];
}

export function getAspectRatioLabel(width: number, height: number): string {
  if (!width || !height) return "16:9";
  const ratio = width / height;
  if (Math.abs(ratio - 9 / 16) < 0.08) return "9:16";
  if (Math.abs(ratio - 16 / 9) < 0.08) return "16:9";
  if (Math.abs(ratio - 1) < 0.08) return "1:1";
  if (Math.abs(ratio - 3 / 4) < 0.08) return "3:4";
  if (Math.abs(ratio - 4 / 5) < 0.08) return "4:5";
  if (Math.abs(ratio - 4 / 3) < 0.08) return "4:3";
  return ratio < 1 ? "9:16" : "16:9";
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function measureCanvasSharpness(img: HTMLImageElement): number {
  const canvas = document.createElement("canvas");
  const sampleSize = 160;
  canvas.width = sampleSize;
  canvas.height = sampleSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) return 50;

  ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
  const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize);

  let sumDiff = 0;
  let count = 0;
  for (let y = 1; y < sampleSize - 1; y++) {
    for (let x = 1; x < sampleSize - 1; x++) {
      const idx = (y * sampleSize + x) * 4;
      const lumCenter =
        0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      const idxRight = (y * sampleSize + (x + 1)) * 4;
      const lumRight =
        0.299 * data[idxRight] +
        0.587 * data[idxRight + 1] +
        0.114 * data[idxRight + 2];
      const idxDown = ((y + 1) * sampleSize + x) * 4;
      const lumDown =
        0.299 * data[idxDown] +
        0.587 * data[idxDown + 1] +
        0.114 * data[idxDown + 2];

      sumDiff += Math.abs(lumCenter - lumRight) + Math.abs(lumCenter - lumDown);
      count++;
    }
  }
  return count > 0 ? sumDiff / count : 25;
}

export async function inspectCharacterImage(
  file: File
): Promise<ImageInspection> {
  const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  const extValid = /\.(jpe?g|png|webp)$/i.test(file.name);
  if (!validTypes.includes(file.type) && !extValid) {
    throw new Error(
      "Unsupported image format. Please upload a JPG, JPEG, PNG, or WebP image."
    );
  }

  const fileSizeMB = file.size / (1024 * 1024);
  if (fileSizeMB > 25) {
    throw new Error(
      "Character image exceeds the 25 MB limit. Please upload a smaller image."
    );
  }

  const dataUrl = await fileToDataUrl(file);
  const base64 = dataUrl.split(",")[1] || "";

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not decode character image."));
    el.src = dataUrl;
  });

  const width = img.naturalWidth || 1024;
  const height = img.naturalHeight || 1024;
  const sharpnessScore = measureCanvasSharpness(img);
  const isBlurry = sharpnessScore < 6.2;
  const isLowRes = width < 420 || height < 420;
  const aspectRatioLabel = getAspectRatioLabel(width, height);
  const numericRatio = width / height;

  const warnings: string[] = [];
  if (isBlurry) {
    warnings.push("The character's face appears blurry. Try a clearer image.");
  }
  if (isLowRes) {
    warnings.push(
      `Low image resolution (${width}×${height}). Use at least 720p for stronger facial identity lock.`
    );
  }

  const framingEstimate: "close_portrait" | "half_or_full_body" =
    numericRatio >= 0.88 && numericRatio <= 1.15
      ? "close_portrait"
      : "half_or_full_body";

  return {
    dataUrl,
    base64,
    mimeType: file.type || "image/jpeg",
    fileName: file.name,
    fileSizeMB,
    width,
    height,
    aspectRatioLabel,
    numericRatio,
    sharpnessScore,
    isBlurry,
    isLowRes,
    framingEstimate,
    warnings,
  };
}

export async function inspectDrivingVideo(
  file: File
): Promise<VideoInspection> {
  const validTypes = ["video/mp4", "video/quicktime", "video/x-m4v"];
  const extValid = /\.(mp4|mov)$/i.test(file.name);
  if (!validTypes.includes(file.type) && !extValid) {
    throw new Error(
      "Unsupported video format. Please upload an MP4 or MOV reference video."
    );
  }

  const fileSizeMB = file.size / (1024 * 1024);
  if (fileSizeMB > 55) {
    throw new Error(
      "Reference video exceeds the 55 MB upload limit. Please use a 10–15 second clip under 55 MB."
    );
  }

  const dataUrl = await fileToDataUrl(file);
  const base64 = dataUrl.split(",")[1] || "";
  const objectUrl = URL.createObjectURL(file);

  const meta = await new Promise<{
    duration: number;
    width: number;
    height: number;
  }>((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      resolve({
        duration: Number.isFinite(video.duration) ? video.duration : 12,
        width: video.videoWidth || 1080,
        height: video.videoHeight || 1920,
      });
    };
    video.onerror = () =>
      reject(new Error("Could not read reference video metadata."));
    video.src = objectUrl;
  });

  const aspectRatioLabel = getAspectRatioLabel(meta.width, meta.height);
  const numericRatio = meta.width / meta.height;
  const warnings: string[] = [];

  if (meta.duration > 15.5) {
    warnings.push(
      `This video is ${meta.duration.toFixed(
        1
      )}s long. Omni 1.1 Flash generates up to 15s (10s base + 5s extension) per pass without speeding up your motion.`
    );
  } else if (meta.duration < 3) {
    warnings.push(
      "Reference clip is under 3 seconds. A 10 to 15 second driving video is recommended for full motion transfer."
    );
  }

  return {
    objectUrl,
    base64,
    mimeType: file.type || "video/mp4",
    fileName: file.name,
    fileSizeMB,
    duration: meta.duration,
    width: meta.width,
    height: meta.height,
    fps: 30,
    aspectRatioLabel,
    numericRatio,
    warnings,
  };
}

/**
 * Generates a realistic, natural-sounding acoustic background soundtrack as a playable WAV Blob URL
 * using offline Web Audio synthesis (warm acoustic guitar plucks / felt piano + natural room ambience).
 */
export async function synthesizeNaturalBackgroundTrack(
  style: string,
  durationSeconds = 15
): Promise<string> {
  const sampleRate = 24000;
  const totalSamples = Math.floor(sampleRate * durationSeconds);
  const buffer = new Float32Array(totalSamples);

  // Chord progressions in Hz (warm organic voicings)
  const progressions: Record<string, number[][]> = {
    natural_acoustic: [
      [146.83, 220.0, 293.66, 369.99], // Dmaj
      [110.0, 164.81, 220.0, 329.63], // A
      [123.47, 185.0, 246.94, 369.99], // Bm7
      [98.0, 146.83, 196.0, 293.66], // G
    ],
    soft_piano: [
      [130.81, 196.0, 246.94, 329.63], // Cmaj7
      [110.0, 164.81, 196.0, 261.63], // Am7
      [87.31, 130.81, 174.61, 220.0], // Fmaj7
      [98.0, 146.83, 196.0, 246.94], // G6
    ],
    cinematic_organic: [
      [110.0, 164.81, 220.0, 261.63], // Am
      [87.31, 130.81, 174.61, 261.63], // F
      [130.81, 196.0, 261.63, 329.63], // C
      [98.0, 146.83, 196.0, 293.66], // G
    ],
    ambient_nature: [
      [146.83, 220.0, 329.63, 440.0], // Dsus2
      [130.81, 196.0, 293.66, 392.0], // Csus2
      [98.0, 146.83, 220.0, 293.66], // Gsus2
      [110.0, 164.81, 246.94, 329.63], // Asus2
    ],
  };

  const chords = progressions[style] || progressions.natural_acoustic;

  // Add subtle natural studio room warmth (filtered pink noise)
  let b0 = 0,
    b1 = 0,
    b2 = 0;
  for (let i = 0; i < totalSamples; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.997 * b0 + white * 0.02;
    b1 = 0.985 * b1 + white * 0.04;
    b2 = 0.95 * b2 + white * 0.06;
    buffer[i] = (b0 + b1 + b2) * 0.015;
  }

  // Render organic arpeggiated acoustic notes with Karplus-Strong / harmonic decay
  const beatDuration = 0.62; // ~96 BPM gentle tempo
  const totalBeats = Math.floor(durationSeconds / beatDuration);

  for (let beat = 0; beat < totalBeats; beat++) {
    const chord = chords[Math.floor(beat / 4) % chords.length];
    const noteFreq = chord[beat % chord.length];
    const startTime =
      beat * beatDuration + (Math.random() * 0.018 - 0.009); // natural human micro-timing
    const startSample = Math.max(0, Math.floor(startTime * sampleRate));
    const noteLengthSamples = Math.floor(sampleRate * 2.4);

    for (let j = 0; j < noteLengthSamples; j++) {
      const idx = startSample + j;
      if (idx >= totalSamples) break;
      const t = j / sampleRate;
      const attack = Math.min(1, t / 0.018);
      const decay = Math.exp(-t * (style === "cinematic_organic" ? 1.1 : 2.1));
      const fundamental = Math.sin(2 * Math.PI * noteFreq * t);
      const harmonic2 = 0.35 * Math.sin(2 * Math.PI * noteFreq * 2 * t) * Math.exp(-t * 3.5);
      const harmonic3 = 0.12 * Math.sin(2 * Math.PI * noteFreq * 3 * t) * Math.exp(-t * 5.0);
      buffer[idx] += (fundamental + harmonic2 + harmonic3) * attack * decay * 0.18;
    }
  }

  // Smooth fade in and fade out over 15s
  const fadeSamples = Math.floor(sampleRate * 1.2);
  for (let i = 0; i < fadeSamples && i < totalSamples; i++) {
    const gain = i / fadeSamples;
    buffer[i] *= gain;
    buffer[totalSamples - 1 - i] *= gain;
  }

  // Encode Float32Array to 16-bit WAV Blob
  const wavBuffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(wavBuffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + totalSamples * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, totalSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < totalSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, buffer[i]));
    view.setInt16(
      offset,
      clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
      true
    );
    offset += 2;
  }

  const blob = new Blob([wavBuffer], { type: "audio/wav" });
  return URL.createObjectURL(blob);
}
