// LEGION hybrid rails: all-free, unlimited, no-card infrastructure map.
export const APP_ID = 'legion-app-v19';

// Nostr relays (social graph, posts, DMs). Multi-relay = no single point of failure.
export const RELAYS = [
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://nostr.land',
  'wss://nostr.mom',
  'wss://relay.snort.social',
  'wss://relay.nostr.band',
  'wss://relay.damus.io',
];
export const READ_RELAYS = RELAYS.slice(0, 5);
// NIP-29 relay-based group chats (public groups directory)
export const GROUP_RELAYS = ['wss://groups.fiatjaf.com', 'wss://relay.0xchat.com'];
// WebSocket trackers for in-browser torrents (big files, serverless)
export const WS_TRACKERS = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.webtorrent.dev',
];
// Free zero-key file hosts (cascade) — avatars, media, voice messages
export const UPLOAD_HOSTS = { catbox: 'https://catbox.moe/user/api.php', uguu: 'https://uguu.se/upload.php' };
export const BLOSSOM_SERVERS = ['https://blossom.band', 'https://nostr.download', 'https://blossom.primal.net'];

// Nostr tags used by LEGION
export const T_POST = 'legion';
export const T_STORY = 'legion-story';
export const T_ANN = 'legion-announce';
export const T_BOT = 'legion-bot';
export const T_EVENT = 'legion-event';
export const T_PIN = 'legion-pin';
export const T_VIEW = 'legion-view';
export const T_ADMINS = 'legion-admins';
export const T_VOICE = 'legion-voice';
export const grpTag = (id: string) => 'legion-grp-' + id.replace(/^(grp:|nip29:)/, '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);

// Admin accounts (email allowlist; bound to claimed pubkeys via banlist.json)
export const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'tobirama2904@gmail.com')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
// Optional: Telegram login widget bot + bot token features (storage/notify). Empty = hidden/off.
// Runtime overrides (admin pastes once in Admin -> Telegram, stored on-device):
function ls(k: string): string { try { return localStorage.getItem(k) || ''; } catch { return ''; } }
export const TG_BOT = process.env.NEXT_PUBLIC_TG_BOT || '';
export const TG_BOT_TOKEN = process.env.NEXT_PUBLIC_TG_BOT_TOKEN || '';
export const TG_STORAGE_CHAT = process.env.NEXT_PUBLIC_TG_STORAGE_CHAT || '';
export function tgBot(): string { return TG_BOT || ls('legion-tg-bot'); }
export function tgToken(): string { return TG_BOT_TOKEN || ls('legion-tg-token'); }
export function tgChat(): string { return TG_STORAGE_CHAT || ls('legion-tg-chat'); }
// Agnes AI direct from browser
export const AGNES_BASE = process.env.NEXT_PUBLIC_AGNES_BASE || 'https://apihub.agnes-ai.com/v1';
export const AGNES_KEY_BUILD = process.env.NEXT_PUBLIC_AGNES_KEY || '';
// GitHub repo for banlist publishing (owner/repo), used by admin panel with admin's own token
export const GH_REPO = process.env.NEXT_PUBLIC_GH_REPO || '';
// Cloudflare Web Analytics beacon token (optional)
export const CF_BEACON = process.env.NEXT_PUBLIC_CF_BEACON || '';
