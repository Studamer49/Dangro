import { useState } from "react";
import ConversationList from "@/components/ConversationList";
import DMChatArea from "@/components/DMChatArea";
import type { Conversation } from "@/types";

export default function DirectMessagesPage() {
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);

  return (
    <div className="flex h-full">
      <ConversationList
        activeConversation={activeConversation}
        onSelectConversation={setActiveConversation}
      />
      <div className="flex-1">
        {activeConversation ? (
          <DMChatArea conversation={activeConversation} />
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
