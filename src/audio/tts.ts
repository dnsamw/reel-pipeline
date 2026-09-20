import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";

// `rate` is only folded into the cache key when it's non-default so every
// clip already cached under the old (voice, text)-only hash stays a hit at
// rate=1 - otherwise turning this feature on would silently invalidate every
// previously-synthesized file and re-pay for all of them on the next render.
function hashFor(text: string, voice: string, rate: number): string {
  const key = rate === 1 ? `${voice}:${text}` : `${voice}:${text}:rate=${rate}`;
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

function escapeSsml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/**
 * Synthesizes `text` with Azure Speech and saves it under `ttsDir`, named by
 * a hash of (voice, text, rate) - reruns of the same phrase/voice/rate
 * combination hit the cache and never call the API again, since this is
 * Node-only and only called from renderBatch.ts, never from the bundled Reel
 * composition. ttsDir is expected to be under assets/ so the same file
 * doubles as the one Remotion serves via staticFile().
 *
 * `rate` is a multiplier (1 = normal speed, matching config.ttsRate) - at
 * the default it's sent as plain text exactly as before; any other value is
 * sent as SSML with a <prosody rate="+N%"> wrapper, since Azure's plain
 * speakTextAsync has no speed control.
 */
export async function synthesizeSpeech(text: string, voice: string, ttsDir: string, rate = 1): Promise<string> {
  mkdirSync(ttsDir, { recursive: true });
  const filename = `${hashFor(text, voice, rate)}.mp3`;
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
    const onResult = (result: sdk.SpeechSynthesisResult) => {
      synthesizer.close();
      if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
        resolve();
      } else {
        reject(new Error(`TTS failed for voice "${voice}" on "${text}": ${result.errorDetails}`));
      }
    };
    const onError = (err: string) => {
      synthesizer.close();
      reject(new Error(`TTS error for voice "${voice}" on "${text}": ${err}`));
    };

    if (rate === 1) {
      synthesizer.speakTextAsync(text, onResult, onError);
    } else {
      const lang = voice.split("-").slice(0, 2).join("-");
      const ratePercent = `${rate >= 1 ? "+" : ""}${Math.round((rate - 1) * 100)}%`;
      const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${voice}"><prosody rate="${ratePercent}">${escapeSsml(text)}</prosody></voice></speak>`;
      synthesizer.speakSsmlAsync(ssml, onResult, onError);
    }
  });

  return filename;
}
