// Remotion's settings for the film (ADR 0133). The CLI reads this file for
// `npm run studio` and `npm run render`.
import { Config } from '@remotion/cli/config';

// Frames as PNG (no JPEG step between the recording and the encoder: the TUI text stays sharp).
Config.setVideoImageFormat('png');
Config.setCodec('h264');
Config.setCrf(14);
Config.setPixelFormat('yuv420p');
Config.setColorSpace('bt709');
Config.setX264Preset('slow');
// The recordings are 3200×1800 H.264: a larger frame cache for OffthreadVideo.
Config.setOffthreadVideoCacheSizeInBytes(2 * 1024 ** 3);
Config.setOverwriteOutput(true);
