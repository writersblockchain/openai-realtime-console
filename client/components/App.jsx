// App.jsx
import { useEffect, useRef, useState } from "react";
import logo from "/assets/openai-logomark.svg";
import SessionControls from "./SessionControls";

export default function App() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [dataChannel, setDataChannel] = useState(null);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [liveUserTranscript, setLiveUserTranscript] = useState("");
  const [liveAssistantTranscript, setLiveAssistantTranscript] = useState("");
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
            setLiveUserTranscript(prev => {
              const newTranscript = prev + event.delta;
              // Check for sentence endings (., ?, !)
              if (event.delta.match(/[.!?]\s*$/)) {
                // Add the completed sentence to conversation history
                setConversationHistory(prev => [...prev, {
                  role: "user",
                  text: newTranscript.trim(),
                  timestamp: event.timestamp,
                  id: crypto.randomUUID()
                }]);
                // Reset the live transcript
                return "";
              }
              return newTranscript;
            });
            break;

          case "response.audio_transcript.delta":
            // If this is a new response, start accumulating a new response
            if (event.response_id !== currentResponseId.current) {
              // If there was a previous response in progress, save it
              if (liveAssistantTranscript.trim()) {
                setConversationHistory(prev => [...prev, {
                  role: "assistant",
                  text: liveAssistantTranscript.trim(),
                  timestamp: event.timestamp,
                  id: currentResponseId.current || crypto.randomUUID()
                }]);
              }
              currentResponseId.current = event.response_id;
              setLiveAssistantTranscript(event.delta);
            } else {
              // Continue accumulating the current response
              setLiveAssistantTranscript(prev => prev + event.delta);
            }
            break;

          case "conversation.item.audio_transcription.completed":
            if (liveUserTranscript.trim()) {
              setConversationHistory(prev => [...prev, {
                role: "user",
                text: liveUserTranscript.trim(),
                timestamp: event.timestamp,
                id: crypto.randomUUID()
              }]);
              setLiveUserTranscript("");
            }
            break;

          case "response.audio_transcript.completed":
            if (liveAssistantTranscript.trim()) {
              setConversationHistory(prev => [...prev, {
                role: "assistant",
                text: liveAssistantTranscript.trim(),
                timestamp: event.timestamp,
                id: currentResponseId.current || crypto.randomUUID()
              }]);
              setLiveAssistantTranscript("");
              currentResponseId.current = null;
            }
            break;

          default:
            console.log("Server Event:", event);
        }
      });

      dataChannel.addEventListener("open", () => {
        setIsSessionActive(true);
        setLiveUserTranscript("");
        setLiveAssistantTranscript("");
        currentResponseId.current = null;
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
  }, [conversationHistory, liveUserTranscript, liveAssistantTranscript]);

  return (
    <>
      <nav className="absolute top-0 left-0 right-0 h-16 flex items-center">
        <div className="flex items-center gap-4 w-full m-4 pb-2 border-0 border-b border-solid border-green-500">
          <img style={{ width: "24px" }} src={logo} />
          <h1>realtime console</h1>
        </div>
      </nav>
      <main className="absolute top-16 left-0 right-0 bottom-0">
        <section className="absolute top-0 left-0 right-0 bottom-0 flex">
          <section className="absolute top-0 left-0 right-0 bottom-32 px-4 overflow-y-auto">
            <div className="flex flex-col gap-4 p-4">
              {conversationHistory.map((message) => (
                <div 
                  key={message.id}
                  className={`p-4 rounded-lg ${
                    message.role === "user" 
                      ? "bg-green-900/20 border border-green-500" 
                      : "bg-blue-900/20 border border-blue-500"
                  }`}
                >
                  <div className="text-xs text-gray-400 mb-1">
                    {message.role === "user" ? "You" : "Assistant"} • {message.timestamp}
                  </div>
                  <div className="text-green-500">{message.text}</div>
                </div>
              ))}
              {liveUserTranscript && (
                <div className="p-4 rounded-lg bg-green-900/20 border border-green-500">
                  <div className="text-xs text-gray-400 mb-1">You • Live</div>
                  <div className="text-green-500">
                    {liveUserTranscript}<span className="animate-pulse">▋</span>
                  </div>
                </div>
              )}
              {liveAssistantTranscript && (
                <div className="p-4 rounded-lg bg-blue-900/20 border border-blue-500">
                  <div className="text-xs text-gray-400 mb-1">Assistant • Live</div>
                  <div className="text-green-500">
                    {liveAssistantTranscript}<span className="animate-pulse">▋</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </section>
          <section className="absolute h-32 left-0 right-0 bottom-0 p-4">
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
