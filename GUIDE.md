When you start a session (startSession() in App.jsx), it:
- Fetches a token from your server's /token endpoint
- Creates a WebRTC peer connection
- Sets up audio streaming
- Establishes a data channel for communication

***

To change the voice, modify the token generation in server.js.

***

https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/ai-services/openai/realtime-audio-reference.md#realtimevoice

***



