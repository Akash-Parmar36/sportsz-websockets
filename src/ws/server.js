import { WebSocket , WebSocketServer } from "ws";

function sendJson(socket, payload){
    if(socket.readyState !== WebSocket.OPEN) {
        console.warn("WebSocket is not open");
        return;
    }
    
    let message;
    
    try {
        message = JSON.stringify(payload);
    } catch (err) {
        console.warn("Failed to serialize WS payload", err);
        return;
    }

    socket.send(message, (err) => {
        if (err) console.warn("Failed to send WS payload", err);
    });
}

 function broadcast(wss, payload){
    let message;
    try {
        message = JSON.stringify(payload);
    } catch (err) {
        console.error("Failed to serialize broadcast payload", err);
        return;
    }

    for(const client of wss.clients){
        if(client.readyState !== WebSocket.OPEN) {
            continue;
        }
        client.send(message);
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
                    if (client.readyState !== WebSocket.OPEN) {
                        client.terminate();
                        continue;
                    }

                    if (!client.isAlive) {
                        client.terminate();
                        continue;
                    }

                    client.isAlive = false;
                    client.ping();
                }
    }, 30000);
    
    wss.on('close', () => clearInterval(heartbeatInterval));
    
    server.on('close', () => {
        clearInterval(heartbeatInterval);
        wss.close();
    });

    function broadcastMatchCreated(match) {
        broadcast(wss, { type: 'match_created', data: match });
    }
    
    return { broadcastMatchCreated };  
}

