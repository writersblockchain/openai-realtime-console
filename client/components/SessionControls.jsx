import { useState } from "react";
import { CloudLightning, CloudOff } from "react-feather";
import Button from "./Button";

function SessionStopped({ startSession }) {
  const [isActivating, setIsActivating] = useState(false);

  function handleStartSession() {
    if (isActivating) return;

    setIsActivating(true);
    startSession();
  }

  return (
    <div className="flex items-center justify-center w-full h-full">
      <Button
        onClick={handleStartSession}
        className={isActivating ? "bg-green-900" : "bg-black"}
        icon={<CloudLightning height={16} />}
      >
        {isActivating ? "starting session..." : "start session"}
      </Button>
    </div>
  );
}

function SessionActive({ stopSession }) {
  return (
    <div className="flex items-center justify-center w-full h-full">
      <Button onClick={stopSession} icon={<CloudOff height={16} />}>
        disconnect
      </Button>
    </div>
  );
}

export default function SessionControls({
  startSession,
  stopSession,
  isSessionActive,
}) {
  return (
    <div className="flex gap-4 border-t-2 border-green-500 h-full">
      {isSessionActive ? (
        <SessionActive stopSession={stopSession} />
      ) : (
        <SessionStopped startSession={startSession} />
      )}
    </div>
  );
}
