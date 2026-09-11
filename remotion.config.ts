import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// staticFile() resolves against this dir - fonts/music/sfx all live under
// assets/ rather than the Remotion-conventional "public/", so point it there.
Config.setPublicDir("assets");
Config.setPublicLicenseKey('free-license');
