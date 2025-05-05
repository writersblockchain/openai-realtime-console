// App.jsx
import { useEffect, useRef, useState } from "react";
import logo from "/assets/openai-logomark.svg";
import SessionControls from "./SessionControls";

export default function App() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [dataChannel, setDataChannel] = useState(null);
  const [conversationHistory, setConversationHistory] = useState([]);
  const peerConnection = useRef(null);
  const audioElement = useRef(null);
  const currentResponseId = useRef(null);

  async function startSession() {
    const tokenResponse = await fetch("/token");
    const data = await tokenResponse.json();
    const EPHEMERAL_KEY = data.client_secret.value;

    const pc = new RTCPeerConnection();

    audioElement.current = document.createElement("audio");
    audioElement.current.autoplay = true;
    pc.ontrack = (e) => (audioElement.current.srcObject = e.streams[0]);

    const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
    pc.addTrack(ms.getTracks()[0]);

    const dc = pc.createDataChannel("oai-events");
    setDataChannel(dc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const baseUrl = "https://api.openai.com/v1/realtime";
    const model = "gpt-4o-realtime-preview-2024-12-17";
    const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${EPHEMERAL_KEY}`,
        "Content-Type": "application/sdp",
      },
    });

    const answer = {
      type: "answer",
      sdp: await sdpResponse.text(),
    };
    await pc.setRemoteDescription(answer);

    peerConnection.current = pc;
  }

  function stopSession() {
    if (dataChannel) dataChannel.close();

    peerConnection.current.getSenders().forEach((sender) => {
      if (sender.track) sender.track.stop();
    });

    if (peerConnection.current) peerConnection.current.close();

    setIsSessionActive(false);
    setDataChannel(null);
    peerConnection.current = null;
  }

  function sendClientEvent(message) {
    if (dataChannel) {
      const timestamp = new Date().toLocaleTimeString();
      message.event_id = message.event_id || crypto.randomUUID();
      message.timestamp = timestamp;
      dataChannel.send(JSON.stringify(message));
      console.log("Client Event:", message);
    } else {
      console.error("Failed to send message - no data channel available", message);
    }
  }

  useEffect(() => {
    if (dataChannel) {
      dataChannel.addEventListener("message", (e) => {
        const event = JSON.parse(e.data);
        if (!event.timestamp) event.timestamp = new Date().toLocaleTimeString();

        switch (event.type) {
          case "conversation.item.input_audio_transcription.delta":
            setConversationHistory(prev => {
              const last = prev[prev.length - 1];
              // If last message is a live user message, append delta
              if (last && last.role === "user" && last.isLive) {
                return [
                  ...prev.slice(0, -1),
                  { ...last, text: last.text + event.delta }
                ];
              } else {
                // Otherwise, add a new live user message
                return [
                  ...prev,
                  {
                    role: "user",
                    text: event.delta,
                    timestamp: event.timestamp,
                    id: crypto.randomUUID(),
                    isLive: true
                  }
                ];
              }
            });
            break;

          case "response.audio_transcript.delta":
            setConversationHistory(prev => {
              // Find the most recent live assistant message with the same response_id
              const idx = [...prev].reverse().findIndex(
                msg => msg.role === "assistant" && msg.isLive && msg.response_id === event.response_id
              );
              if (idx !== -1) {
                // idx is from the end, so convert to forward index
                const realIdx = prev.length - 1 - idx;
                const updated = [...prev];
                updated[realIdx] = {
                  ...updated[realIdx],
                  text: updated[realIdx].text + event.delta
                };
                return updated;
              }
              // Otherwise, add a new live assistant message
              return [
                ...prev,
                {
                  role: "assistant",
                  text: event.delta,
                  timestamp: event.timestamp,
                  id: event.response_id || crypto.randomUUID(),
                  isLive: true,
                  response_id: event.response_id
                }
              ];
            });
            currentResponseId.current = event.response_id;
            break;

          case "conversation.item.audio_transcription.completed":
            setConversationHistory(prev => {
              const last = prev[prev.length - 1];
              if (last && last.role === "user" && last.isLive) {
                return [
                  ...prev.slice(0, -1),
                  { ...last, isLive: false, timestamp: event.timestamp }
                ];
              }
              return prev;
            });
            break;

          case "response.audio_transcript.completed":
            setConversationHistory(prev => {
              // Find the most recent live assistant message with the same response_id
              const idx = [...prev].reverse().findIndex(
                msg => msg.role === "assistant" && msg.isLive && msg.response_id === event.response_id
              );
              if (idx !== -1) {
                const realIdx = prev.length - 1 - idx;
                const updated = [...prev];
                updated[realIdx] = {
                  ...updated[realIdx],
                  isLive: false,
                  timestamp: event.timestamp
                };
                return updated;
              }
              return prev;
            });
            currentResponseId.current = null;
            break;

          default:
            console.log("Server Event:", event);
        }
      });

      dataChannel.addEventListener("open", () => {
        setIsSessionActive(true);
        dataChannel.send(
          JSON.stringify({
            type: "session.update",
            session: {
              input_audio_transcription: { model: "whisper-1" },
              turn_detection: {
                type: "server_vad",
                threshold: 0.4,
                silence_duration_ms: 600,
              },
            },
          })
        );
      });
    }
  }, [dataChannel]);

  // Auto-scroll to bottom when new messages arrive
  const messagesEndRef = useRef(null);
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => {
    scrollToBottom();
  }, [conversationHistory]);

  return (
    <>
      <nav className="absolute top-0 left-0 right-0 h-16 flex items-center">
        <div className="flex items-center gap-4 w-full m-4 pb-2 border-0 border-b border-solid border-green-500">
          <img style={{ width: "24px" }} src={logo} />
          <h1>realtime console</h1>
        </div>
      </nav>
      <main className="absolute top-16 left-0 right-0 bottom-0">
        <section className="flex flex-col h-full w-full">
          <div className="flex flex-row flex-1 h-full w-full">
            {/* OpenAI Non-Confidential Column */}
            <div className="w-1/2 h-full border-r border-green-500 bg-black/90 flex flex-col">
              <div className="p-4 border-b border-green-500">
                <h2 className="text-green-400 text-lg font-bold tracking-widest">OpenAI (Non-Confidential)</h2>
                <p className="text-xs text-green-700 mt-1">Your data is visible and stored on centralized servers.</p>
              </div>
              <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
                {(() => {
                  // Sort messages by timestamp
                  const sortedHistory = [...conversationHistory].sort((a, b) => {
                    const dateA = new Date(`1970-01-01T${a.timestamp}`);
                    const dateB = new Date(`1970-01-01T${b.timestamp}`);
                    return dateA - dateB;
                  });
                  const turns = [];
                  for (const msg of sortedHistory) {
                    const lastTurn = turns[turns.length - 1];
                    if (!lastTurn) {
                      if (msg.role === "user") {
                        turns.push({ userMsg: msg, agentMsg: null });
                      } else {
                        turns.push({ userMsg: null, agentMsg: msg });
                      }
                    } else {
                      if (
                        (msg.role === "user" && lastTurn.userMsg && !lastTurn.agentMsg) ||
                        (msg.role === "assistant" && lastTurn.agentMsg && !lastTurn.userMsg)
                      ) {
                        continue;
                      }
                      if (msg.role === "user" && !lastTurn.userMsg) {
                        lastTurn.userMsg = msg;
                      } else if (msg.role === "assistant" && !lastTurn.agentMsg) {
                        lastTurn.agentMsg = msg;
                      } else {
                        if (msg.role === "user") {
                          turns.push({ userMsg: msg, agentMsg: null });
                        } else {
                          turns.push({ userMsg: null, agentMsg: msg });
                        }
                      }
                    }
                  }
                  return turns.map((turn, idx) => (
                    <div key={idx} className="flex flex-col gap-2">
                      {turn.userMsg && (
                        <div className={"p-4 rounded-lg bg-green-900/20 border border-green-500"}>
                          <div className="text-xs text-gray-400 mb-1">
                            You • {turn.userMsg.timestamp}
                          </div>
                          <div className="text-green-500">{turn.userMsg.text}</div>
                        </div>
                      )}
                      {turn.agentMsg && (
                        <div className={"p-4 rounded-lg bg-blue-900/20 border border-blue-500"}>
                          <div className="text-xs text-gray-400 mb-1">
                            Assistant • {turn.agentMsg.timestamp}
                          </div>
                          <div className="text-green-500">{turn.agentMsg.text}</div>
                        </div>
                      )}
                    </div>
                  ));
                })()}
                <div ref={messagesEndRef} />
              </div>
            </div>
            {/* Secret Network Confidential Column */}
            <div className="w-1/2 h-full border-l border-cyan-400 bg-black/95 flex flex-col">
              <div className="p-4 border-b border-cyan-400">
                <h2 className="text-cyan-400 text-lg font-bold tracking-widest" style={{textShadow: '0 0 8px #00fff7'}}>Secret Network (Confidential)</h2>
                <p className="text-xs text-cyan-300 mt-1">Your data is encrypted, private, and secure. Only you can access it.</p>
              </div>
              <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
                {(() => {
                  // Sort messages by timestamp
                  const sortedHistory = [...conversationHistory].sort((a, b) => {
                    const dateA = new Date(`1970-01-01T${a.timestamp}`);
                    const dateB = new Date(`1970-01-01T${b.timestamp}`);
                    return dateA - dateB;
                  });
                  const turns = [];
                  for (const msg of sortedHistory) {
                    const lastTurn = turns[turns.length - 1];
                    if (!lastTurn) {
                      if (msg.role === "user") {
                        turns.push({ userMsg: msg, agentMsg: null });
                      } else {
                        turns.push({ userMsg: null, agentMsg: msg });
                      }
                    } else {
                      if (
                        (msg.role === "user" && lastTurn.userMsg && !lastTurn.agentMsg) ||
                        (msg.role === "assistant" && lastTurn.agentMsg && !lastTurn.userMsg)
                      ) {
                        continue;
                      }
                      if (msg.role === "user" && !lastTurn.userMsg) {
                        lastTurn.userMsg = msg;
                      } else if (msg.role === "assistant" && !lastTurn.agentMsg) {
                        lastTurn.agentMsg = msg;
                      } else {
                        if (msg.role === "user") {
                          turns.push({ userMsg: msg, agentMsg: null });
                        } else {
                          turns.push({ userMsg: null, agentMsg: msg });
                        }
                      }
                    }
                  }
                  // Veil effect: blur and cyberpunk style
                  return turns.map((turn, idx) => (
                    <div key={idx} className="flex flex-col gap-2">
                      {turn.userMsg && (
                        <div className="p-4 rounded-lg border border-cyan-400 bg-cyan-900/10 shadow-cyberpunk relative overflow-hidden">
                          <div className="text-xs text-cyan-300 mb-1" style={{textShadow: '0 0 4px #00fff7'}}>
                            You • {turn.userMsg.timestamp}
                          </div>
                          <div className="text-cyan-200 blur-sm select-none" style={{filter: 'blur(6px) brightness(1.2)'}}>
                            {turn.userMsg.text}
                          </div>
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span className="text-cyan-400 font-mono text-xs bg-black/80 px-2 py-1 rounded shadow-cyberpunk border border-cyan-400" style={{textShadow: '0 0 8px #00fff7'}}>Confidential</span>
                          </div>
                        </div>
                      )}
                      {turn.agentMsg && (
                        <div className="p-4 rounded-lg border border-cyan-400 bg-cyan-900/10 shadow-cyberpunk relative overflow-hidden">
                          <div className="text-xs text-cyan-300 mb-1" style={{textShadow: '0 0 4px #00fff7'}}>
                            Assistant • {turn.agentMsg.timestamp}
                          </div>
                          <div className="text-cyan-200 blur-sm select-none" style={{filter: 'blur(6px) brightness(1.2)'}}>
                            {turn.agentMsg.text}
                          </div>
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span className="text-cyan-400 font-mono text-xs bg-black/80 px-2 py-1 rounded shadow-cyberpunk border border-cyan-400" style={{textShadow: '0 0 8px #00fff7'}}>Confidential</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ));
                })()}
                <div ref={messagesEndRef} />
              </div>
            </div>
          </div>
          <section className="h-32 w-full p-4">
            <SessionControls
              startSession={startSession}
              stopSession={stopSession}
              isSessionActive={isSessionActive}
            />
          </section>
        </section>
      </main>
    </>
  );
}
