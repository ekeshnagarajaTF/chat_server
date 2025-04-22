import React, { useState, useRef, useCallback } from 'react';
import Head from 'next/head';
import { StartTaskButtonBasic } from '../components/StartTaskButtonBasic';
import { useWebSocket } from '../contexts/WebSocketContext';
import ParticipantActionModal from '../components/Channel/ParticipantActionModal';

// Define message type for admin UI
interface Message {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderType: string;
  content: string;
  tags?: string[];
  timestamp: number;
}

// Define participant type for admin UI
interface Participant {
  id: string;
  name: string;
  type: string;
  window_hwnd?: number;
  commands?: Record<string, string | undefined>;
}

// Define shared data type
interface SharedData {
  id: string;
  type: 'string' | 'image' | 'document' | 'json';
  content: string;
  timestamp: number;
  error?: string;
}

export default function Home() {
  // WebSocket context
  const {
    messages,
    channelStatus,
    activeChannel,
    sendMessage,
    switchChannel,
    startChannel,
    stopChannel,
    isConnected,
    error: wsError,
    clearMessages
  } = useWebSocket();

  // UI-specific state
  const [messageContent, setMessageContent] = useState<string>('');
  const [sharedData, setSharedData] = useState<SharedData | null>(null);
  const [dataModalOpen, setDataModalOpen] = useState<boolean>(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [userScrolled, setUserScrolled] = useState<boolean>(false);
  
  // Participant action modal state
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
  const [participantModalOpen, setParticipantModalOpen] = useState<boolean>(false);

  // Scroll handling
  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  const handleScroll = () => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setUserScrolled(!isAtBottom);
    }
  };

  // Scroll to bottom when messages change, unless user has scrolled up
  React.useEffect(() => {
    if (!userScrolled) {
      scrollToBottom();
    }
  }, [messages, userScrolled]);

  // Handle channel change
  const handleChannelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    switchChannel(e.target.value);
  };

  // Handle channel operations
  const handleChannelOperation = (operation: 'start' | 'stop') => {
    if (operation === 'start') {
      startChannel();
    } else {
      stopChannel();
    }
  };

  // Handle message send
  const handleSendMessage = () => {
    if (!messageContent.trim() || !isConnected) return;
    fetch(`/api/channels/${activeChannel}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channelId: activeChannel,
        content: messageContent,
        senderName: 'Admin', // Replace with the desired sender name
      }),
    })
      .then(response => response.json())
      .then(data => {
        console.log('Message sent:', data);
      })
      .catch(error => {
        console.error('Error sending message:', error);
      });
    setMessageContent('');
    setUserScrolled(false);
  };

  // Handle data reference clicks
  const handleDataReferenceClick = async (dataId: string) => {
    try {
      const response = await fetch(`/api/data/${dataId}`);
      if (response.ok) {
        const result = await response.json();
        setSharedData(result.data);
        setDataModalOpen(true);
      }
    } catch (err) {
      console.error('Error fetching shared data:', err);
    }
  };

  // Handle participant click to open modal
  const handleParticipantClick = (participant: Participant) => {
    // Define standard command sets based on participant type
    const standardBotCommands = {
      restart: "^{F5}",  // Ctrl+F5
      pause: "^p",       // Ctrl+P
      stop: "^c",        // Ctrl+C
      resume: undefined  // Example of disabled command
    };

    // Add commands based on participant type
    const enhancedParticipant = { 
      ...participant,
      // Add commands based on participant type and existing commands
      commands: participant.type === 'bot' 
        ? { ...standardBotCommands, ...participant.commands }  // Use existing commands or provide defaults
        : participant.window_hwnd 
          ? { sendMessage: "^m", close: "^{F4}" } // Generic commands for non-bot windows 
          : {}
    };
    
    setSelectedParticipant(enhancedParticipant);
    setParticipantModalOpen(true);
  };

  // Handle retry click
  const handleRetryClick = (message: Message) => {
    if (!isConnected) return;
    
    // Ask for confirmation before proceeding
    const confirmRetry = window.confirm('Are you sure you want to retry this message?');
    if (!confirmRetry) return;

    // Find the JSON content in the original message
    const jsonRegex = /\[json\]([\s\S]*?)\[\/json\]/;
    const jsonMatch = message.content.match(jsonRegex);
    const jsonContent = jsonMatch ? jsonMatch[0] : '';


    // Create the retry message with the original sender tagged
    const retryMessage = `@${message.senderId} Retrying your request...\n${jsonContent}`;

    // Send the retry message
    fetch(`/api/channels/${activeChannel}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channelId: activeChannel,
        content: retryMessage,
        senderName: 'Admin',
      }),
    })
      .then(response => response.json())
      .then(data => {
        console.log('Retry message sent:', data);
      })
      .catch(error => {
        console.error('Error sending retry message:', error);
      });
  };

  // Expose handleRetryClick to window object
  React.useEffect(() => {
    (window as any).handleRetryClick = handleRetryClick;
    return () => {
      delete (window as any).handleRetryClick;
    };
  }, [handleRetryClick]);

  // Render message content with data reference links
  const renderMessageContent = (content: string, message?: Message) => {
    // First check for data references [id: xxx]
    const dataRefRegex = /\[id:\s*([a-zA-Z0-9_]+)\]/g;
    const dataRefParts = content.split(dataRefRegex);

    // If there are no data references, check for JSON content and Retry tags
    if (dataRefParts.length <= 1) {
      let processedContent = content;
      const jsonSegments: Record<string, any> = {};
      let index = 0;

      // Process JSON tags first
      const jsonRegex = /\[json\]([\s\S]*?)\[\/json\]/g;
      processedContent = processedContent.replace(jsonRegex, (match, jsonContent) => {
        try {
          const jsonData = JSON.parse(jsonContent);
          const jsonId = `inline-json-${index++}`;
          jsonSegments[jsonId] = jsonData;
          return '[JSON data]';
        } catch (err) {
          console.error('Error parsing inline JSON:', err);
          return match;
        }
      });

      // Split content into parts by both JSON data and Retry tags
      const parts = processedContent.split(/(\[JSON data\])|(\[Retry\])/);
      
      // Filter out empty strings and map each part to appropriate React component
      return parts.filter(Boolean).map((part, idx) => {
        if (part === '[JSON data]') {
          const jsonId = `inline-json-${Math.floor(idx/2)}`;
          return (
            <React.Fragment key={`json-${idx}`}>
              <span>[</span>
              <a
                href="#"
                className="text-blue-600 underline"
                onClick={(e) => {
                  e.preventDefault();
                  setSharedData({
                    id: jsonId,
                    type: 'json',
                    content: JSON.stringify(jsonSegments[jsonId], null, 2),
                    timestamp: Date.now()
                  });
                  setDataModalOpen(true);
                }}
              >
                JSON data
              </a>
              <span>]</span>
            </React.Fragment>
          );
        } else if (part === '[Retry]' && message) {
          return (
            <>[
            <a
              key={`retry-${idx}`}
              href="#"
              className="text-blue-600 underline"
              onClick={(e) => {
                e.preventDefault();
                handleRetryClick(message);
              }}
            >
              Retry
            </a>
            ]</>
          );
        }
        return <span key={`text-${idx}`}>{part}</span>;
      });
    }

    // Process data references
    const matches = Array.from(content.matchAll(dataRefRegex));
    const result = [];

    for (let i = 0; i < dataRefParts.length; i++) {
      // Add the text part
      if (dataRefParts[i]) {
        result.push(<span key={`text-${i}`}>{dataRefParts[i]}</span>);
      }

      // Add the data reference link if there's a corresponding match
      const matchIndex = Math.floor(i / 2);
      if (matches[matchIndex]) {
        const dataId = matches[matchIndex][1];
        result.push(
          <React.Fragment key={`data-${i}`}>
            <span>[</span>
            <a
              href="#"
              className="text-blue-600 underline"
              onClick={(e) => {
                e.preventDefault();
                handleDataReferenceClick(dataId);
              }}
            >
              Data: {dataId}
            </a>
            <span>]</span>
          </React.Fragment>
        );
      }
    }

    return result;
  };

  // Data modal component
  const DataModal = ({ data, onClose }: { data: SharedData, onClose: () => void }) => {
    if (!data) return null;

    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
          <div className="p-4 border-b flex justify-between items-center">
            <h3 className="text-lg font-medium">Shared Data</h3>
            <button
              className="text-gray-400 hover:text-gray-500"
              onClick={onClose}
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-4 flex-1 overflow-auto">
            {data.type === 'image' ? (
              <div className="flex justify-center">
                <img
                  src={data.content.startsWith('data:') ? data.content : `/api/data/${data.id}`}
                  alt="Shared Image"
                  className="max-w-full max-h-[60vh] object-contain"
                />
              </div>
            ) : data.type === 'json' ? (
              <pre className="bg-gray-50 p-4 rounded overflow-auto whitespace-pre-wrap">
                {JSON.stringify(JSON.parse(data.content), null, 2)}
              </pre>
            ) : (
              <div className="whitespace-pre-wrap break-all">
                {data.content}
              </div>
            )}
          </div>

          <div className="p-4 border-t">
            <div className="text-xs text-gray-500">
              Type: {data.type} • Shared at: {new Date(data.timestamp).toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>AI-DO Admin</title>
        <meta name="description" content="AI-DO Admin Interface" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="container mx-auto px-2 py-3 max-w-7xl">
        <header className="bg-white shadow-sm rounded-md p-3 mb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-bold text-gray-800 pb-1">AI-DO Admin</h1>
              <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-sm text-gray-600">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <div className="flex items-center space-x-2">
            {channelStatus.active ? (
                  <button
                    onClick={() => handleChannelOperation('stop')}
                    className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-yellow-500"
                    disabled={!isConnected}
                  >
                    Stop Channel
                  </button>
                ) : (
                  <button
                    onClick={() => handleChannelOperation('start')}
                    className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-green-500"
                    disabled={!isConnected}
                  >
                    Start Channel
                  </button>
                )}              
            </div>
          </div>
          {wsError && (
            <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-2 mt-2 text-sm rounded">
              {wsError.message}
            </div>
          )}
        </header>

        <div className="grid grid-cols-12 gap-3">
          {/* Left Sidebar - Bot Information & Participants */}
          <div className="col-span-12 md:col-span-3 lg:col-span-2">

            <div className="bg-white shadow-sm rounded-md p-3">
              <h2 className="text-md font-bold text-gray-700 mb-2">Participants</h2>
              <div className="space-y-1.5">
                {channelStatus.participants.length > 0 ? (
                  channelStatus.participants.map((participant) => {
                    const isBot = participant.type === 'bot';
                    const hasWindow = !!participant.window_hwnd;
                    
                    return (
                      <div 
                        key={participant.id} 
                        className={`p-1.5 rounded text-xs cursor-pointer transition-colors flex justify-between items-center ${
                          isBot ? 'bg-blue-50 hover:bg-blue-100' : 'bg-gray-50 hover:bg-gray-100'
                        }`}
                        onClick={() => handleParticipantClick(participant)}
                        title={`Click to manage participant ${isBot ? 'and send commands' : ''}`}
                      >
                        <div className="font-medium flex items-center">
                          {isBot && (
                            <span className="inline-block w-2 h-2 bg-blue-400 rounded-full mr-1.5" />
                          )}
                          {participant.name}
                        </div>
                        <div className="flex space-x-1">
                          {hasWindow && (
                            <span className="text-xs bg-blue-100 text-blue-800 px-1 rounded">
                              HWND
                            </span>
                          )}
                          {isBot && (
                            <span className="text-xs bg-green-100 text-green-800 px-1 rounded">
                              Bot
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-gray-500 text-xs">No participants yet</div>
                )}
                <div className="text-gray-500 text-xs mt-1 italic">Click on participants to manage</div>
              </div>
            </div>

            {/* Tools section disabled
            <div className="bg-white shadow-sm rounded-md p-3 mt-3">
              <h2 className="text-md text-gray-700 mb-2 font-bold">Tools</h2>
              <div className="space-y-1.5 mb-2">
                <a
                  href="/filebrowser"
                  className="block text-sm text-indigo-700 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  File Browser
                </a>
              </div>
              <div className="space-y-1.5 mb-2">
                <a
                  href="/servicemanager"
                  className="block text-sm text-indigo-700 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Service Manager
                </a>
              </div>
              <div className="space-y-1.5 mb-2">
                <a
                  href="/tasks"
                  className="block text-sm text-indigo-700 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Tasks
                </a>
              </div>
              <div className="space-y-1.5 mb-2">
                <a
                  href="/settings"
                  className="block text-sm text-indigo-700 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Settings
                </a>
              </div>
            </div>
            */}
          </div>

          {/* Center Area - Chat View */}
          <div className="col-span-12 md:col-span-9 lg:col-span-10 bg-gray-900 shadow-sm rounded-md flex flex-col">
            {/* Channel Controls */}
            <div className="border-b border-gray-700 p-2 flex items-center justify-between bg-gray-800">
              <div className="flex-1 max-w-md">
                <div className="flex items-center space-x-2">
                  <label htmlFor="channelId" className="block text-xs font-medium text-gray-300 whitespace-nowrap">
                    Channel:
                  </label>
                  <div className="flex-1">
                    <select
                      name="channelId"
                      id="channelId"
                      className="focus:ring-blue-500 focus:border-blue-500 block w-full rounded-sm text-xs border-gray-700 bg-gray-700 text-gray-200 h-6 appearance-none px-2"
                      value={activeChannel}
                      onChange={handleChannelChange}
                      style={{ backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%239ca3af' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundPosition: "right 0.25rem center", backgroundRepeat: "no-repeat", backgroundSize: "1rem 1rem", paddingRight: "2rem" }}
                    >
                      <option value={activeChannel}>{activeChannel}</option>
                      <option value="general">general</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="flex space-x-1 ml-2">
                <StartTaskButtonBasic
                  className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none"
                  isChannelActive={channelStatus.active}
                />
                <button
                  onClick={clearMessages}
                  className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none"
                >
                  Clear
                </button>
                
              </div>
            </div>

            {/* Messages */}
            <div
              ref={messagesContainerRef}
              onScroll={handleScroll}
              className="p-3 overflow-y-auto h-[500px] font-mono text-sm bg-gray-900 text-gray-100"
            >
              <div className="space-y-1">
                {messages.length > 0 ? (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className="text-left"
                    >
                      {message.senderId === 'system' ? (
                        <div className="text-gray-400">
                          {renderMessageContent(message.content, message)}
                        </div>
                      ) : (
                        <div>
                          <span className={`${message.senderType === 'server' ? 'text-cyan-300' : 'text-green-300'} mr-2`}>
                            {message.senderName}:
                          </span>
                          <span className="text-gray-100">
                            {renderMessageContent(message.content, message)}
                          </span>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-gray-500 text-sm">No messages yet</div>
                )}
              </div>
            </div>

            {/* Message Input */}
            <div className="border-t border-gray-700 p-3 bg-gray-800">
              <div className="flex items-center space-x-2">
                <input
                  id="messageInput"
                  type="text"
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleSendMessage();
                    }
                  }}
                  placeholder="Type a message as Admin..."
                  className="block w-full rounded-md border-0 bg-gray-700 text-gray-100 text-sm py-2 px-3 h-10 shadow-sm focus:ring-1 focus:ring-blue-500"
                  disabled={!isConnected || !channelStatus.active}
                />

                <button
                  onClick={handleSendMessage}
                  className="inline-flex items-center px-3 py-2 h-10 border border-transparent text-xs font-medium rounded text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  disabled={!isConnected || !channelStatus.active || !messageContent.trim()}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Data view modal */}
      {dataModalOpen && sharedData && (
        <DataModal
          data={sharedData}
          onClose={() => {
            setDataModalOpen(false);
            setSharedData(null);
          }}
        />
      )}

      {/* Participant action modal */}
      <ParticipantActionModal
        isOpen={participantModalOpen}
        onClose={() => setParticipantModalOpen(false)}
        participant={selectedParticipant}
      />
    </div>
  );
} 