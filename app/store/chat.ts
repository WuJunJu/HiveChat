import { create } from 'zustand';
import { ChatType, Message } from '@/types/llm'; // Assuming Message type is here or adjust path
import { updateChatInServer } from '@/app/chat/actions/chat';
import { getBranchesForChat, getMessagesForBranch } from '@/app/chat/actions/message'; // Import new server actions

// Define the Branch type
export interface Branch {
  id: string;
  chatId: string;
  name: string | null;
  createdAt: Date | string; // Store as ISO string or Date object
  forkedFromMessageId: number | null;
  parentBranchId: string | null;
}

interface IChatStore {
  chat: ChatType | null;
  webSearchEnabled: boolean;
  historyType: 'all' | 'none' | 'count';
  historyCount: number;
  branches: Branch[];
  activeBranchId: string | null;
  currentMessages: Message[]; // Messages for the active branch
  setHistoryType: (chatId: string, newType: 'all' | 'none' | 'count') => void;
  setHistoryCount: (chatId: string, newCount: number) => void;
  setChat: (chat: ChatType) => void;
  setWebSearchEnabled: (flag: boolean) => void;
  initializeChat: (chatInfo: ChatType, userId: string) => Promise<void>; // Added userId
  loadBranches: (chatId: string, userId: string) => Promise<void>;
  setActiveBranch: (branchId: string, userId: string) => Promise<void>;
  addBranch: (branch: Branch) => void;
  addMessageToCurrentBranch: (message: Message) => void;
}

const useChatStore = create<IChatStore>((set, get) => ({
  chat: null,
  webSearchEnabled: false,
  historyType: 'count',
  historyCount: 5,
  branches: [],
  activeBranchId: null,
  currentMessages: [],
  setHistoryType: (chatId: string, newType: 'all' | 'none' | 'count') => {
    set((state) => {
      updateChatInServer(chatId, { historyType: newType });
      return { historyType: newType };
    });
  },
  setHistoryCount: (chatId: string, newCount: number) => {
    set((state) => {
      updateChatInServer(chatId, { historyCount: newCount });
      return { historyCount: newCount };
    });
  },

  setChat: (chat: ChatType) => {
    set({ chat: chat });
  },

  setWebSearchEnabled: (flag: boolean) => {
    set({ webSearchEnabled: flag });
  },

  initializeChat: async (chatInfo: ChatType, userId: string) => {
    set({
      chat: chatInfo,
      historyType: chatInfo.historyType || 'count',
      historyCount: chatInfo.historyCount || 5,
      branches: [], // Reset branches
      activeBranchId: null, // Reset active branch
      currentMessages: [], // Reset messages
    });
    await get().loadBranches(chatInfo.id, userId);
  },

  loadBranches: async (chatId: string, userId: string) => {
    try {
      const response = await getBranchesForChat(chatId, userId);
      if (response.status === 'success' && response.data) {
        const branches = response.data as Branch[];
        set({ branches });
        if (get().activeBranchId === null && branches.length > 0) {
          // Activate the most recent branch (assuming server returns them sorted, or sort here)
          // For now, let's pick the first one if any.
          // A more robust solution might involve identifying a "main" branch.
          await get().setActiveBranch(branches[0].id, userId);
        } else if (branches.length === 0) {
          // No branches on server, clear active branch and messages
          set({ activeBranchId: null, currentMessages: [] });
        }
      } else {
        console.error("Failed to load branches:", response.message);
        set({ branches: [], activeBranchId: null, currentMessages: [] });
      }
    } catch (error) {
      console.error("Error in loadBranches:", error);
      set({ branches: [], activeBranchId: null, currentMessages: [] });
    }
  },

  setActiveBranch: async (branchId: string, userId: string) => {
    set({ activeBranchId: branchId, currentMessages: [] }); // Set active branch, clear messages first
    try {
      const response = await getMessagesForBranch(branchId, userId);
      if (response.status === 'success' && response.data) {
        set({ currentMessages: response.data as Message[] });
      } else {
        console.error("Failed to load messages for branch:", response.message);
        set({ currentMessages: [] }); // Clear messages on error
      }
    } catch (error) {
      console.error("Error in setActiveBranch:", error);
      set({ currentMessages: [] }); // Clear messages on error
    }
  },

  addBranch: (branch: Branch) => {
    set((state) => ({
      branches: [...state.branches, branch],
    }));
  },

  addMessageToCurrentBranch: (message: Message) => {
    set((state) => ({
      currentMessages: [...state.currentMessages, message],
    }));
  },

}));

export default useChatStore;
