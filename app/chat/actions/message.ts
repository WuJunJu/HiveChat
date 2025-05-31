'use server';
import { db } from '@/app/db';
import { auth } from "@/auth";
import { MCPToolResponse, MessageContent } from '@/types/llm';
import { eq, and, asc, desc } from 'drizzle-orm';
import { messages, branches, chats } from '@/app/db/schema';
import { searchResultType, WebSearchResponse } from '@/types/search';
import type { Message } from '@/types/message'; // Assuming Message type is defined here

export const clearMessageInServer = async (chatId: string) => {
  const session = await auth();
  if (!session?.user.id) {
    return {
      status: 'success',
      data: []
    }
  }

  const result = await db.delete(messages)
    .where(
      and(
        eq(messages.chatId, chatId),
        eq(messages.userId, session.user.id)
      ));
  return {
    status: 'success',
  }
}
export const deleteMessageInServer = async (messageId: number) => {
  const session = await auth();
  if (!session?.user.id) {
    return {
      status: 'success',
      data: []
    }
  }

  const result = await db.delete(messages)
    .where(
      and(
        eq(messages.id, messageId),
        eq(messages.userId, session.user.id)
      ));
  return {
    status: 'success',
  }
}

export const getMessagesInServer = async (chatId: string) => {
  const session = await auth();
  if (!session?.user.id) {
    return {
      status: 'success',
      data: []
    }
  }
  const result = await db.select()
    .from(messages)
    .where(
      and(
        eq(messages.chatId, chatId),
        eq(messages.userId, session.user.id),
      ))
    .orderBy(asc(messages.createdAt));
  return {
    status: 'success',
    data: result
  }
}

export const addMessageInServer = async (message: {
  chatId: string,
  role: string,
  content: MessageContent,
  branchId?: string | null, // Added branchId
  reasoninContent?: string,
  searchEnabled?: boolean,
  searchStatus?: searchResultType,
  mcpTools?: MCPToolResponse[],
  providerId: string,
  model: string,
  type: 'text' | 'image' | 'error' | 'break',
  inputTokens?: number | null,
  outputTokens?: number | null,
  totalTokens?: number | null,
  errorType?: string,
  errorMessage?: string,
}) => {
  const session = await auth();
  if (!session?.user.id) {
    return {
      status: 'fail',
      message: 'please login first.'
    }
  }
  const [result] = await db.insert(messages)
    .values({ userId: session.user.id, ...message })
    .returning();
  return result.id;
}

export const updateMessageWebSearchInServer = async (
  messageId: number,
  searchEnabled: boolean,
  searchStatus: "none" | "searching" | "error" | "done",
  webSearch?: WebSearchResponse,
) => {
  const session = await auth();
  if (!session?.user.id) {
    return {
      status: 'fail',
      message: 'please login first.'
    }
  }

  try {
    await db.update(messages)
      .set({
        searchEnabled: searchEnabled,
        searchStatus: searchStatus,
        webSearch: webSearch,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(messages.id, messageId),
          eq(messages.userId, session.user.id)
        ));

    return {
      status: 'success',
      message: '搜索信息已保存'
    };
  } catch (error) {
    console.error('同步搜索响应失败:', error);
    return {
      status: 'fail',
      message: '同步搜索失败'
    };
  }
}

export const createBranchAndAddMessage = async (
  chatId: string,
  userId: string,
  forkedFromMessageId: number | null,
  parentBranchId: string | null,
  editedContent: MessageContent,
  historyMessages: Message[] // Assuming Message type includes role, content, model, providerId, etc.
) => {
  const session = await auth();
  if (!session?.user.id || session.user.id !== userId) {
    return {
      status: 'fail',
      message: 'Unauthorized or user ID mismatch.'
    };
  }

  const newBranchName = `Branch created at ${new Date().toISOString()}`;

  // Create the new branch
  const [newBranch] = await db.insert(branches)
    .values({
      chatId,
      name: newBranchName,
      forkedFromMessageId,
      parentBranchId,
      // createdAt will be set by default
    })
    .returning();

  if (!newBranch) {
    return {
      status: 'fail',
      message: 'Failed to create new branch.'
    };
  }

  // Copy history messages to the new branch
  const copiedMessagesData = historyMessages.map(msg => ({
    ...msg, // Spread existing message properties (role, content, model, providerId, etc.)
    id: undefined, // Ensure new ID is generated
    chatId,
    userId,
    branchId: newBranch.id,
    createdAt: new Date(), // Or use original createdAt if preferred
    updatedAt: new Date(),
  }));

  if (copiedMessagesData.length > 0) {
    await db.insert(messages).values(copiedMessagesData);
  }

  // Create the new message for the edited content
  const [newUserMessage] = await db.insert(messages)
    .values({
      chatId,
      userId,
      role: 'user', // Assuming editedContent is from the user
      content: editedContent,
      branchId: newBranch.id,
      // Fill other necessary fields like model, providerId based on context or defaults
      // For simplicity, some fields are omitted here, ensure your Message type and table schema align
      providerId: historyMessages[0]?.providerId || 'default', // Example: take from history or set a default
      model: historyMessages[0]?.model || 'default-model', // Example
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return {
    status: 'success',
    data: {
      branch: newBranch,
      message: newUserMessage,
    }
  };
};

export const getBranchesForChat = async (chatId: string, userId: string) => {
  const session = await auth();
  if (!session?.user.id || session.user.id !== userId) {
    return {
      status: 'fail',
      message: 'Unauthorized or user ID mismatch.',
      data: []
    };
  }

  const result = await db.select()
    .from(branches)
    .where(
      and(
        eq(branches.chatId, chatId)
        // We might not need to filter by userId directly on branches if chatId is already user-specific
        // or if branches are considered viewable by anyone with access to the chat.
        // If branches are user-specific, add: eq(branches.userId, userId) - requires adding userId to branches table
      ))
    .orderBy(desc(branches.createdAt)); // Show newest branches first

  return {
    status: 'success',
    data: result
  };
};

export const getMessagesForBranch = async (branchId: string, userId: string) => {
  const session = await auth();
  if (!session?.user.id || session.user.id !== userId) {
    return {
      status: 'fail',
      message: 'Unauthorized or user ID mismatch.',
      data: []
    };
  }

  // Optional: Verify the user has access to this branch through the chat
  const branchAccess = await db.select({ chatId: branches.chatId })
    .from(branches)
    .where(eq(branches.id, branchId))
    .leftJoin(chats, eq(chats.id, branches.chatId))
    .where(eq(chats.userId, userId)) // Assuming chats table has userId
    .limit(1);

  if (branchAccess.length === 0) {
    return {
      status: 'fail',
      message: 'Branch not found or access denied.',
      data: []
    };
  }

  const result = await db.select()
    .from(messages)
    .where(
      and(
        eq(messages.branchId, branchId),
        eq(messages.userId, userId) // Ensure user owns the messages
      ))
    .orderBy(asc(messages.createdAt));

  return {
    status: 'success',
    data: result
  };
};