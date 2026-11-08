// Remotion's settings for the film (ADR 0133). The CLI reads this file for
// `npm run studio` and `npm run render`.
//
// Remotion renders a master: ProRes 4444 (10-bit 4:4:4, visually
// lossless), so its own encode adds no blocks or chroma steps to the dark
// gradients. `record/render.ts` then makes the films to watch and upload
// from it (`record/master.ts`: 10-bit HEVC at 1080p and 4K, an 8-bit H.264).
import { Config } from '@remotion/cli/config';

// Frames as PNG (no JPEG step between the recording and the encoder).
Config.setVideoImageFormat('png');
Config.setCodec('prores');
Config.setProResProfile('4444');
Config.setPixelFormat('yuv444p10le');
Config.setColorSpace('bt709');
// The recordings are 1920×1080 lossless RGB H.264: a larger frame cache for OffthreadVideo.
Config.setOffthreadVideoCacheSizeInBytes(2 * 1024 ** 3);
Config.setOverwriteOutput(true);
