import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import ConversationList from "@/components/ConversationList";
import DMChatArea from "@/components/DMChatArea";
import api from "@/lib/api";
import type { Conversation } from "@/types";

export default function DirectMessagesPage() {
  const { conversationId } = useParams();
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const selectionSeqRef = useRef(0);

  /** A deliberate selection always outranks anything the deep link resolves to. */
  const selectConversation = useCallback((conversation: Conversation | null) => {
    selectionSeqRef.current += 1;
    setActiveConversation(conversation);
  }, []);

  // The route declares `/dms/:conversationId`, but nothing read the segment —
  // so a deep link (or a shared link) opened an empty screen, and "Message" on
  // a profile navigated to /dms without ever selecting the thread it had just
  // created. The conversation is fetched here and the list keeps the same
  // selection state, so a later click still wins.
  useEffect(() => {
    if (!conversationId) return;
    const seq = selectionSeqRef.current;
    let cancelled = false;

    void (async () => {
      try {
        const { data } = await api.get("/dms");
        if (cancelled) return;
        // `cancelled` only covers unmount and a route change. A click made
        // while this request was in flight also has to win, or the view snaps
        // back to the deep-linked thread after the user picked another one.
        if (seq !== selectionSeqRef.current) return;
        const match = (data.conversations as Conversation[]).find(
          (c) => c.id === conversationId
        );
        if (match) setActiveConversation(match);
      } catch {
        // Silent: the list still renders and the user can pick manually.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  return (
    <div className="flex h-full">
      <ConversationList
        activeConversation={activeConversation}
        onSelectConversation={selectConversation}
      />
      <div className="relative flex-1">
        {activeConversation ? (
          <DMChatArea
            conversation={activeConversation}
            onConversationUpdated={setActiveConversation}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6">
            <div className="glass-card max-w-sm rounded-2xl px-10 py-12 text-center animate-fade-up">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-500/25 to-accent-700/10 text-3xl shadow-glow">
                💬
              </div>
              <p className="text-lg font-semibold tracking-tight text-gray-300">
                Select a conversation or start a new one
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
