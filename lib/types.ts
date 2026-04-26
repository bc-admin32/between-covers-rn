// Shared types for live events.
// Multi-room IRIS_LIVE scaffolding — the LobbyModal/RoomScreen contracts
// these describe land in a follow-up commit once the backend brief deploys
// rooms[] / roomStates / room-join endpoints / iris:pinned WebSocket events.
// LiveEvent itself stays defined inline in app/live/event/index.tsx and
// app/(tabs)/home/index.tsx; both extend their local copies with `rooms?`.

export type LiveRoom = {
  roomId: string;
  name: string;
  gameType: string | null; // null for chat-only Just Vibing rooms
  description: string;
  attendeeCount: number;
  gameBanner: { label: string; instruction: string } | null;
};

export type SketchTheSceneQuestion = {
  questionId: string;
  videoUrl: string; // S3 URL to drawing video
  answer: string; // what's being drawn
  artistName: string; // fake name displayed as "Now drawing: X"
  hint?: string;
  improvise?: boolean;
};

export type RoomState = {
  activeGameType: string | null;
  currentRound: number;
  currentQuestion: any | SketchTheSceneQuestion | null;
  irisMode: 'intro' | 'game' | 'justVibing' | 'encore' | 'windingDown' | 'signOff';
  startedAt: string | null;
  introComplete?: boolean;
  gameBanner?: { label: string; instruction: string } | null;
};

export type RoomJoinResponse = {
  token: string;
  sessionExpirationTime?: string;
  tokenExpirationTime?: string;
  attendanceSk: string;
  isPreEvent: boolean;
  room: {
    roomId: string;
    name: string;
    gameType: string | null;
    description: string;
  };
};

// Multi-room shape used by LobbyModal + RoomScreen via /live/{eventId}.
// Inline LiveEvent definitions remain in app/live/event/index.tsx and
// app/(tabs)/home/index.tsx (each with the subset of fields it actually
// uses); this is the canonical shape for the multi-room consumers.
export type LiveEvent = {
  eventId: string;
  title: string;
  description: string | null;
  eventType: 'AUTHOR_EVENT' | 'DANCE_PARTY' | 'IRIS_LIVE';
  liveType?: 'gameNight' | 'giveaway' | 'justVibing';
  hostName: string;
  coverUrl: string | null;
  scheduledAt: string;
  endsAt: string;
  status: 'SCHEDULED' | 'ACTIVE' | 'ENDED';
  rsvpCount: number;
  bookTitle?: string | null;
  closingMessage?: string | null;
  ratingsEnabled?: boolean;
  ratingPrompt?: { show: boolean };
  rooms?: LiveRoom[];
  roomStates?: Record<string, RoomState | null>;
};
