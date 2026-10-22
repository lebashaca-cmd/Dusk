import type { MeResponse, RenderModel, Track } from "../shared/types";
import { guildConfigured, multiPage } from "./config";
import type { TrackRecord, UserRecord } from "./db";
import { db, ownerOf } from "./db";
import { limitProfile } from "../shared/constants";
import { canHaveManyPages, isVip } from "./pages";
import { discordAvatarUrl } from "./services/discord";
import { providerInfo } from "./services/lyrics";
import { filePresent } from "./storage";

export function toTrack(t: TrackRecord): Track {
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    album: t.album,
    duration: t.duration,
    audioUrl: `/media/track/${t.id}/audio`,
    coverUrl: t.coverFile ? `/media/track/${t.id}/cover?v=${t.updatedAt}` : null,
    coverSource: t.coverSource,
    lyrics: t.lyrics,
    available: filePresent(t.userId, t.audioFile),
  };
}

export function customAvatarUrl(u: UserRecord): string | null {
  return u.avatarFile ? `/media/avatar/${u.id}?v=${u.avatarVersion}` : null;
}

export function toMe(u: UserRecord): MeResponse {
  return {
    user: {
      id: u.id,
      username: u.username,
      discordName: u.discordName,
      discordAvatarUrl: discordAvatarUrl(ownerOf(u), u.discordAvatar),
    },
    ownerId: ownerOf(u),
    pages: db.pagesOf(ownerOf(u)).map(p => ({ id: p.id, username: p.username, active: p.id === u.id })),
    canMultiPage: canHaveManyPages(u),
    maxPages: multiPage.max,
    profile: limitProfile(u.profile, isVip(u)),
    tracks: db.tracksOf(u.id).map(toTrack),
    avatarUrl: customAvatarUrl(u),
    views: u.views,
    roles: u.roles,
    guildEnabled: guildConfigured,
    vip: isVip(u),
    lyricsProviders: providerInfo(),
  };
}

/** What a stranger is allowed to see. The Discord ID is only included if the owner turned on live status. */
export function toPublic(u: UserRecord): RenderModel {
  return {
    username: u.username,
    profile: limitProfile(u.profile, isVip(u)),
    avatarUrl: customAvatarUrl(u),
    discordAvatarUrl: discordAvatarUrl(ownerOf(u), u.discordAvatar),
    discordId: u.profile.discord.enabled ? ownerOf(u) : null,
    tracks: u.profile.music.enabled ? db.tracksOf(u.id).map(toTrack) : [],
    views: u.views,
    roles: u.roles.filter(r => !u.profile.hiddenRoles.includes(r.id)),
  };
}
