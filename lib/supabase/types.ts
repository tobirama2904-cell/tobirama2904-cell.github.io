export type Role = 'user' | 'moderator' | 'admin';
export interface Profile { id: string; email: string; name: string; avatar_url: string | null; cover_url: string | null; bio: string; status: string; role: Role; verified: boolean; is_private: boolean; last_seen: string; created_at: string; }
export interface Post { id: string; author_id: string; text: string; image_url: string | null; video_url?: string | null; kindTag?: string | null; likes: number; comments: number; reposts: number; created_at: string; author?: Profile; liked?: boolean; reposted?: boolean; }
export interface Comment { id: string; post_id: string; author_id: string; text: string; created_at: string; author?: Profile; }
export interface Story { id: string; author_id: string; image_url: string | null; text: string; created_at: string; expires_at: string; author?: Profile; }
export interface Follow { follower_id: string; followee_id: string; created_at: string; }
export interface Conversation { id: string; kind: 'dm' | 'group' | 'channel'; title: string; avatar_url: string | null; owner_id: string | null; created_at: string; last_msg?: string; last_at?: string; unread?: number; }
export interface Message { id: string; convo_id: string; sender_id: string; kind: 'text' | 'image' | 'video' | 'file' | 'voice' | 'system' | 'ai' | 'poll'; text: string; media_url: string | null; reply_to: string | null; disappear_at: string | null; instant?: boolean; pinned?: boolean; round?: boolean; created_at: string; sender?: Profile; reactions?: Record<string, string[]>; }
export interface Notification { id: string; user_id: string; kind: string; title: string; body: string; link: string | null; read: boolean; created_at: string; }
export interface Bot { id: string; owner_id: string; name: string; avatar_url: string | null; persona: string; system: string; is_public: boolean; uses: number; created_at: string; owner?: Profile; }
export interface Report { id: string; reporter_id: string; target_kind: string; target_id: string; reason: string; status: 'open' | 'done' | 'rejected'; created_at: string; }
export interface Activity { id: string; user_id: string | null; kind: string; detail: string; created_at: string; user?: Profile; }
export interface Announcement { id: string; title: string; body: string; created_at: string; }
export interface AiMemory { id: string; user_id: string; kind: 'fact' | 'pref' | 'project' | 'episode'; key: string; value: string; created_at: string; }
