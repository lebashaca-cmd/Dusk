import type { MeResponse, RenderModel, Track } from "../shared/types";
import { guildConfigured } from "./config";
import type { TrackRecord, UserRecord } from "./db";
import { db } from "./db";
import { discordAvatarUrl } from "./services/discord";

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
      discordAvatarUrl: discordAvatarUrl(u.id, u.discordAvatar),
    },
    profile: u.profile,
    tracks: db.tracksOf(u.id).map(toTrack),
    avatarUrl: customAvatarUrl(u),
    views: u.views,
    roles: u.roles,
    guildEnabled: guildConfigured,
  };
}

/** What a stranger is allowed to see. The Discord ID is only included if the owner turned on live status. */
export function toPublic(u: UserRecord): RenderModel {
  return {
    username: u.username,
    profile: u.profile,
    avatarUrl: customAvatarUrl(u),
    discordAvatarUrl: discordAvatarUrl(u.id, u.discordAvatar),
    discordId: u.profile.discord.enabled ? u.id : null,
    tracks: u.profile.music.enabled ? db.tracksOf(u.id).map(toTrack) : [],
    views: u.views,
    roles: u.roles.filter(r => !u.profile.hiddenRoles.includes(r.id)),
  };
}
