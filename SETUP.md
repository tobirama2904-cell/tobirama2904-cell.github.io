# LEGION v20 — hybrid setup (all free, unlimited, no card)

No servers. No accounts to create. `npm install && npm run dev` — everything works.

## How it works
| Feature | Rails |
|---|---|
| Accounts | Nostr keypairs, deterministic from email+password (PBKDF2) |
| Login options | Email+password, nsec key import, Telegram widget (optional) |
| Profiles/posts/likes/follows/stories | Nostr relays (multi-relay, kinds 0/1/3/6/7/10000) |
| DMs | NIP-04 encrypted kind-4 |
| Groups/channels | Kind-1 hashtag log + live Trystero P2P rooms |
| Public groups | NIP-29 relay groups directory |
| Calls | WebRTC P2P, Trystero signalling |
| Files/avatars/voice | catbox → uguu.se → Blossom → Telegram bot (optional) |
| Big files 25MB+ | WebTorrent in-browser (magnet links) |
| AI | Agnes direct from browser (~20 req/min guard built in) |
| Hosting | Static export → GitHub/Cloudflare Pages (unlimited traffic) |
| Admin/moderation | `public/banlist.json` (published via GitHub API from admin browser) |
| Notifications | Live Nostr subs + Telegram bot pings (optional) |

## Optional upgrades (2 minutes each)
1. **Telegram login**: create bot via @BotFather → `NEXT_PUBLIC_TG_BOT=name` → rebuild.
2. **Telegram storage/notify**: bot token + your chat id → `NEXT_PUBLIC_TG_BOT_TOKEN`, `NEXT_PUBLIC_TG_STORAGE_CHAT`.
3. **Global bans**: set `NEXT_PUBLIC_GH_REPO=owner/repo`, admin pastes a `contents:write` token in Admin panel once.
4. **Analytics**: Cloudflare Web Analytics snippet token → `NEXT_PUBLIC_CF_BEACON`.

## Deploy (static)
```
npm run build   # -> out/
```
Upload `out/` to GitHub Pages (`gh-pages` branch) or Cloudflare Pages (direct upload). No server, no env needed at runtime.
