import { defaultProfile, THEMES } from "../../shared/constants";
import type { RenderModel } from "../../shared/types";

/**
 * A made-up page, used on the front page so the site shows what a page looks like
 * before anyone has logged in. Nothing here is read from the server.
 */
export function demoModel(): RenderModel {
  const profile = defaultProfile("nova");
  profile.name = "Nova Rei";
  profile.bio = "Sound designer in Lisbon.\nMaking small noises on purpose.";
  profile.location = "Lisbon, PT";
  profile.typewriter = false;
  profile.theme = "dusk";
  profile.colors = { ...THEMES.dusk.colors };
  profile.bgType = "aurora";
  profile.bgSpeed = 0.7;
  profile.avatar = { kind: "emoji", emoji: "🌙", shape: "circle", ring: true, ringWidth: 4, size: 104 };
  profile.card = { style: "glass", radius: 30, blur: 26, width: 420, align: "center", border: true, borderColor: "text", shadow: 60 };
  profile.nameSize = 38;
  profile.nameGradient = true;
  profile.effects = { tilt: true, cursorGlow: true, entrance: "rise" };
  profile.links = [
    { id: "demo1", label: "Bandcamp", url: "https://bandcamp.com", note: "New EP out now", icon: "music" },
    { id: "demo2", label: "Instagram", url: "https://instagram.com", note: "Daylight shots", icon: "instagram" },
    { id: "demo3", label: "Letterboxd", url: "https://letterboxd.com", note: "Film notes", icon: "globe" },
  ];
  profile.music = { ...profile.music, enabled: false };
  profile.discord = { ...profile.discord, enabled: false };
  profile.page = { views: true, share: true, enter: false, enterText: "" };
  return {
    username: "nova",
    profile,
    avatarUrl: null,
    discordAvatarUrl: null,
    discordId: null,
    tracks: [],
    views: 1284,
    roles: [],
  };
}
