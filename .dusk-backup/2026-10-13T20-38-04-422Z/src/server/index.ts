import fs from "node:fs";
import path from "node:path";
import express, { type ErrorRequestHandler } from "express";
import multer from "multer";
import { config, discordConfigured } from "./config";
import { db } from "./db";
import { ensureBucket, remoteEnabled } from "./storage";
import { HttpError } from "./http";
import { adminRouter } from "./routes/admin";
import { authRouter } from "./routes/auth";
import { profileRouter } from "./routes/profile";
import { mediaRouter, publicRouter } from "./routes/public";
import { tracksRouter } from "./routes/tracks";
import { attachUser, csrfGuard } from "./session";

const app = express();
app.disable("x-powered-by");
if (config.trustProxy) app.set("trust proxy", 1);

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});
app.use(express.json({ limit: "200kb" }));
app.use(attachUser);

app.use("/auth", authRouter);
app.use("/media", mediaRouter);
app.use("/api/admin", adminRouter);
app.use("/api", csrfGuard, publicRouter, profileRouter);
app.use("/api/tracks", csrfGuard, tracksRouter);
app.use("/api", (_req, res) => { res.status(404).json({ error: "Not found." }); });

/* The built web app. During development Vite serves it instead and proxies /api, /auth and /media here. */
if (fs.existsSync(path.join(config.webDir, "index.html"))) {
  app.use(express.static(config.webDir, { index: false, maxAge: "1h" }));
  app.get("*", (_req, res) => { res.sendFile(path.join(config.webDir, "index.html")); });
}

const onError: ErrorRequestHandler = (err, req, res, _next) => {
  let status = 500;
  let message = "Something went wrong on our side. Try again.";
  if (err instanceof HttpError) { status = err.status; message = err.message; }
  else if (err instanceof multer.MulterError) {
    status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    message = err.code === "LIMIT_FILE_SIZE" ? "That file is too large." : "The upload didn't work. Try again.";
  } else console.error(err);
  if (req.path.startsWith("/api")) res.status(status).json({ error: message });
  else res.status(status).type("text").send(message);
};
app.use(onError);

if (remoteEnabled) {
  await db.init();
  await ensureBucket();
  console.log("Using Supabase for the database and uploaded files.");
}

app.listen(config.port, () => {
  console.log(`Dusk server listening on http://localhost:${config.port}`);
  if (!discordConfigured) console.log("Discord login is not configured yet. Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET (see .env.example).");
  if (config.devLogin) console.log("DEV_LOGIN is on: /auth/dev?as=name logs in a test account.");
});
