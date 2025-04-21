// EventLog.jsx
import { ArrowUp, ArrowDown } from "react-feather";
import { useState } from "react";

function Event({ event, timestamp }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isUserTranscript = event.type === "user_transcript";
  const isClient = event.event_id && !event.event_id.startsWith("event_");

  return (
    <div className="flex flex-col gap-2 p-2 rounded-none border border-green-500 bg-black">
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        {isUserTranscript ? (
          <ArrowUp className="text-green-500" />
        ) : isClient ? (
          <ArrowDown className="text-green-500" />
        ) : (
          <ArrowUp className="text-green-500" />
        )}
        <div className="text-sm text-green-500">
          {isUserTranscript ? "user:" : isClient ? "client:" : "server:"} &nbsp;{event.type} | {timestamp}
        </div>
      </div>
      <div
        className={`text-green-500 bg-black p-2 border border-green-500 overflow-x-auto ${
          isExpanded ? "block" : "hidden"
        }`}
      >
        <pre className="text-xs">{JSON.stringify(event, null, 2)}</pre>
      </div>
    </div>
  );
}

export default function EventLog({ events }) {
  return (
    <div className="flex flex-col gap-2 overflow-x-auto">
      {events.map((event, i) => (
        <Event key={i} event={event} timestamp={event.timestamp} />
      ))}
    </div>
  );
}
