import React, { useState, useEffect, memo, useMemo } from 'react';
import { Message, MessageContent } from '@/types/llm';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { Button, Tooltip, message, Alert, Avatar, Popconfirm, Image as AntdImage, Input, Dropdown, Menu, Space } from "antd"; // Added Input, Dropdown, Menu, Space
import { CopyOutlined, SyncOutlined, DeleteOutlined, DownOutlined, CheckCircleOutlined, CloseCircleOutlined, SearchOutlined, EditOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons'; // Added EditOutlined, LeftOutlined, RightOutlined
import useModelListStore from '@/app/store/modelList';
import ThinkingIcon from '@/app/images/thinking.svg';
import MarkdownRender from '@/app/components/Markdown';
import { useTranslations } from 'next-intl';
import { Branch } from '@/app/store/chat'; // Import Branch type

// Define MessageItemProps interface
export interface MessageItemProps {
  item: Message; // id should be number
  index: number;
  isConsecutive: boolean;
  role: 'assistant' | 'user' | 'system';
  retryMessage: (index: number) => void;
  deleteMessage: (index: number) => void;
  editMessageAndBranch?: (messageIndex: number, newContent: MessageContent) => void;
  currentBranchId?: string | null;
  allBranches?: Branch[];
  switchBranch?: (branchId: string) => void;
  precedingUserMessageForAIMessage?: { id: number; branchId: string; content: MessageContent } | null; // For AI message dropdown
}

const MessageItem = memo((props: MessageItemProps) => {
  const t = useTranslations('Chat');
  const { item, role, currentBranchId, allBranches, switchBranch, precedingUserMessageForAIMessage } = props;
  const { allProviderListByKey } = useModelListStore();
  const [images, setImages] = useState<string[]>([]);
  const [plainText, setPlainText] = useState('');

  // State for editing
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');

  useEffect(() => {
    let currentPlainText = '';
    if (Array.isArray(props.item.content) && props.item.content.length > 0) {
      const imagesContent = props.item.content.filter((item: any) => item.type === 'image').map((item: any) => item.data);
      setImages(imagesContent);
      currentPlainText = props.item.content.filter((i) => i.type === 'text').map((it) => it.text).join('');
    } else if (typeof props.item.content === 'string') {
      currentPlainText = props.item.content;
    }
    setPlainText(currentPlainText);
    // Initialize editedContent only when not in editing mode to avoid overwriting user input
    if (!isEditing) {
      setEditedContent(currentPlainText);
    }
  }, [props.item, isEditing]); // Rerun if isEditing changes to reset content on cancel

  const ProviderAvatar = useMemo(() => {
    if (allProviderListByKey) {
      return (allProviderListByKey && allProviderListByKey[props.item.providerId]?.providerLogo) ? <Avatar
        style={{ marginTop: '0.2rem', 'fontSize': '24px', 'border': '1px solid #eee', 'padding': '2px' }}
        src={allProviderListByKey![props.item.providerId].providerLogo}
      /> : <div className='bg-blue-500 flex mt-1 text-cyan-50 items-center justify-center rounded-full w-8 h-8'>
        {allProviderListByKey && allProviderListByKey[props.item.providerId].providerName.charAt(0)}</div>
    }
    else {
      return <div className='bg-blue-500 flex mt-1 text-cyan-50 items-center justify-center rounded-full w-8 h-8'>
        Bot</div>
    }
  }, [allProviderListByKey, props.item.providerId])

  if (props.item.type === 'error' && props.item.errorType === 'TimeoutError') {
    return (
      <div className="flex container mx-auto px-2 max-w-screen-md w-full flex-col justify-center items-center" >
        <div className='items-start flex  max-w-3xl text-justify w-full my-0 pt-0 pb-1 flex-row'>
          {ProviderAvatar}
          <div className='flex flex-col w-0 grow group max-w-80'>
            <Alert
              showIcon
              style={{ marginLeft: '0.75rem' }}
              message={t('apiTimeout')}
              type="warning"
            />
            <div className='invisible flex flex-row items-center ml-3 my-1 group-hover:visible'>
              <Tooltip title={t('deleteNotice')}>
                <Popconfirm
                  title={t('deleteNotice')}
                  description={t('currentMessageDelete')}
                  onConfirm={() => props.deleteMessage(props.index)}
                  okText={t('confirm')}
                  cancelText={t('cancel')}
                  placement='bottom'
                >
                  <Button type="text" size='small'>
                    <DeleteOutlined style={{ color: 'gray' }} />
                  </Button>
                </Popconfirm>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
    )
  }
  if (props.item.type === 'error' && props.item.errorType === 'OverQuotaError') {
    return (
      <div className="flex container mx-auto px-2 max-w-screen-md w-full flex-col justify-center items-center" >
        <div className='items-start flex  max-w-3xl text-justify w-full my-0 pt-0 pb-1 flex-row'>
          {ProviderAvatar}
          <div className='flex flex-col w-0 grow group' style={{ maxWidth: '28rem' }}>
            <Alert
              showIcon
              style={{ marginLeft: '0.75rem' }}
              message="超出本月使用限额。请次月再重试，或联系管理员增加额度。"
              type="warning"
            />
            <div className='invisible flex flex-row items-center ml-3 my-1 group-hover:visible'>
              <Tooltip title={t('deleteNotice')}>
                <Popconfirm
                  title={t('deleteNotice')}
                  description={t('currentMessageDelete')}
                  onConfirm={() => props.deleteMessage(props.index)}
                  okText={t('confirm')}
                  cancelText={t('cancel')}
                  placement='bottom'
                >
                  <Button type="text" size='small'>
                    <DeleteOutlined style={{ color: 'gray' }} />
                  </Button>
                </Popconfirm>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
    )
  }
  if (props.item.type === 'error' && props.item.errorType === 'InvalidAPIKeyError') {
    return (
      <div className="flex container mx-auto px-2 max-w-screen-md w-full flex-col justify-center items-center" >
        <div className='items-start flex  max-w-3xl text-justify w-full my-0 pt-0 pb-1 flex-row'>
          {ProviderAvatar}
          <div className='flex flex-col w-0 grow group max-w-96'>
            <Alert
              showIcon
              style={{ marginLeft: '0.75rem' }}
              message={t('apiKeyError')}
              type="warning"
            />
            <div className='invisible flex flex-row items-center ml-3 my-1 group-hover:visible'>
              <Tooltip title={t('deleteNotice')}>
                <Popconfirm
                  title={t('deleteNotice')}
                  description={t('currentMessageDelete')}
                  onConfirm={() => props.deleteMessage(props.index)}
                  okText={t('confirm')}
                  cancelText={t('cancel')}
                  placement='bottom'
                >
                  <Button type="text" size='small'>
                    <DeleteOutlined style={{ color: 'gray' }} />
                  </Button>
                </Popconfirm>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>);
  }
  if (props.item.type === 'break') {
    return <div className="flex container mx-auto px-2 max-w-screen-md w-full flex-col justify-center items-center" >
      <div className='items-start flex  max-w-3xl text-justify w-full my-0 pt-0 pb-1 flex-row'>
        <div className="relative w-full my-6">
          {/* Horizontal lines */}
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-gray-200"></div>
          </div>

          {/* Text container */}
          <div className="relative flex justify-center">
            <span className="bg-white px-3 text-xs text-gray-400">{t('contextCleared')}</span>
          </div>
        </div>
      </div>
    </div>
  }
  if (props.role === 'user') {
    return <div className="flex container mx-auto pl-4 pr-2 max-w-screen-md w-full flex-col justify-center items-center" >
      <div className='items-start flex max-w-3xl text-justify w-full my-0 pt-0 pb-1 flex-row-reverse'>
        <div className='flex ml-10 flex-col items-end group'>
          <div className='flex flex-row gap-2 mb-2'>
            {images.length > 0 &&
              images.map((image, index) => {
                return (
                  <div key={index} className="flex flex-wrap gap-4">
                    <AntdImage alt=''
                      className='block border h-full w-full rounded-md object-cover cursor-pointer'
                      height={160}
                      src={image}
                      preview={{
                        mask: false
                      }}
                    />
                  </div>
                );
              })}
          </div>
          {typeof props.item.content === 'string' &&
            <div
              className='w-fit px-4 py-3 markdown-body !min-w-4 !bg-gray-100 text-base rounded-xl ml-10'
              style={{ maxWidth: '44rem' }}
            >
              <MarkdownRender content={props.item.content} />
            </div>}
          {Array.isArray(props.item.content) &&
            props.item.content.filter((i) => i.type === 'text').map((it) => it.text).join('') !== '' &&
            <div
              className='w-fit px-4 py-3 markdown-body !min-w-4 !bg-gray-100 text-base rounded-xl ml-10'
              style={{ maxWidth: '44rem' }}
            >
          <MarkdownRender content={plainText} />
            </div>}

          {/* User Message Branch Navigation (X/Y) */}
          {role === 'user' && !isEditing && allBranches && switchBranch && item.id && (
            () => {
              const parentBranchOfCurrent = allBranches.find(b => b.id === item.branchId);
              let originalForkPointMessageId: number | null = null;
              if (parentBranchOfCurrent && parentBranchOfCurrent.forkedFromMessageId && parentBranchOfCurrent.parentBranchId) {
                originalForkPointMessageId = parentBranchOfCurrent.forkedFromMessageId;
              } else if (!parentBranchOfCurrent?.parentBranchId) { // This message is on a root branch, or its branch is the original
                originalForkPointMessageId = item.id;
              }


              let versionBranches: Branch[] = [];
              if (originalForkPointMessageId) {
                 // Branches forked from the same original message OR from the current message itself
                const branchesForkedFromOriginal = allBranches.filter(b => b.forkedFromMessageId === originalForkPointMessageId);
                 // Include the branch of the original message if it exists and is not one of the forked ones
                const originalMessageBranchId = allBranches.find(b => b.forkedFromMessageId === originalForkPointMessageId)?.parentBranchId;
                const originalMessageBranch = originalMessageBranchId ? allBranches.find(b => b.id === originalMessageBranchId) : undefined;


                versionBranches = [...branchesForkedFromOriginal];
                if (originalMessageBranch && !versionBranches.some(vb => vb.id === originalMessageBranch.id)) {
                  // Check if this original message branch itself contains the originalForkPointMessageId
                  // This logic is a bit convoluted: trying to find the "true" original user message's branch
                  // For now, let's simplify: if current message created forks, list them. If current message is a fork, list its siblings and parent.
                }
              }

              // Simpler logic:
              // 1. Branches forked FROM this user message (item.id)
              const directlyForkedBranches = allBranches.filter(b => b.forkedFromMessageId === item.id);
              // 2. If this message's branch is a fork itself, find its parent and siblings
              const currentMsgBranch = allBranches.find(b => b.id === item.branchId);
              let siblingAndParentBranches: Branch[] = [];
              if (currentMsgBranch && currentMsgBranch.parentBranchId && currentMsgBranch.forkedFromMessageId !== null) {
                const parentB = allBranches.find(b => b.id === currentMsgBranch.parentBranchId);
                if (parentB) siblingAndParentBranches.push(parentB);
                siblingAndParentBranches.push(...allBranches.filter(
                  b => b.parentBranchId === currentMsgBranch.parentBranchId && b.id !== item.branchId && b.forkedFromMessageId === currentMsgBranch.forkedFromMessageId
                ));
              }

              let relevantBranches = [...directlyForkedBranches];
              if (currentMsgBranch) { // Add current message's branch
                if (!relevantBranches.find(rb => rb.id === currentMsgBranch.id)) {
                   relevantBranches.push(currentMsgBranch);
                }
              }
              siblingAndParentBranches.forEach(spb => {
                if (!relevantBranches.find(rb => rb.id === spb.id)) {
                  relevantBranches.push(spb);
                }
              });

              // Filter out duplicates and sort
              const uniqueRelevantBranches = Array.from(new Set(relevantBranches.map(b => b.id)))
                                                 .map(id => relevantBranches.find(b => b.id === id)!)
                                                 .filter(Boolean)
                                                 .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

              const totalVersions = uniqueRelevantBranches.length;
              const currentIndex = uniqueRelevantBranches.findIndex(b => b.id === item.branchId);

              if (totalVersions > 1) {
                return (
                  <Space size="small" className="ml-2 mt-1 text-xs text-gray-500">
                    <Button
                      type="text"
                      size="small"
                      icon={<LeftOutlined />}
                      disabled={currentIndex <= 0}
                      onClick={() => switchBranch(uniqueRelevantBranches[currentIndex - 1].id)}
                    />
                    <span>{currentIndex + 1}/{totalVersions}</span>
                    <Button
                      type="text"
                      size="small"
                      icon={<RightOutlined />}
                      disabled={currentIndex >= totalVersions - 1}
                      onClick={() => switchBranch(uniqueRelevantBranches[currentIndex + 1].id)}
                    />
                  </Space>
                );
              }
              return null;
            }
          )()}

          {isEditing && role === 'user' && (
            <div className="mt-2 w-full" style={{ maxWidth: '44rem' }}>
              <Input.TextArea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                autoSize={{ minRows: 2, maxRows: 10 }}
              />
              <div className="flex justify-end gap-2 mt-2">
                <Button size="small" onClick={() => setIsEditing(false)}>{t('cancel')}</Button>
                <Button type="primary" size="small" onClick={() => {
                  if (props.editMessageAndBranch) {
                    // For now, editedContent is plain text.
                    // If MessageContent needs to be structured (e.g., for images), this needs adjustment.
                    props.editMessageAndBranch(props.index, editedContent);
                  }
                  setIsEditing(false);
                }}>
                  {t('save')}
                </Button>
              </div>
            </div>
          )}
          {!isEditing && (
            <div className='invisible flex flex-row-reverse pr-1 mt-1 group-hover:visible'>
              {props.role === 'user' && props.editMessageAndBranch && (
                <Tooltip title={t('edit')}>
                  <Button type="text" size="small" onClick={() => {
                    setEditedContent(plainText); // Initialize with current plain text
                    setIsEditing(true);
                  }}>
                    <EditOutlined style={{ color: 'gray' }} />
                  </Button>
                </Tooltip>
              )}
              <Tooltip title={t('delete')}>
                <Popconfirm
                title={t('deleteNotice')}
                description={t('currentMessageDelete')}
                onConfirm={() => props.deleteMessage(props.index)}
                okText={t('confirm')}
                cancelText={t('cancel')}
                placement='bottom'
              >
                <Button type="text" size='small'>
                  <DeleteOutlined style={{ color: 'gray' }} />
                </Button>
              </Popconfirm>
            </Tooltip>
            <Tooltip title={t('retry')}>
              <Button type="text" size='small'
                onClick={() => {
                  props.retryMessage(props.index)
                }}
              >
                <SyncOutlined style={{ color: 'gray' }} />
              </Button>
            </Tooltip>
            <CopyToClipboard text={plainText} onCopy={() => {
              message.success(t('copySuccess'));
            }}>
              <Tooltip title={t('copy')}>
                <Button type="text" size='small'>
                  <CopyOutlined style={{ color: 'gray' }} />
                </Button>
              </Tooltip>
            </CopyToClipboard>
            </div>
          )}
        </div>
      </div>
    </div>;
  }
  if (props.role === 'assistant') {
    return (
      <div className="flex container mx-auto px-2 max-w-screen-md w-full flex-col justify-center items-center" >
        <div className='items-start flex max-w-3xl text-justify w-full my-0 pt-0 pb-1 flex-row'>
          <div className='flex flex-col h-full'>
            {ProviderAvatar}
            {props.isConsecutive && <div className="flex justify-center h-0 grow">
              <div className="h-full border-l border-dashed border-gray-300 my-1"></div>
            </div>}
          </div>
          <div className='flex flex-col w-0 grow group'>
            <div className='pl-3 pr-0 py-2 ml-2  bg-gray-100  text-gray-600 w-full grow markdown-body answer-content rounded-xl'>

              {props.item.searchStatus === "searching" && <div className='flex text-xs flex-row items-center  text-gray-800 bg-gray-100 rounded-md p-2 mb-4'>
                <SearchOutlined style={{ marginLeft: '4px' }} /> <span className='ml-2'>正在联网搜索...</span>
              </div>
              }
              {props.item.searchStatus === "error" && <div className='flex text-xs flex-row items-center  text-gray-800 bg-gray-100 rounded-md p-2 mb-4'>
                <SearchOutlined style={{ marginLeft: '4px' }} /> <span className='ml-2'>搜索出错，请联系管理员检查搜索引擎配置</span>
              </div>
              }
              {props.item.searchStatus === "done" && <div className='flex text-xs flex-row items-center  text-gray-800 bg-gray-100 rounded-md p-2 mb-4'>
                <SearchOutlined style={{ marginLeft: '4px' }} /> <span className='ml-2'>搜索完成</span>
              </div>
              }

              {props.item.reasoninContent &&
                <details open={true} className='text-sm mt-1 mb-4'>
                  <summary
                    className='flex text-xs flex-row items-center hover:bg-gray-200 text-gray-800 bg-gray-100 rounded-md p-2'
                    style={{ display: 'flex' }}
                  >
                    <ThinkingIcon width={16} height={16} style={{ 'fontSize': '10px' }} />
                    <span className='ml-1'>{t('thought')}</span>
                    <DownOutlined
                      className='ml-auto mr-1'
                      style={{
                        color: '#999',
                        transform: `rotate(0deg)`,
                        transition: 'transform 0.2s ease'
                      }}
                    />
                  </summary>
                  <div className='border-l-2 border-gray-200 px-2 mt-2 leading-5 text-gray-400'>
                    <MarkdownRender content={props.item.reasoninContent as string} />
                  </div>
                </details>}
              {/* Assistant message content rendering */}
              {images.length > 0 && props.item.content && Array.isArray(props.item.content) && (
                 props.item.content.filter(part => part.type === 'image').map((part,idx) =>
                    <AntdImage key={idx}
                      className='cursor-pointer mb-2'
                      src={(part as any).data} // Assuming image part has data
                      preview={{ mask: false }}
                      style={{ maxWidth: '250px', borderRadius: '4px', boxShadow: '3px 4px 7px 0px #dedede' }}
                    />)
              )}
              {plainText && <MarkdownRender content={plainText} />}

              {/* This part seems to be duplicated or conflicting with plainText rendering above.
                  Keeping plainText rendering as primary for now.
              */}
              {/* {typeof props.item.content === 'string' && <MarkdownRender content={props.item.content} />
              }

              {
                Array.isArray(props.item.content) && props.item.content.map((part, index) =>
                  <div key={index}>
                    {part.type === 'text' && <MarkdownRender content={part.text} />}
                    {part.type === 'image' && <AntdImage
                      className='cursor-pointer'
                      src={part.data}
                      preview={{ mask: false }}
                      style={{ maxWidth: '250px', borderRadius: '4px', boxShadow: '3px 4px 7px 0px #dedede' }} />}
                  </div>)
              }

              {
                props.item.mcpTools && props.item.mcpTools.map((mcp, index) => {
                  return <details open={false} key={index} className='flex flex-row bg-gray-100 hover:bg-slate-100 text-gray-800 rounded-md mb-3  border border-gray-200 text-sm'>

                    <summary
                      className='flex text-xs flex-row items-center rounded-md p-4'
                      style={{ display: 'flex' }}
                    >
                      <span className='mr-2'>{t('mcpCall')} {mcp.tool?.serverName} {t('sTool')}： {mcp.tool?.name}</span>
                      {
                        mcp.response.isError ?
                          <div><CloseCircleOutlined style={{ color: 'red' }} /><span className='ml-1 text-red-600'>{t('mcpFailed')}</span></div>
                          : <div><CheckCircleOutlined style={{ color: 'green' }} /><span className='ml-1 text-green-700'>{t('mcpFinished')}</span></div>
                      }
                      <DownOutlined
                        className='ml-auto mr-1'
                        style={{
                          color: '#999',
                          transform: `rotate(-90deg)`,
                          transition: 'transform 0.2s ease'
                        }}
                      />
                    </summary>
                    <div className='p-4 pb-0 text-xs border-t'>
                      <span className='mb-2 font-medium'>{t('mcpInput')}</span>
                      <pre className='scrollbar-thin' style={{ marginTop: '6px' }}>{JSON.stringify(mcp.tool.inputSchema, null, 2)}</pre>
                      <span className='mb-2 font-medium'>{t('mcpOutput')}</span>
                      <pre className='scrollbar-thin bg-white' style={{ marginTop: '6px' }}>{JSON.stringify(mcp.response, null, 2)}</pre>
                    </div>
                  </details>
                })
              }
            </div>
            <div className='invisible flex flex-row items-center pl-1 group-hover:visible'>
              {/* AI Message Branch Dropdown */}
              {role === 'assistant' && item.branchId && allBranches && switchBranch && (
                () => {
                  const aiMessageBranch = allBranches.find(b => b.id === item.branchId);
                  let branchesForDropdown: Branch[] = [];

                  if (aiMessageBranch) {
                    if (aiMessageBranch.parentBranchId && aiMessageBranch.forkedFromMessageId !== null) {
                      // This AI message is in a forked branch.
                      // Show parent and all sibling branches (including this one).
                      const parentBranch = allBranches.find(b => b.id === aiMessageBranch.parentBranchId);
                      if (parentBranch) {
                        branchesForDropdown.push(parentBranch);
                      }
                      const siblingBranches = allBranches.filter(
                        b => b.parentBranchId === aiMessageBranch.parentBranchId && b.forkedFromMessageId === aiMessageBranch.forkedFromMessageId
                      );
                      siblingBranches.forEach(sb => {
                        if (!branchesForDropdown.find(b => b.id === sb.id)) {
                          branchesForDropdown.push(sb);
                        }
                      });
                    } else {
                      // This AI message is in a root branch (no parent).
                      // Only show itself, or perhaps branches forked *from user messages within this root branch*.
                      // For simplicity now, if it's a root branch, the "versions" are less clear for an AI message.
                      // Let's ensure at least the current branch is listed if no clear fork point.
                      // A more advanced logic might find user messages in this branch that have been forked.
                      if (!branchesForDropdown.find(b => b.id === aiMessageBranch.id)) {
                        branchesForDropdown.push(aiMessageBranch);
                      }
                    }
                  }

                  branchesForDropdown.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

                  if (branchesForDropdown.length > 1) {
                    const menuItems = branchesForDropdown.map(branch => (
                      <Menu.Item key={branch.id} onClick={() => { if (branch.id !== currentBranchId) switchBranch(branch.id); }}>
                        {branch.name || `Branch ${branch.id.substring(0, 4)}`}{ (item.branchId === branch.id && currentBranchId === branch.id) ? ` (${t('current')})` : ""}
                        {/* Visual cue for the branch this AI message actually belongs to, vs current active branch */}
                        {/* For example, if current active branch is B1, but this A2 belongs to B2, mark B2 specially, and B1 as active. */}
                        {/* For now, just marking if the item in dropdown is the currently viewed global activeBranchId */}
                        {branch.id === currentBranchId && <CheckCircleOutlined style={{ marginLeft: '8px', color: 'green' }} />}
                      </Menu.Item>
                    ));
                    return (
                      <Dropdown overlay={<Menu>{menuItems}</Menu>} placement="topLeft">
                        <Button type="text" size="small">
                          <Space>
                            <SyncOutlined style={{ color: 'gray' }} />
                            <DownOutlined style={{ color: 'gray', fontSize: '10px' }} />
                          </Space>
                        </Button>
                      </Dropdown>
                    );
                  }
                  return null;
                }
              )()}
              <CopyToClipboard text={plainText} onCopy={() => {
                message.success(t('copySuccess'));
              }}>
                <Tooltip title={t('copy')}>
                  <Button type="text" size='small'>
                    <CopyOutlined style={{ color: 'gray' }} />
                  </Button>
                </Tooltip>
              </CopyToClipboard>
              <Tooltip title={t('retry')}>
                <Button type="text" size='small'
                  onClick={() => {
                    props.retryMessage(props.index - 1)
                  }}
                >
                  <SyncOutlined style={{ color: 'gray' }} />
                </Button>
              </Tooltip>
              <Tooltip title={t('delete')}>
                <Popconfirm
                  title={t('deleteNotice')}
                  description={t('currentMessageDelete')}
                  onConfirm={() => props.deleteMessage(props.index)}
                  okText={t('confirm')}
                  cancelText={t('cancel')}
                  placement='bottom'
                >
                  <Button type="text" size='small'>
                    <DeleteOutlined style={{ color: 'gray' }} />
                  </Button>
                </Popconfirm>
              </Tooltip>
              {props.item.totalTokens ? <>
                <span className='text-xs text-gray-500 ml-2'>Tokens:{props.item.totalTokens?.toLocaleString()}</span>
                <span className='text-xs text-gray-500 ml-2'>↑{props.item.inputTokens?.toLocaleString()}</span>
                <span className='text-xs text-gray-500 ml-2'>↓{props.item.outputTokens?.toLocaleString()}</span>
              </> :
                <Tooltip title={t('unknownUsage')}>
                  <span className='text-xs text-gray-500 ml-2'>Tokens: - </span>
                </Tooltip>
              }
            </div>
          </div>
        </div>
      </div>
    )
  }
});

MessageItem.displayName = 'MessageItem';
export default MessageItem
