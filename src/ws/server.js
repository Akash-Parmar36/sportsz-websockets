import { WebSocket , WebSocketServer } from "ws";

function sendJson(socket, payload){
    if(socket.readyState !== WebSocket.OPEN) {
        console.warn("WebSocket is not open");
        return;
    }
    socket.send(JSON.stringify(payload));
}

function broadcast(wss, payload){
    for(const client of wss.clients){
        sendJson(client, payload);
    }
}

export function attachWebSocketServer(server) {
    const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 * 1024 }); // 1MB max payload

    wss.on('connection', (socket) => {
        socket.isAlive = true;
        socket.on('pong', () => { socket.isAlive = true; });

        sendJson(socket, { type: 'welcome', message: 'Connected to live match updates' });
        socket.on('error', console.error);
    });
    
    const heartbeatInterval = setInterval(() => {
                for (const client of wss.clients) {
                    if (!client.isAlive) {
                        client.terminate();
                        continue;
                    }
                    client.isAlive = false;
                    client.ping();
                }
    }, 30000);

    wss.on('close', () => clearInterval(heartbeatInterval));

    function broadcastMatchCreated(match) {
        broadcast(wss, { type: 'match_created', data: match });
    }
    
    return { broadcastMatchCreated };  
}

