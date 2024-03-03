import path from "path";
import fs from "fs-extra";
import crypto from "crypto";
import child_process from "child_process";
import { Buffer } from "node:buffer";

import detectScene from "./lib/detect-scene.js";

const { VIDEO_PATH = "/mnt/", TRACE_MEDIA_SALT, MAX_QUEUE } = process.env;

const generateVideoPreview = async (filePath, start, end, size = "m", mute = false) =>
  new Promise((resolve) => {
    const ffmpeg = child_process.spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostats",
        "-y",
        "-ss",
        start - 10,
        "-i",
        filePath,
        "-ss",
        "10",
        "-t",
        end - start,
        mute ? "-an" : "-y",
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-vf",
        `scale=${{ l: 640, m: 320, s: 160 }[size]}:-2`,
        "-c:v",
        "libx264",
        "-crf",
        "23",
        "-profile:v",
        "high",
        "-preset",
        "faster",
        "-r",
        "24000/1001",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-max_muxing_queue_size",
        "1024",
        "-movflags",
        "empty_moov",
        "-map_metadata",
        "-1",
        "-map_chapters",
        "-1",
        "-f",
        "mp4",
        "-",
      ],
      { maxBuffer: 1024 * 1024 * 100 },
    );
    ffmpeg.stderr.on("data", (data) => {
      console.log(data.toString());
    });
    let chunks = Buffer.alloc(0);
    ffmpeg.stdout.on("data", (data) => {
      chunks = Buffer.concat([chunks, data]);
    });
    ffmpeg.on("close", () => {
      resolve(chunks);
    });
  });

export default async (req, res) => {
  if (
    TRACE_MEDIA_SALT &&
    req.query.token !==
      crypto
        .createHash("sha1")
        .update(
          [
            req.params.anilistID,
            req.params.filename,
            req.query.t,
            req.query.now,
            TRACE_MEDIA_SALT,
          ].join(""),
        )
        .digest("base64")
        .replace(/[^0-9A-Za-z]/g, "")
  ) {
    return res.status(403).send("Forbidden");
  }
  if (((Date.now() / 1000) | 0) - Number(req.query.now) > 300) return res.status(410).send("Gone");
  const t = parseFloat(req.query.t);
  if (isNaN(t) || t < 0) {
    return res.status(400).send("Bad Request. Invalid param: t");
  }
  const videoFilePath = path.join(VIDEO_PATH, req.params.anilistID, req.params.filename);
  if (!videoFilePath.startsWith(VIDEO_PATH)) {
    return res.status(403).send("Forbidden");
  }
  if (!(await fs.exists(videoFilePath))) {
    return res.status(404).send("Not found");
  }
  const size = req.query.size || "m";
  if (!["l", "m", "s"].includes(size)) {
    return res.status(400).send("Bad Request. Invalid param: size");
  }
  const minDuration = Number(req.query.minDuration) || 0.25;
  if (req.app.locals.queue > MAX_QUEUE) return res.status(503).send("Service Unavailable");
  req.app.locals.queue++;
  try {
    const scene = await detectScene(videoFilePath, t, minDuration > 2 ? 2 : minDuration);
    if (scene === null) {
      return res.status(500).send("Internal Server Error");
    }
    const video = await generateVideoPreview(
      videoFilePath,
      scene.start,
      scene.end,
      size,
      "mute" in req.query,
    );
    res.set("Content-Type", "video/mp4");
    res.set("x-video-start", scene.start);
    res.set("x-video-end", scene.end);
    res.set("x-video-duration", scene.duration);
    res.set("Access-Control-Expose-Headers", "x-video-start, x-video-end, x-video-duration");
    res.send(video);
  } catch (e) {
    console.log(e);
    res.status(500).send("Internal Server Error");
  }
  req.app.locals.queue--;
};
