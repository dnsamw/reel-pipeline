import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";

function hashFor(text: string, voice: string): string {
  return createHash("sha256").update(`${voice}:${text}`).digest("hex").slice(0, 16);
}

/**
 * Synthesizes `text` with Azure Speech and saves it under `ttsDir`, named by
 * a hash of (voice, text) - reruns of the same phrase/voice pair hit the
 * cache and never call the API again, since this is Node-only and only
 * called from renderBatch.ts, never from the bundled Reel composition.
 * ttsDir is expected to be under assets/ so the same file doubles as the
 * one Remotion serves via staticFile().
 */
export async function synthesizeSpeech(text: string, voice: string, ttsDir: string): Promise<string> {
  mkdirSync(ttsDir, { recursive: true });
  const filename = `${hashFor(text, voice)}.mp3`;
  const outputPath = join(ttsDir, filename);

  if (existsSync(outputPath)) return filename;

  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    throw new Error("AZURE_SPEECH_KEY / AZURE_SPEECH_REGION must be set in .env when config.ttsEnabled is true.");
  }

  const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechSynthesisVoiceName = voice;
  speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz96KBitRateMonoMp3;
  const audioConfig = sdk.AudioConfig.fromAudioFileOutput(outputPath);
  const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

  await new Promise<void>((resolve, reject) => {
    synthesizer.speakTextAsync(
      text,
      (result) => {
        synthesizer.close();
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          resolve();
        } else {
          reject(new Error(`TTS failed for voice "${voice}" on "${text}": ${result.errorDetails}`));
        }
      },
      (err) => {
        synthesizer.close();
        reject(new Error(`TTS error for voice "${voice}" on "${text}": ${err}`));
      },
    );
  });

  return filename;
}
