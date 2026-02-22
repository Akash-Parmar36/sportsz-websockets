import { WebSocket , WebSocketServer } from "ws";
import { wsArcjet } from "../arcjet.js";

const matchSubscribers = new Map();// matchId -> Set of WebSocket connections

function subscribe(matchId, socket) {
    if(!matchSubscribers.has(matchId)) {
        matchSubscribers.set(matchId, new Set());
    }

    matchSubscribers.get(matchId).add(socket);
}

function unsubscribe(matchId, socket) {
    const subscribers = matchSubscribers.get(matchId);

    if(!subscribers) return;

    subscribers.delete(socket);

    if(subscribers.size === 0) {
        matchSubscribers.delete(matchId);
    }
}

function cleanupSubscriptions(socket) {
    for(const matchId of socket.subscriptions) {
        unsubscribe(matchId, socket);
    }
}



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

 function broadcastToAll(wss, payload){
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



function broadcastToMatch(matchId, payload) {
    const subscribers = matchSubscribers.get(matchId);
    if(!subscribers || subscribers.size === 0) return;

    let message;
    try {
        message = JSON.stringify(payload);
    } catch (err) {
        console.error("Failed to serialize match broadcast payload", err);
        return;
    }

    for(const client of subscribers) {
        if(client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    }
}

function handleMessage(socket, data) {
    let message;

    try {
        message = JSON.parse(data.toString());
    } catch {
       sendJson(socket, { type: 'error', message: 'Invalid JSON' });
       return;       
    }

    if(message?.type === "subscribe" && Number.isInteger(message.matchId)) {
        subscribe(message.matchId, socket);
        socket.subscriptions.add(message.matchId);
        sendJson(socket, { type: 'subscribed', matchId: message.matchId });
        return;
    }

    if(message?.type === "unsubscribe" && Number.isInteger(message.matchId)) {
        unsubscribe(message.matchId, socket);
        socket.subscriptions.delete(message.matchId);
        sendJson(socket, { type: 'unsubscribed', matchId: message.matchId });
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
        console.log('WebSocket client connected', req.socket.remoteAddress);
        console.log('Total connected clients:', wss.clients.size);
        

        socket.isAlive = true;
        socket.on('pong', () => { socket.isAlive = true; });

        socket.subscriptions = new Set();
        
        sendJson(socket, { type: 'welcome', message: 'Connected to live match updates' });
        
        socket.on('message', (data) => {
            handleMessage(socket, data);
        });

        socket.on('error', () => {
            socket.terminate();
        });

        socket.on('close', () => {
            cleanupSubscriptions(socket);
        })
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
        broadcastToAll(wss, { type: 'match_created', data: match });
    }

    function broadcastCommentary(matchId, comment) {
        broadcastToMatch(matchId, { type: 'commentary', data: comment });
    }
    
    return { broadcastMatchCreated, broadcastCommentary };  
}

