import express from "express";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import fs from "fs/promises";
import path from "path";
import os from "os";
import dotenv from "dotenv";

dotenv.config();

const MANDATORY_NEGATIVE_PROMPT =
  "no identity change, no face swap, no altered facial features, no changed eye color, no face distortion, no face morphing, no beautification, no plastic skin, no skin smoothing, no inconsistent hairstyle, no changed clothing, no extra fingers, no extra limbs, no deformed hands, no flickering identity, no background from the driving video, no unwanted scene changes, no unintended camera movement, no unnatural motion.";

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
    throw new Error(
      "API key is not configured. Please select a valid Gemini API key in Settings > Secrets."
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function formatApiError(err: unknown): { message: string; code: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (
    raw.includes("429") ||
    raw.includes("RESOURCE_EXHAUSTED") ||
    raw.toLowerCase().includes("quota")
  ) {
    return {
      code: "QUOTA_EXCEEDED",
      message:
        "Video and image generation models (Omni 1.1 Flash & Nano Banana 2.1) require a billing-enabled API key with active quota. Please select or update your paid API key in Settings > Secrets and try again.",
    };
  }
  if (
    raw.includes("403") ||
    raw.includes("PERMISSION_DENIED") ||
    raw.includes("API_KEY_INVALID")
  ) {
    return {
      code: "AUTH_ERROR",
      message:
        "Permission denied or invalid API key. Please check your GEMINI_API_KEY in the Settings > Secrets panel.",
    };
  }
  if (raw.includes("404") || raw.includes("NOT_FOUND")) {
    return {
      code: "MODEL_UNAVAILABLE",
      message:
        "The requested generation model is currently unavailable for this API key tier. Please verify your key in Settings > Secrets.",
    };
  }
  return {
    code: "GENERATION_FAILED",
    message: raw || "Generation service encountered an unexpected error.",
  };
}

interface MotionJob {
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
  createdAt: number;
  estimatedSecondsRemaining?: number;
  videoUrl?: string;
  videoMimeType?: string;
  outputDurationSeconds?: number;
  musicAudioUrl?: string;
  musicMimeType?: string;
  error?: string;
  errorCode?: string;
  cancelled: boolean;
}

const jobs = new Map<string, MotionJob>();

// Clean up finished jobs older than 30 minutes to avoid retaining user media
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of jobs.entries()) {
    if (job.createdAt < cutoff) {
      jobs.delete(id);
    }
  }
}, 5 * 60 * 1000);

async function runMotionTransferJob(
  jobId: string,
  payload: {
    characterImage: { data: string; mimeType: string };
    extraCharacterImages?: Array<{ data: string; mimeType: string }>;
    drivingVideo: {
      data: string;
      mimeType: string;
      duration: number;
      width: number;
      height: number;
      fps: number;
    };
    settings: {
      aspectRatio: "9:16" | "16:9" | "1:1";
      resolution: "720p" | "1080p";
      targetDuration: "10s" | "15s";
      characterOrientation: "match_video" | "match_image";
      aspectRatioFit: "crop" | "extend";
      environmentMode: "keep_character" | "custom";
      customEnvironment?: string;
      copyCameraMotion: boolean;
      musicStyle: string;
      customMusicPrompt?: string;
    };
  }
) {
  const job = jobs.get(jobId);
  if (!job) return;

  let tempVideoPath: string | null = null;
  let uploadedFileName: string | null = null;
  let ai: GoogleGenAI | null = null;

  try {
    ai = getGenAIClient();

    if (job.cancelled) return;
    job.status = "uploading";
    job.stageLabel = "Uploading reference video and character identity frames...";
    job.progress = 14;
    job.estimatedSecondsRemaining = payload.settings.targetDuration === "15s" ? 75 : 45;

    // Write driving video to temporary file for Files API upload
    const ext =
      payload.drivingVideo.mimeType === "video/quicktime" ? ".mov" : ".mp4";
    tempVideoPath = path.join(os.tmpdir(), `motion_studio_${jobId}${ext}`);
    const videoBuffer = Buffer.from(payload.drivingVideo.data, "base64");
    await fs.writeFile(tempVideoPath, videoBuffer);

    if (job.cancelled) return;
    job.status = "processing_video";
    job.stageLabel = "Analyzing driving video motion, expression timing, and pose keypoints...";
    job.progress = 28;
    job.estimatedSecondsRemaining = payload.settings.targetDuration === "15s" ? 65 : 38;

    let videoFile = await ai.files.upload({
      file: tempVideoPath,
      config: {
        mimeType: payload.drivingVideo.mimeType || "video/mp4",
      },
    });
    uploadedFileName = videoFile.name || null;

    let pollAttempts = 0;
    while (videoFile.state === "PROCESSING") {
      if (job.cancelled) return;
      await new Promise((resolve) => setTimeout(resolve, 4000));
      pollAttempts++;
      job.progress = Math.min(44, 28 + pollAttempts * 3);
      videoFile = await ai.files.get({ name: videoFile.name || "" });
    }

    if (videoFile.state === "FAILED" || !videoFile.uri) {
      throw new Error(
        "Driving video processing failed. Please try a cleaner MP4 or MOV clip."
      );
    }

    if (job.cancelled) return;
    job.status = "generating_base";
    job.stageLabel =
      "Transferring motion to character with Omni 1.1 Flash (10s base sequence)...";
    job.progress = 52;
    job.estimatedSecondsRemaining = payload.settings.targetDuration === "15s" ? 48 : 24;

    // Build input array with character image(s), uploaded driving video, and comprehensive motion transfer prompt
    const inputParts: Array<Record<string, unknown>> = [
      {
        type: "image",
        mime_type: payload.characterImage.mimeType || "image/png",
        data: payload.characterImage.data,
      },
    ];

    const extraRefs = payload.extraCharacterImages || [];
    for (const extra of extraRefs.slice(0, 3)) {
      inputParts.push({
        type: "image",
        mime_type: extra.mimeType || "image/png",
        data: extra.data,
      });
    }

    inputParts.push({
      type: "video",
      uri: videoFile.uri,
    });

    const refTags =
      extraRefs.length > 0
        ? `<IMAGE_REF_0> (primary character) and additional identity angles ${extraRefs
            .slice(0, 3)
            .map((_, idx) => `<IMAGE_REF_${idx + 1}>`)
            .join(", ")}`
        : `<IMAGE_REF_0>`;

    const orientationInstruction =
      payload.settings.characterOrientation === "match_video"
        ? "Match Video Orientation: Follow the driving video's full-body orientation, torso angle, and facing direction."
        : "Match Image Orientation: Preserve the character image's original facing direction as closely as possible while applying the gestures and expressions.";

    const environmentInstruction =
      payload.settings.environmentMode === "custom" &&
      payload.settings.customEnvironment?.trim()
        ? `Environment: Place the character in this exact environment: "${payload.settings.customEnvironment.trim()}". Match shadows, reflections, and ambient illumination to this environment. Never copy the driving video's background.`
        : `Environment: Strictly keep and preserve the background, lighting, and color palette from the character image (<IMAGE_REF_0>). Never copy the driving video's background into the output.`;

    const cameraInstruction = payload.settings.copyCameraMotion
      ? "Camera Motion: Follow the subtle camera framing movement from the reference video while keeping the character's background consistent."
      : "Camera Motion: Keep the camera locked and stable. Do NOT move the camera.";

    const framingInstruction =
      payload.settings.aspectRatioFit === "extend"
        ? `Aspect Ratio Framing (${payload.settings.aspectRatio}): Naturally extend the character image's background to fill the ${payload.settings.aspectRatio} frame without copying any background elements from the driving video.`
        : `Aspect Ratio Framing (${payload.settings.aspectRatio}): Cleanly frame and crop around the character from <IMAGE_REF_0> to fit ${payload.settings.aspectRatio}.`;

    const musicDescriptions: Record<string, string> = {
      natural_acoustic:
        "Include warm, natural acoustic fingerstyle guitar and organic room ambience as subtle background music.",
      soft_piano:
        "Include gentle, natural felt-piano chords with warm studio acoustics as subtle background music.",
      cinematic_organic:
        "Include understated, natural organic strings and soft ambient texture as background music.",
      ambient_nature:
        "Include natural atmospheric breeze, soft acoustic harmonics, and realistic studio room tone.",
      none: "Keep natural synchronized movement sound without added music.",
    };

    const audioInstruction =
      payload.settings.customMusicPrompt?.trim() ||
      musicDescriptions[payload.settings.musicStyle] ||
      musicDescriptions.natural_acoustic;

    const motionTransferPrompt = [
      `Perform high-precision Character Motion Transfer from the provided driving video onto the character shown in ${refTags}.`,
      `1. CHARACTER IDENTITY LOCK (HIGHEST PRIORITY): Strictly preserve the uploaded character's exact face shape, bone structure, eyes, eye color, eyebrows, nose, lips, skin tone, natural skin texture, freckles/identifying marks, hairline, hairstyle, hair color, body proportions, and exact clothing/accessories from ${refTags}. The driving video's actor must NEVER replace the uploaded character. Transfer motion only, never identity.`,
      `2. MOTION TRANSFER ENGINE: Accurately transfer full-body movements, head turns, gaze direction, blinking, facial expressions, lip movement, shoulder/arm/hand/finger articulations, torso/hip/leg weight shifts, and movement timing/pauses from the driving video.`,
      `3. ORIENTATION: ${orientationInstruction}`,
      `4. BACKGROUND & LIGHTING: ${environmentInstruction}`,
      `5. CAMERA: ${cameraInstruction}`,
      `6. FRAMING: ${framingInstruction}`,
      `7. AUDIO & NATURAL BACKGROUND MUSIC: ${audioInstruction}`,
      `8. NEGATIVE CONSTRAINTS: ${MANDATORY_NEGATIVE_PROMPT}`,
    ].join("\n");

    inputParts.push({
      type: "text",
      text: motionTransferPrompt,
    });

    // Omni 1.1 Flash supports '16:9' or '9:16' in response_format
    const omniAspectRatio =
      payload.settings.aspectRatio === "9:16" ? "9:16" : "16:9";

    const baseInteraction = await ai.interactions.create(
      {
        model: "gemini-omni-1.1-flash",
        input: inputParts as any,
        background: false,
        store: payload.settings.targetDuration === "15s",
        stream: false,
        response_format: {
          type: "video",
          aspect_ratio: omniAspectRatio,
          duration: "10s",
          resolution: payload.settings.resolution,
        } as any,
      },
      { timeout: 300000 }
    );

    if (job.cancelled) return;

    let finalVideoPart = baseInteraction.output_video;
    let finalDurationSeconds = 10;

    // If user requested 15s (10-15s requirement), seamlessly extend the 10s video by +5s using multi-turn Video Extension
    if (
      payload.settings.targetDuration === "15s" &&
      baseInteraction.id &&
      finalVideoPart
    ) {
      job.status = "extending_15s";
      job.stageLabel =
        "Extending motion sequence to full 15 seconds while locking character identity...";
      job.progress = 78;
      job.estimatedSecondsRemaining = 18;

      try {
        const extendedInteraction = await ai.interactions.create(
          {
            model: "gemini-omni-1.1-flash",
            previous_interaction_id: baseInteraction.id,
            input: [
              {
                type: "image",
                mime_type: payload.characterImage.mimeType || "image/png",
                data: payload.characterImage.data,
              },
              {
                type: "text",
                text: `Continue and extend this motion video seamlessly for another 5 seconds (total 15 seconds) following the natural flow of the character's movement, breathing, facial expression, and posture. Strictly maintain the exact character identity, face, hair, clothing, and background from <IMAGE_REF_0>. ${audioInstruction} Negative constraints: ${MANDATORY_NEGATIVE_PROMPT}`,
              },
            ] as any,
            background: false,
            store: false,
            stream: false,
            response_format: {
              type: "video",
              aspect_ratio: omniAspectRatio,
              duration: "5s",
              resolution: payload.settings.resolution,
            } as any,
          },
          { timeout: 300000 }
        );

        if (extendedInteraction.output_video?.data || extendedInteraction.output_video?.uri) {
          finalVideoPart = extendedInteraction.output_video;
          finalDurationSeconds = 15;
        }
      } catch (extErr) {
        console.warn(
          "15s extension step fell back to 10s base clip:",
          extErr instanceof Error ? extErr.message : extErr
        );
      }
    }

    if (!finalVideoPart || (!finalVideoPart.data && !finalVideoPart.uri)) {
      throw new Error(
        "The model did not return a valid video stream. Please check your inputs and try again."
      );
    }

    const mimeType = finalVideoPart.mime_type || "video/mp4";
    const videoUrl = finalVideoPart.data
      ? `data:${mimeType};base64,${finalVideoPart.data}`
      : finalVideoPart.uri;

    // Optional: Generate natural background music clip via Lyria Clip (`lyria-3-clip-preview`)
    if (payload.settings.musicStyle !== "none" && !job.cancelled) {
      job.status = "composing_music";
      job.stageLabel =
        "Generating natural acoustic background music with Lyria 3...";
      job.progress = 91;
      job.estimatedSecondsRemaining = 6;

      try {
        const musicPromptText =
          payload.settings.customMusicPrompt?.trim() ||
          `Generate a 15-second natural, organic, unpolished studio instrumental background track (${payload.settings.musicStyle.replace(
            /_/g,
            " "
          )}) with warm acoustic instruments, subtle room ambience, and natural dynamics inspired by this character portrait. No vocals.`;

        const musicStream = await ai.models.generateContentStream({
          model: "lyria-3-clip-preview",
          contents: {
            parts: [
              { text: musicPromptText },
              {
                inlineData: {
                  data: payload.characterImage.data,
                  mimeType: payload.characterImage.mimeType || "image/jpeg",
                },
              },
            ],
          },
        });

        let audioBase64 = "";
        let audioMimeType = "audio/wav";
        for await (const chunk of musicStream) {
          if (job.cancelled) break;
          const parts = chunk.candidates?.[0]?.content?.parts;
          if (!parts) continue;
          for (const part of parts) {
            if (part.inlineData?.data) {
              if (!audioBase64 && part.inlineData.mimeType) {
                audioMimeType = part.inlineData.mimeType;
              }
              audioBase64 += part.inlineData.data;
            }
          }
        }

        if (audioBase64) {
          job.musicAudioUrl = `data:${audioMimeType};base64,${audioBase64}`;
          job.musicMimeType = audioMimeType;
        }
      } catch (musicErr) {
        console.warn(
          "Lyria background music generation skipped, client acoustic synthesizer will provide natural background music:",
          musicErr instanceof Error ? musicErr.message : musicErr
        );
      }
    }

    if (job.cancelled) return;
    job.videoUrl = videoUrl;
    job.videoMimeType = mimeType;
    job.outputDurationSeconds = finalDurationSeconds;
    job.status = "completed";
    job.stageLabel = "Motion video ready";
    job.progress = 100;
    job.estimatedSecondsRemaining = 0;
  } catch (err) {
    if (job.cancelled) return;
    const formatted = formatApiError(err);
    job.status = "failed";
    job.stageLabel = "Generation failed";
    job.error = formatted.message;
    job.errorCode = formatted.code;
  } finally {
    // Clean up temporary file and remote Files API object
    if (tempVideoPath) {
      await fs.unlink(tempVideoPath).catch(() => {});
    }
    if (ai && uploadedFileName) {
      await ai.files.delete({ name: uploadedFileName }).catch(() => {});
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "80mb" }));

  // Health & API Configuration Check
  app.get("/api/status", (_req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    const configured = Boolean(
      apiKey && apiKey !== "MY_GEMINI_API_KEY" && apiKey.trim() !== ""
    );
    res.json({
      configured,
      models: {
        motionTransfer: "gemini-omni-1.1-flash",
        imageGeneration: "gemini-nano-banana-2.1",
        promptExpansion: "gemini-3.8-flash",
        naturalMusic: "lyria-3-clip-preview",
      },
    });
  });

  // 1. Start Asynchronous Motion Control Generation Job
  app.post("/api/motion/start", async (req, res) => {
    try {
      const { characterImage, extraCharacterImages, drivingVideo, settings } =
        req.body || {};

      if (!characterImage?.data) {
        res.status(400).json({ error: "Please upload a character image." });
        return;
      }
      if (!drivingVideo?.data) {
        res.status(400).json({ error: "Please upload a motion reference video." });
        return;
      }

      // Ensure API key exists before creating job
      getGenAIClient();

      const jobId = `ms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const newJob: MotionJob = {
        id: jobId,
        status: "uploading",
        stageLabel: "Initializing motion transfer pipeline...",
        progress: 6,
        createdAt: Date.now(),
        estimatedSecondsRemaining: settings?.targetDuration === "15s" ? 80 : 45,
        cancelled: false,
      };

      jobs.set(jobId, newJob);

      // Run asynchronously in background
      runMotionTransferJob(jobId, {
        characterImage,
        extraCharacterImages,
        drivingVideo,
        settings: {
          aspectRatio: settings?.aspectRatio || "9:16",
          resolution: settings?.resolution || "1080p",
          targetDuration: settings?.targetDuration || "15s",
          characterOrientation: settings?.characterOrientation || "match_video",
          aspectRatioFit: settings?.aspectRatioFit || "crop",
          environmentMode: settings?.environmentMode || "keep_character",
          customEnvironment: settings?.customEnvironment || "",
          copyCameraMotion: Boolean(settings?.copyCameraMotion),
          musicStyle: settings?.musicStyle || "natural_acoustic",
          customMusicPrompt: settings?.customMusicPrompt || "",
        },
      });

      res.json({ jobId, status: newJob.status });
    } catch (err) {
      const formatted = formatApiError(err);
      res.status(500).json({ error: formatted.message, code: formatted.code });
    }
  });

  // 2. Poll Motion Control Job Status
  app.get("/api/motion/status/:jobId", (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: "Generation job not found or expired." });
      return;
    }
    res.json(job);
  });

  // 3. Cancel Motion Control Job
  app.post("/api/motion/cancel/:jobId", (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: "Job not found." });
      return;
    }
    job.cancelled = true;
    job.status = "cancelled";
    job.stageLabel = "Generation cancelled by user.";
    res.json({ status: "cancelled" });
  });

  async function generateImageWithFallback(
    ai: GoogleGenAI,
    parts: Array<Record<string, unknown>>,
    aspectRatio: string,
    imageSize: string = "1K"
  ): Promise<{ imageUrl: string; mimeType: string }> {
    let response;
    try {
      response = await ai.models.generateContent({
        model: "gemini-nano-banana-2.1",
        contents: { parts: parts as any },
        config: {
          imageConfig: {
            aspectRatio,
            imageSize,
          },
        },
      });
    } catch {
      response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-image",
        contents: { parts: parts as any },
        config: {
          imageConfig: {
            aspectRatio,
          },
        },
      });
    }

    let imageUrl: string | null = null;
    let mimeType = "image/png";
    const respParts = response.candidates?.[0]?.content?.parts || [];
    for (const part of respParts) {
      if (part.inlineData?.data) {
        mimeType = part.inlineData.mimeType || "image/png";
        imageUrl = `data:${mimeType};base64,${part.inlineData.data}`;
        break;
      }
    }

    if (!imageUrl) {
      throw new Error("No image was returned by the model.");
    }
    return { imageUrl, mimeType };
  }

  // 4. Character Lab: Generate Realistic AI Influencer Portrait
  app.post("/api/character/generate", async (req, res) => {
    try {
      const { gender, age, ethnicity, description } = req.body || {};
      if (!gender || !age || !ethnicity) {
        res.status(400).json({
          error: "Please complete Gender, Age, and Ethnicity before generating.",
        });
        return;
      }

      const ai = getGenAIClient();

      // Expand user inputs into a professional photography prompt using gemini-3.8-flash
      const expansionResponse = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: `Create a single detailed, photorealistic portrait photography prompt for an AI character with these attributes:
- Gender: ${gender}
- Age: ${age} years old
- Ethnicity: ${ethnicity}
- Additional appearance details: ${description || "Contemporary minimalist tailored wardrobe, natural poised expression"}

Requirements:
- Must specify realistic natural skin texture with visible pores, subtle natural imperfections, accurate facial bone structure, natural hair strands, and authentic eye catchlights.
- Shot on 85mm f/1.8 prime lens, soft directional studio key lighting, clean uncluttered background suitable for full-body or portrait character motion transfer.
- No plastic skin, no airbrushing, no text or watermarks.
Return ONLY the prompt text, nothing else.`,
      });

      const expandedPrompt =
        expansionResponse.text?.trim() ||
        `Photorealistic editorial portrait of a ${age}-year-old ${ethnicity} ${gender}, ${
          description || "wearing minimalist tailored attire"
        }, natural skin texture with pores, realistic hair strands, accurate facial features, soft 85mm studio key lighting, clean background.`;

      const { imageUrl, mimeType } = await generateImageWithFallback(
        ai,
        [
          {
            text: `${expandedPrompt}\nNegative constraints: no plastic skin, no airbrushed face, no text, no watermark, no extra limbs.`,
          },
        ],
        "3:4",
        "1K"
      );

      res.json({
        imageUrl,
        mimeType,
        expandedPrompt,
      });
    } catch (err) {
      const formatted = formatApiError(err);
      res.status(500).json({ error: formatted.message, code: formatted.code });
    }
  });

  // 5. Character Sheet: 16:9 Multi-View Reference Sheet from 1 Reference Image
  app.post("/api/character/sheet", async (req, res) => {
    try {
      const { referenceImage, notes } = req.body || {};
      if (!referenceImage?.data) {
        res.status(400).json({
          error: "Please upload a character reference image first.",
        });
        return;
      }

      const ai = getGenAIClient();

      const sheetPrompt = `Generate a single comprehensive 16:9 landscape character reference sheet based strictly on the person in this reference image.
Include all of the following panels arranged cleanly in one cohesive 16:9 composite sheet:
1. Full-body front view
2. Full-body side profile view
3. Full-body back view
4. Close-up portrait views
5. Detailed close-ups of eye, ear, hair texture, cheek, nose, and lips
6. Expression studies showing a natural smile and a natural laughing expression

Strict consistency rules:
- Preserve the exact person's facial identity, bone structure, skin tone, natural skin texture, hairstyle, hair color, clothing, accessories, footwear, and visual style across every panel.
- Maintain the same ambient environment and lighting palette as the reference image where possible.
- Output one unified high-resolution 16:9 reference sheet image with no text labels or watermarks.${
        notes ? `\nAdditional styling note: ${notes}` : ""
      }`;

      const { imageUrl, mimeType } = await generateImageWithFallback(
        ai,
        [
          {
            inlineData: {
              data: referenceImage.data,
              mimeType: referenceImage.mimeType || "image/png",
            },
          },
          {
            text: sheetPrompt,
          },
        ],
        "16:9",
        "2K"
      );

      res.json({ imageUrl, mimeType });
    } catch (err) {
      const formatted = formatApiError(err);
      res.status(500).json({ error: formatted.message, code: formatted.code });
    }
  });

  // 6. Stage Swap (Change Character Environment)
  app.post("/api/character/environment", async (req, res) => {
    try {
      const {
        characterImage,
        environmentImage,
        replaceExistingPerson,
        lightingNotes,
        aspectRatio,
      } = req.body || {};

      if (!characterImage?.data) {
        res.status(400).json({ error: "Please upload a character image." });
        return;
      }
      if (!environmentImage?.data) {
        res.status(400).json({ error: "Please upload an environment image." });
        return;
      }

      const ai = getGenAIClient();

      const prompt = `Composite the character from the FIRST image into the environment shown in the SECOND image.
Strict requirements:
1. Preserve the FIRST image character's exact facial identity, bone structure, skin tone, natural skin texture (no plastic smoothing), hairstyle, body proportions, and clothing.
2. Preserve the SECOND image's exact location, background architecture/scenery, camera angle, depth of field, and framing.
3. ${
        replaceExistingPerson
          ? "If there is an existing person in the second (environment) image, replace them with the character from the first image while adopting their natural pose and framing."
          : "Place the character naturally into the scene with grounded contact shadows and realistic perspective."
      }
4. Match the character's key light, rim light, color temperature, reflections, and cast shadows to the second image's environment.
5. Output one photorealistic image with natural skin texture and no text or watermark.${
        lightingNotes ? `\nAdditional note: ${lightingNotes}` : ""
      }`;

      const { imageUrl, mimeType } = await generateImageWithFallback(
        ai,
        [
          {
            inlineData: {
              data: characterImage.data,
              mimeType: characterImage.mimeType || "image/png",
            },
          },
          {
            inlineData: {
              data: environmentImage.data,
              mimeType: environmentImage.mimeType || "image/png",
            },
          },
          {
            text: prompt,
          },
        ],
        aspectRatio || "16:9",
        "1K"
      );

      res.json({ imageUrl, mimeType });
    } catch (err) {
      const formatted = formatApiError(err);
      res.status(500).json({ error: formatted.message, code: formatted.code });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Motion Studio server running on http://localhost:${PORT}`);
  });
}

startServer();
