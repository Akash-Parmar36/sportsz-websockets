import { WebSocket , WebSocketServer } from "ws";
import { wsArcjet } from "../arcjet.js";

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
    const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 }); // 1MB max payload
    
    server.on('upgrade', async (req, socket, head) => {
        const { pathname } = new URL(req.url, `http://${req.headers.host}`);

        if (pathname !== '/ws') {
            socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
            socket.destroy();
            return;
        }

        if (wsArcjet) {
            try {
                const decision = await wsArcjet.protect(req);

                if (decision.isDenied()) {
                    if (decision.reason.isRateLimit()) {
                        socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
                    } else {
                        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
                    }
                    socket.destroy();
                    return;
                }
            } catch (e) {
                console.error('WS upgrade protection error', e);
                socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
                socket.destroy();
                return;
            }
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
        });
    });

    wss.on('connection', (socket, req) => {
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

