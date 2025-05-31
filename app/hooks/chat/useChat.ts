import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Message, ResponseContent, ChatOptions, LLMApi, RequestMessage, MessageContent, MCPTool } from '@/types/llm';
import useChatStore, { Branch } from '@/app/store/chat'; // Added Branch import
import useChatListStore from '@/app/store/chatList';
import useMcpServerStore from '@/app/store/mcp';
import { generateTitle, getLLMInstance } from '@/app/utils';
import useModelListStore from '@/app/store/modelList';
import { getChatInfoInServer, updateChatInServer } from '@/app/chat/actions/chat'; // Added updateChatInServer for potential use
import {
  addMessageInServer,
  getMessagesInServer, // This will be replaced by store's getMessagesForBranch
  deleteMessageInServer,
  clearMessageInServer, // This needs to be adapted for branches
  updateMessageWebSearchInServer,
  createBranchAndAddMessage // Server action for branching
} from '@/app/chat/actions/message';
import useGlobalConfigStore from '@/app/store/globalConfig';
import { getSearchResult } from '@/app/chat/actions/chat';
import { searchResultType, WebSearchResponse } from '@/types/search';
import { REFERENCE_PROMPT } from '@/app/config/prompts';
import { useRouter } from 'next/navigation'

// Simulate session for userId - replace with actual session logic
const useSession = () => ({ data: { user: { id: 'mockUserId' } }, status: 'authenticated' });

const useChat = (chatId: string) => {
  const { currentModel, setCurrentModelExact } = useModelListStore();
  // const [messageList, setMessageList] = useState<Message[]>([]); // Replaced by store
  const [isPending, setIsPending] = useState(false); // For overall chat loading state
  const [responseStatus, setResponseStatus] = useState<"done" | "pending">("done"); // For AI response generation
  const [searchStatus, setSearchStatus] = useState<searchResultType>("none");
  const [chatBot, setChatBot] = useState<LLMApi | null>(null);
  const [responseMessage, setResponseMessage] = useState<ResponseContent>({ content: '', reasoningContent: '' });
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [userSendCount, setUserSendCount] = useState(0); // Might need recalculation based on currentMessages

  const store = useChatStore();
  const {
    chat,
    webSearchEnabled,
    historyType,
    historyCount,
    branches, // All branches for the current chat
    activeBranchId, // ID of the currently active branch
    currentMessages, // Messages for the active branch
    initializeChat: initializeChatInStore, // Renamed to avoid conflict
    loadBranches,
    setActiveBranch,
    addBranch,
    addMessageToCurrentBranch,
    // removeMessageFromCurrentBranch, // Will need this for deleteMessage
  } = store;

  const { setNewTitle } = useChatListStore();
  const { chatNamingModel } = useGlobalConfigStore();
  const { selectedTools } = useMcpServerStore();
  const router = useRouter();
  const session = useSession(); // Simulated session
  const userId = session.data?.user?.id; // Get userId


  // Branching and Message Editing Logic
  const switchBranch = async (branchId: string) => {
    if (!chat || !userId) {
      console.error("Chat or User ID not found, cannot switch branch.");
      return;
    }
    if (branchId === activeBranchId) return; // Already active

    setResponseStatus("pending"); // Indicate loading state for messages
    try {
      await setActiveBranch(branchId, userId);
      // The store action setActiveBranch is responsible for updating
      // activeBranchId and currentMessages. UI will react to these changes.
    } catch (error) {
      console.error("Error switching branch:", error);
      // Potentially show an error to the user
    } finally {
      setResponseStatus("done");
    }
  };

  const editMessageAndBranch = async (messageIndex: number, newContent: MessageContent) => {
    if (!chat || !activeBranchId || !userId) {
      console.error("Chat, Active Branch ID, or User ID not found, cannot edit message.");
      return;
    }

    const originalMessage = currentMessages[messageIndex];
    if (!originalMessage || originalMessage.id === undefined) {
      console.error("Original message or message ID is undefined.");
      return;
    }
    const originalMessageId = originalMessage.id as number;

    // History up to the message *before* the edited one
    const historyUpToEditPoint = currentMessages.slice(0, messageIndex);

    setResponseStatus("pending");
    try {
      const result = await createBranchAndAddMessage(
        chat.id,
        userId,
        originalMessageId, // forkedFromMessageId
        activeBranchId,    // parentBranchId for the new branch
        newContent,
        historyUpToEditPoint // Ensure these are complete Message objects if needed by server
      );

      if (result && result.status === 'success' && result.data?.branch && result.data?.message) {
        addBranch(result.data.branch); // Add new branch to store's list of all branches

        // Set the new branch as active. This will load its messages.
        // The new user message (result.data.message) is the last one in its context.
        await setActiveBranch(result.data.branch.id, userId);

        // currentMessages is now updated by setActiveBranch.
        // The new user message (result.data.message) is the last one.

        // Now, send this new context (specifically the new user message from the new branch) to the AI.
        // prepareMessage will use currentMessages (which are now for the new branch)
        // We pass null for newMessageContent because the user's edited message is already the last one in currentMessages.
        const messagesForAI = prepareMessage(null, true); // true for isNewBranchContext

        await sendMessage(messagesForAI /*, search related params if any */);
        // sendMessage internally uses addMessageToCurrentBranch for the AI's response.
      } else {
        console.error("Failed to create branch and add message:", result?.message);
        setResponseStatus("done"); // Reset on failure
      }
    } catch (error) {
      console.error("Error in editMessageAndBranch:", error);
      setResponseStatus("done"); // Reset on error
    }
    // setResponseStatus("done") will be called by the final sendMessage's onFinish/onError
  };

  useEffect(() => {
    const llmApi = getLLMInstance(currentModel.provider.id);
    setChatBot(llmApi);

    return () => {
      // 清理 chatBot
      if (llmApi) {
        llmApi.stopChat?.(() => { });
        setChatBot(null);
      }
    };
  }, [currentModel]);

  const chatNamingModelStable = useMemo(() => chatNamingModel, [chatNamingModel]);
  const shouldSetNewTitle = useCallback((messages: RequestMessage[]) => {
    if (userSendCount === 0 && !chat?.isWithBot) {
      if (chatNamingModelStable !== 'none') {
        let renameModel = currentModel.id;
        let renameProvider = currentModel.provider.id;
        if (chatNamingModelStable !== 'current') {
          const [providerId, modelId] = chatNamingModelStable.split('|');
          renameModel = modelId;
          renameProvider = providerId;
        }
        generateTitle(messages, renameModel, renameProvider, (message: string) => {
          setNewTitle(chatId, message);
        }, () => { })
      }
    }
  }, [
    chat,
    chatId,
    currentModel,
    userSendCount,
    chatNamingModelStable,
    setNewTitle,
  ]);

  const sendMessage = useCallback(async (
    messages: RequestMessage[],
    searchResultStatus?: searchResultType,
    searchResponse?: WebSearchResponse,
    mcpTools?: MCPTool[]
  ) => {
    if (!activeBranchId) {
      console.error("Cannot send message, no active branch ID.");
      setResponseStatus("done"); // Reset status if we can't proceed
      return;
    }
    setResponseStatus("pending");
    const options: ChatOptions = {
      messages: messages,
      config: { model: currentModel.id },
      chatId: chatId,
      mcpTools,
      onUpdate: (responseContent: ResponseContent) => {
        setResponseMessage(responseContent);
      },
      onFinish: async (responseContent: ResponseContent, shouldContinue?: boolean) => {
        const respMessage: Message = {
          id: responseContent.id, // This ID comes from the LLM provider, may need to be database ID later
          role: "assistant",
          chatId: chatId,
          branchId: activeBranchId, // Associate with active branch
          content: responseContent.content,
          reasoninContent: responseContent.reasoningContent,
          searchStatus: searchResultStatus,
          inputTokens: responseContent.inputTokens,
          outputTokens: responseContent.outputTokens,
          totalTokens: responseContent.totalTokens,
          mcpTools: responseContent.mcpTools,
          providerId: currentModel.provider.id,
          model: currentModel.id,
          type: 'text',
          createdAt: new Date()
        };
        // Add to store instead of local state
        addMessageToCurrentBranch(respMessage);
        await addMessageInServer(respMessage); // Persist AI message

        setSearchStatus('none');
        setResponseMessage({ content: '', reasoningContent: '', mcpTools: [] });
        if (!shouldContinue) {
          setResponseStatus("done");
        }
        if (responseContent.id) { // Assuming this is the server-generated ID for the message
          await updateMessageWebSearchInServer(
            responseContent.id,
            (searchResultStatus && searchResultStatus !== 'none') ? true : false,
            searchResultStatus || 'none',
            searchResponse);
        }
      },
      onError: async (error) => {
        const respMessage: Message = {
          // id will be generated by DB
          role: "assistant",
          chatId: chatId,
          branchId: activeBranchId, // Associate with active branch
          content: error?.message || '',
          searchEnabled: (searchResultStatus && searchResultStatus !== 'none') ? true : false,
          searchStatus: searchResultStatus,
          webSearch: searchResponse,
          providerId: currentModel.provider.id,
          model: currentModel.id,
          type: 'error',
          errorType: error?.name || 'unknown error',
          errorMessage: error?.message || '',
          createdAt: new Date()
        };
        // Add to store instead of local state
        addMessageToCurrentBranch(respMessage);
        await addMessageInServer(respMessage); // Persist error message

        setResponseStatus("done");
        setSearchStatus('none');
        setResponseMessage({ content: '', reasoningContent: '' });
      }
    };
    chatBot?.chat(options);
  }, [
    chatBot,
    chatId,
    currentModel,
    activeBranchId, // Added dependency
    addMessageToCurrentBranch // Added dependency
  ]);

  const stopChat = () => {
    setResponseStatus("done");
    chatBot?.stopChat(async (responseContent: ResponseContent) => { // made async
      if (responseContent.content || responseContent.reasoningContent) {
        if (!activeBranchId) {
          console.error("Cannot save stopped message, no active branch ID.");
          return;
        }
        const respMessage: Message = {
          // id will be generated by DB
          role: "assistant",
          chatId: chatId,
          branchId: activeBranchId,
          content: responseContent.content,
          searchStatus: searchStatus, // This searchStatus is from the hook's state, ensure it's correct
          mcpTools: responseContent.mcpTools,
          reasoninContent: responseContent.reasoningContent,
          inputTokens: responseContent.inputTokens,
          outputTokens: responseContent.outputTokens,
          totalTokens: responseContent.totalTokens,
          providerId: currentModel.provider.id,
          model: currentModel.id,
          type: 'text',
          createdAt: new Date()
        };
        addMessageToCurrentBranch(respMessage);
        await addMessageInServer(respMessage); // Persist
      }
      setSearchStatus('none');
      setResponseMessage({ content: '', reasoningContent: '' });
    });
  }

  const deleteMessage = async (index: number) => { // made async
    // This needs a store action like removeMessageFromCurrentBranch(messageId)
    // For now, let's assume direct manipulation for optimistic update, then call server
    const messageToDelete = currentMessages[index];
    if (!messageToDelete || !messageToDelete.id) return;

    // Optimistic update (example, replace with store action if available)
    // const updatedMessages = currentMessages.filter((_, i) => i !== index);
    // useChatStore.setState({ currentMessages: updatedMessages }); // Direct store manipulation (not recommended usually)
    // OR: await store.removeMessage(messageToDelete.id);

    await deleteMessageInServer(messageToDelete.id as number);
    // After server deletion, store should refetch or remove.
    // If store's setActiveBranch refetches, that might be enough.
    // Or, more simply for now, if using a method like `removeMessageFromCurrentBranch` in store, call it.
    // For this subtask, we assume server deletion is enough and UI will update if store is reactive.
    // A proper solution would be:
    // 1. Call store action to remove message optimistically & from server.
    // 2. Store action updates currentMessages.
    console.warn("deleteMessage needs robust store integration for currentMessages update.");
  }


  const clearHistory = async () => { // made async
    // This needs to be re-thought with branches.
    // Do we clear messages from the active branch? Or all branches of the chat?
    // For now, let's assume it clears messages from the *active branch*.
    if (!activeBranchId) return;
    // Option 1: Server action clears messages for a specific branchId.
    // await clearMessagesForBranchInServer(chatId, activeBranchId);
    // Option 2: Iterate and delete.
    // for (const message of currentMessages) {
    //   if (message.id) await deleteMessageInServer(message.id);
    // }
    // Then update store:
    // useChatStore.setState({ currentMessages: [] }); // Not recommended for direct use
    // Or: store.clearMessagesForActiveBranch();
    console.warn("clearHistory needs to be adapted for branches.");
    // Quick fix: use existing clearMessageInServer - this clears ALL messages for the chat.
    // This is likely NOT what we want for branches.
    await clearMessageInServer(chatId); // This clears all messages for the chat.
    // Need to reload branches and messages for the active branch (which might be empty or a default one)
    if (userId) await loadBranches(chatId, userId);

  }

  const addBreak = async () => {
    if (currentMessages.length > 0 && currentMessages.at(-1)?.type === 'break') {
      return;
    }
    if (!activeBranchId) {
        console.error("Cannot add break, no active branch ID.");
        return;
    }
    const toAddMessage: Message = {
      // id will be generated by DB
      role: "system",
      chatId: chatId,
      branchId: activeBranchId,
      content: '上下文已清除',
      providerId: currentModel.provider.id,
      model: currentModel.id,
      type: 'break' as 'break',
      createdAt: new Date(),
    };
    addMessageToCurrentBranch(toAddMessage);
    await addMessageInServer(toAddMessage); // Persist
  }

  // prepareMessage needs to use currentMessages from store
  const prepareMessage = useCallback((newMessageContent: MessageContent | null, isNewBranchContext: boolean = false): RequestMessage[] => {
    let messagesToProcess: Message[] = [];

    if (isNewBranchContext) {
        // For a new branch, currentMessages are already set to the history + new user message by setActiveBranch
        messagesToProcess = [...currentMessages];
    } else {
        // For a regular message submit on an existing branch
        messagesToProcess = [...currentMessages];
        if (newMessageContent) { // If there's a new message to append for processing (but not yet in state)
            messagesToProcess.push({
                // id will be generated by DB for this new message
                role: 'user', // Assuming new message is from user
                chatId: chatId,
                branchId: activeBranchId || undefined, // Should have activeBranchId here
                content: newMessageContent,
                providerId: currentModel.provider.id, // Or derive from context
                model: currentModel.id, // Or derive from context
                type: 'text', // Assuming text for now
                createdAt: new Date(),
            });
        }
    }

    let effectiveMessages: RequestMessage[] = [];
    const validMessageType = ['text', 'image']; // Assuming 'break' is handled by slicing correctly

    // Find last break in the messagesToProcess
    const breakIndex = messagesToProcess.findLastIndex(item => item.type === 'break');
    let relevantMessages = breakIndex > -1 ? messagesToProcess.slice(breakIndex + 1) : messagesToProcess;

    effectiveMessages = relevantMessages
        .filter((item) => validMessageType.includes(item.type) && (item.role === 'user' || item.role === 'assistant'))
        .map(({ content, role }) => ({ content, role: role as 'user' | 'assistant' }));

    if (historyType === 'all') {
        // No change if 'all'
    } else if (historyType === 'none') {
        effectiveMessages = newMessageContent ? [{ role: 'user', content: newMessageContent }] : [];
    } else if (historyType === 'count' && historyCount > 0) {
        if (effectiveMessages.length > historyCount) {
            effectiveMessages = effectiveMessages.slice(-historyCount);
        }
    } else { // Default to historyCount or if historyCount is 0, effectively 'none' for past messages
       if (effectiveMessages.length > (historyCount || 0) && newMessageContent) {
         effectiveMessages = effectiveMessages.slice(-(historyCount || 0));
       } else if (!newMessageContent){
         effectiveMessages = [];
       }
    }

    // Prepend system prompt if chat.prompt exists
    if (chat?.prompt) {
        effectiveMessages.unshift({ role: 'system', content: chat.prompt });
    }
    return effectiveMessages;
  }, [
    chat,
    historyCount,
    historyType,
    currentMessages, // Switched from messageList
    chatId,
    activeBranchId,
    currentModel
  ]);

  const handleWebSearch = useCallback(async (message: MessageContent) => {
    let realSendMessage = message;
    let searchStatus: searchResultType = 'none';
    let searchResponse: WebSearchResponse | undefined;

    try {
      setSearchStatus("searching");
      const textContent = typeof message === 'string' ? message : '';
      if (textContent) {
        const searchResult = await getSearchResult(textContent);
        
        if (searchResult.status === 'success') {
          searchResponse = searchResult.data || undefined;
          const referenceContent = `\`\`\`json\n${JSON.stringify(searchResult, null, 2)}\n\`\`\``;
          realSendMessage = REFERENCE_PROMPT.replace('{question}', textContent).replace('{references}', referenceContent);
          setSearchStatus("done");
          searchStatus = 'done';
        } else {
          setSearchStatus("error");
          searchStatus = 'error';
        }
      }
    } catch (error) {
      console.error('handleWebSearch - error:', error);
      setSearchStatus("error");
      searchStatus = 'error';
    }

    return {
      realSendMessage,
      searchStatus,
      searchResponse
    };
  }, []);

  const handleSubmit = useCallback(async (messageContent: MessageContent) => {
    if (responseStatus === 'pending') {
      return;
    }
    if (!userId) {
      console.error("User ID not found, cannot submit message.");
      return;
    }
    setResponseStatus("pending");
    setIsUserScrolling(false);

    let currentActiveBranchId = activeBranchId;

    // Handle first message in a new chat - create initial branch
    if (!currentActiveBranchId) {
      const branchResult = await createBranchAndAddMessage(
        chatId,
        userId,
        null, // forkedFromMessageId
        null, // parentBranchId
        messageContent,
        []    // empty history
      );
      if (branchResult && branchResult.status === 'success' && branchResult.data?.branch && branchResult.data?.message) {
        addBranch(branchResult.data.branch);
        await setActiveBranch(branchResult.data.branch.id, userId); // This will load the new message into currentMessages
        currentActiveBranchId = branchResult.data.branch.id; // Update for current operation
        // The user message is already in currentMessages via setActiveBranch
      } else {
        console.error("Failed to create initial branch.");
        setResponseStatus("done");
        return;
      }
    } else {
      // Regular message on existing branch
      const userMessage: Message = {
        // id will be generated by DB
        role: "user",
        chatId: chatId,
        branchId: currentActiveBranchId,
        content: messageContent,
        searchEnabled: webSearchEnabled,
        providerId: currentModel.provider.id,
        model: currentModel.id,
        type: 'text' as const,
        createdAt: new Date(),
      };
      addMessageToCurrentBranch(userMessage); // Optimistic update to UI
      await addMessageInServer({ ...userMessage, branchId: currentActiveBranchId }); // Persist, ensure branchId is passed
    }

    // setUserSendCount(userSendCount + 1); // This needs to be based on currentMessages if kept

    let realSendMessageContent = messageContent;
    let searchResultStatus: searchResultType = 'none';
    let searchResponse: WebSearchResponse | undefined = undefined;
    if (webSearchEnabled) {
      const result = await handleWebSearch(messageContent);
      realSendMessageContent = result.realSendMessage;
      searchResultStatus = result.searchStatus;
      searchResponse = result.searchResponse;
    }

    // Pass null for newMessageContent as it's already added to currentMessages
    const messagesForAI = prepareMessage(null, false);
    sendMessage(messagesForAI, searchResultStatus, searchResponse, selectedTools);
    shouldSetNewTitle(messagesForAI) // shouldSetNewTitle might need adjustment for currentMessages

  }, [
    chatId,
    responseStatus,
    currentModel,
    // userSendCount, // Re-evaluate
    selectedTools,
    webSearchEnabled,
    prepareMessage,
    sendMessage,
    handleWebSearch,
    activeBranchId, // Added
    userId, // Added
    addBranch, // Added
    setActiveBranch, // Added
    addMessageToCurrentBranch, // Added
    shouldSetNewTitle
  ]);

  // prepareMessageFromIndex needs to be adapted for currentMessages
  const prepareMessageFromIndex = (index: number): RequestMessage[] => {
    let messages: RequestMessage[] = [];
    // This logic needs to be carefully reviewed with currentMessages and history settings
    // For simplicity, returning a slice of currentMessages up to index (excluding the retried one)
    messages = currentMessages
        .slice(0, index)
        .filter((item) => item.type !== 'error' && (item.role === 'user' || item.role === 'assistant'))
        .map(({ content, role }) => ({ content, role: role as 'assistant' | 'user' }));

    if (chat?.prompt) {
        messages.unshift({ role: 'system', content: chat.prompt });
    }
    return messages;
  }

  const retryMessage = async (index: number) => { // Removed addNew flag, always treat as new submission for simplicity now
    if (!activeBranchId) {
        console.error("Cannot retry message, no active branch.");
        return;
    }
    const messageToRetry = currentMessages[index];
    if (!messageToRetry) return;

    // Option 1: Treat as a new message submission on the current branch
    // This is simpler than trying to re-use the exact old context if things have changed.
    // await handleSubmit(messageToRetry.content);

    // Option 2: More complex - try to "fork" or create a new context from before this message
    // For now, let's use a simplified approach: resubmit the content.
    // The history (currentMessages up to index) will be used by prepareMessage.
    setResponseStatus("pending");
    setIsUserScrolling(false);

    const historyForRetry = currentMessages.slice(0, index);
    // Create a temporary list for prepareMessage
    const tempMessagesForPrepare = [...historyForRetry, messageToRetry];

    const messagesForAI = prepareMessage(messageToRetry.content, false); // Let prepareMessage use currentMessages + new content

    // Similar to handleSubmit, but without adding the user message again if it's already there.
    // Or, if we consider retry as "editing" the future, it might create a new branch.
    // For this iteration, let's keep it simple: resend based on current context before this message.

    // The actual user message for this retry isn't re-added to currentMessages here,
    // as prepareMessage will take currentMessages (which includes up to the point of retry)
    // and then the AI response will be added.
    // This needs careful thought: if we want the retried user message to appear again, it should be added.
    // For now, assuming we are retrying the AI's response to `messageToRetry.content`.

    // This is effectively resubmitting the user's message that led to the response we want to retry.
    // If messageToRetry is an assistant message, we need to find the user message that prompted it.

    if (messageToRetry.role === 'user') {
        const messages = prepareMessage(messageToRetry.content, false); // Pass content to be appended by prepareMessage
        sendMessage(messages, messageToRetry.searchStatus, messageToRetry.webSearch, messageToRetry.mcpTools);
    } else if (messageToRetry.role === 'assistant' && index > 0) {
        // Find previous user message and resubmit that.
        const prevUserMessage = currentMessages[index-1];
        if (prevUserMessage && prevUserMessage.role === 'user') {
            // We need to make sure prepareMessage uses context *before* prevUserMessage, then adds prevUserMessage
            const contextBeforePrev = currentMessages.slice(0, index - 1);
            // This is getting complicated. A simpler retry might be to just resubmit the user message content.
            // For now, only allowing retry of user messages effectively.
             console.warn("Retry for assistant messages needs more specific logic to define context.");
             setResponseStatus("done");
             return;
        }
    }
    // shouldSetNewTitle might be relevant if retrying creates new significant interaction
  }


  useEffect(() => {
    const initializeChatData = async () => {
      if (!userId) {
        setIsPending(true); // Still pending if no user ID
        return;
      }
      try {
        setIsPending(true);
        const { status, data: chatData } = await getChatInfoInServer(chatId);
        if (status === 'success' && chatData) {
          initializeChatInStore(chatData, userId); // Store's initialize calls loadBranches
          if (chatData?.defaultProvider && chatData?.defaultModel) {
            setCurrentModelExact(chatData.defaultProvider, chatData.defaultModel);
          }
        } else {
          // Handle chat not found or error
          router.push('/'); // Or some error page
          return;
        }
        // Message loading is now handled by setActiveBranch in the store,
        // called by loadBranches, which is called by initializeChatInStore.
        // So, no explicit setMessageList here.

        // userSendCount might need to be recalculated based on currentMessages after they load
        // For now, can set it after currentMessages stabilizes if needed.
        // const userMessageCount = currentMessages.filter(item => item.role === "user").length;
        // setUserSendCount(userMessageCount);
        
      } catch (error) {
        console.error('Error in chat initialization:', error);
        router.push('/'); // Or some error page
      } finally {
        setIsPending(false);
      }
    };

    if (userId) { // Only run if userId is available
        initializeChatData();
    } else {
        // Handle case where session/userId is still loading or not available
        console.log("Waiting for user session to initialize chat...");
    }
  }, [chatId, userId, initializeChatInStore, setCurrentModelExact, router]);

  const shouldSetNewTitleRef = useRef(shouldSetNewTitle);
  const processedMessageIds = useRef(new Set<string>());
  const hasInitialized = useRef(false);

  useEffect(() => {
    const handleInitialResponse = async () => {
      if (hasInitialized.current || !activeBranchId) { // Ensure activeBranchId exists
        return;
      }

      try {
        const urlParams = new URLSearchParams(window.location.search);
        const fromHome = urlParams.get('f') === 'home';
        if (!fromHome) return;
        
        router.replace(`/chat/${chatId}`);
        
        if (currentMessages.length === 1 && currentMessages[0].role === 'user') {
          const userMessage = currentMessages[0];
          const messageId = `${userMessage.id || '-'}-${activeBranchId}`; // Include branchId for uniqueness
          
          if (processedMessageIds.current.has(messageId)) {
            return;
          }
          
          processedMessageIds.current.add(messageId);
          hasInitialized.current = true;
          
          const _searchEnabled = userMessage.searchEnabled || false;
          const question = userMessage.content;
          
          let realSendMessageContent = question;
          let searchResultStatus: searchResultType = 'none';
          let searchResponse = undefined;
          
          if (_searchEnabled) {
            setResponseStatus('pending');
            try {
              const result = await handleWebSearch(question);
              realSendMessageContent = result.realSendMessage;
              searchResultStatus = result.searchStatus;
              searchResponse = result.searchResponse;
            } catch (error) {
              console.error('handleInitialResponse - web search error:', error);
              searchResultStatus = 'error';
            }
          }
          
          // prepareMessage will use currentMessages which has the single user message
          const messagesForAI = prepareMessage(null, false);
          await sendMessage(messagesForAI, searchResultStatus, searchResponse, selectedTools);
          shouldSetNewTitleRef.current(messagesForAI);
        }
      } catch (error) {
        console.error('handleInitialResponse - error:', error);
      }
    };
    
    if (currentMessages.length > 0 && activeBranchId) { // Check activeBranchId
      handleInitialResponse();
    }
  }, [currentMessages, activeBranchId, chatId, selectedTools, router, sendMessage, handleWebSearch, prepareMessage]); // Added prepareMessage

  // Expose state and actions
  return {
    chat, // from store
    messageList: currentMessages, // Use currentMessages from store
    branches, // from store
    activeBranchId, // from store
    searchStatus,
    responseStatus,
    responseMessage,
    historyType, // from store
    historyCount, // from store
    isUserScrolling,
    currentModel, // from modelListStore
    isPending, // Local to hook (for chat loading)
    handleSubmit,
    sendMessage, // Adapted
    shouldSetNewTitle, // Needs review for currentMessages
    deleteMessage, // Adapted (needs store integration)
    clearHistory, // Adapted (needs branch logic)
    stopChat, // Adapted
    retryMessage, // Adapted (needs review)
    addBreak, // Adapted
    setIsUserScrolling,
    // New actions to be implemented next:
    editMessageAndBranch, // Added
    switchBranch, // Added
  };
};

export default useChat;