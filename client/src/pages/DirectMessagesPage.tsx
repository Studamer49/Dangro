import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import ConversationList from "@/components/ConversationList";
import DMChatArea from "@/components/DMChatArea";
import api from "@/lib/api";
import type { Conversation } from "@/types";

export default function DirectMessagesPage() {
  const { conversationId } = useParams();
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);

  // The route declares `/dms/:conversationId`, but nothing read the segment —
  // so a deep link (or a shared link) opened an empty screen, and "Message" on
  // a profile navigated to /dms without ever selecting the thread it had just
  // created. The conversation is fetched here and the list keeps the same
  // selection state, so a later click still wins.
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;

    void (async () => {
      try {
        const { data } = await api.get("/dms");
        if (cancelled) return;
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
        onSelectConversation={setActiveConversation}
      />
      <div className="flex-1">
        {activeConversation ? (
          <DMChatArea
            conversation={activeConversation}
            onConversationUpdated={setActiveConversation}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mb-4 text-6xl">💬</div>
              <p className="text-lg text-gray-400">Select a conversation or start a new one</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
