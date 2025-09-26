import { LightningElement } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import SIGNALR from '@salesforce/resourceUrl/rocketphone__signalr';
import beaconAccess from '@salesforce/apex/TestLWCConnection.beaconAccess';

const LogTitle = 'SignalRManager';

class SignalRManager {
    async fetchBeaconAccess() {
        try {
            const result = await beaconAccess();
            return JSON.parse(result);
        } catch (error) {
            console.error('AuthUtils: Error fetching beacon access:', error.message);
            throw error;
        }
    }

    static instance = null;
    connection = null;
    isInitialized = false;

    websocket = null;
    isConnecting = false;
    isReconnecting = false;
    retryTimeoutId = null;
    reconnectAttempts = 0;
    maxReconnectAttempts = 10;
    baseReconnectDelay = 1000;
    maxReconnectDelay = 30000;
    eventHandlers = new Map();
    context = null;
    connectionUrl = null;
    accessToken = null;

    constructor() {
        if (SignalRManager.instance) {
            return SignalRManager.instance;
        }
        SignalRManager.instance = this;
    }

    async initialize(context) {
        if (this.isInitialized) {
            return this.connection;
        }

        this.context = context;
        try {
            await loadScript(context, SIGNALR);
            console.log('SignalRManagerQA: SignalR script loaded successfully');
            await this.initializeConnection();

            return this.connection;
        } catch (error) {
            console.error('SignalRManagerQA: Error initializing SignalR:', error.message);
            throw error;
        }
    }

    async initializeConnection(retryCount = 0, maxRetries = 3, retryDelay = 2000) {
        if (this.isConnecting) {
            console.log('SignalRManagerQA: Connection attempt already in progress');
            return this.connection;
        }

        this.isConnecting = true;

        try {
            const beaconData = await this.fetchBeaconAccess();

            if (!beaconData?.data?.connectionUrl || !beaconData?.data?.accessToken) {
                console.log('SignalRManagerQA: connectionUrl or accessToken is not available');
                this.isConnecting = false;
                return null;
            }

            if (this.connection) {
                try {
                    if (this.connection.state !== 'Disconnected') {
                        await this.connection.stop();
                        console.log('SignalRManagerQA: Previous connection stopped successfully');
                    }
                } catch (stopError) {
                    console.warn('SignalRManagerQA: Error stopping previous connection:', stopError.message);
                }
            }

            console.log('SignalRManagerQA: Initializing new connection');
            this.connection = new signalR.HubConnectionBuilder()
                .withUrl(beaconData?.data?.connectionUrl, {
                    accessTokenFactory: () => beaconData?.data?.accessToken,
                })
                .withAutomaticReconnect([0, 2000, 5000, 10000, 20000])
                .configureLogging(signalR.LogLevel.Information)
                .build();

            this.setupConnectionEventHandlers();

            try {
                await this.connection.start();
                console.log('SignalRManagerQA: Connected to SignalR hub successfully');
                this.isInitialized = true;
                this.isConnecting = false;
                return this.connection;
            } catch (startError) {
                console.error('SignalRManagerQA: Error starting connection:', startError.message);

                if (retryCount < maxRetries) {
                    console.log(`SignalRManagerQA: Retrying connection (${retryCount + 1}/${maxRetries}) after ${retryDelay}ms`);
                    this.isConnecting = false;
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    return this.initializeConnection(retryCount + 1, maxRetries, retryDelay);
                }
                
                throw startError;
            }
        } catch (error) {
            console.error('SignalRManagerQA: Error in connection initialization:', error.message);
            this.isConnecting = false;

            return null;
        }
    }

    setupConnectionEventHandlers() {
        this.connection.onreconnecting((error) => {
            console.log('SignalRManagerQA: Reconnecting due to error: ', error?.message);
        });

        this.connection.onreconnected((connectionId) => {
            console.log('SignalRManagerQA: Reconnected with connectionId: ', connectionId);
        });

        this.connection.onclose((error) => {
            const errorMessage = error ? error.message : 'Connection closed';
            console.log('SignalRManagerQA: Connection closed: ', errorMessage);
            this.retryConnection();
        });
    }

    async retryConnection() {
        if (this.retryTimeoutId) {
            clearTimeout(this.retryTimeoutId);
        }

        const retryInterval = 5000 + Math.random() * 10000;
        this.retryTimeoutId = setTimeout(async () => {
            try {
                if (this.connection?.state === signalR.HubConnectionState.Disconnected) {
                    console.log('SignalRManagerQA: Retrying connection');
                    await this.initializeConnection();
                }
            } catch (error) {
                console.error('SignalRManagerQA: Retry connection failed:', error);
            }
        }, retryInterval);
    }

    convertToWebSocketUrl(signalRUrl) {
        // Convert SignalR URL to WebSocket URL
        // Example: https://api.example.com/signalr -> wss://api.example.com/signalr
        let wsUrl = signalRUrl.replace(/^https?:\/\//, 'ws://');
        if (signalRUrl.startsWith('https://')) {
            wsUrl = signalRUrl.replace(/^https:\/\//, 'wss://');
        }
        
        // Add authentication token as query parameter
        wsUrl += `?access_token=${encodeURIComponent(this.accessToken)}`;
        
        return wsUrl;
    }

    setupWebSocketEventHandlers() {
        this.websocket.onopen = (event) => {
            console.log('WebSocketManager: WebSocket connection opened');
            this.isReconnecting = false;
            this.reconnectAttempts = 0;
        };

        this.websocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('WebSocketManager: Message received:', data);

                // Handle different message types
                if (data.event && this.eventHandlers.has(data.event)) {
                    const handlers = this.eventHandlers.get(data.event);
                    handlers.forEach(handler => {
                        try {
                            handler(data.data || data);
                        } catch (handlerError) {
                            console.error('WebSocketManager: Error in event handler:', handlerError);
                        }
                    });
                }
            } catch (parseError) {
                console.error('WebSocketManager: Error parsing message:', parseError);
            }
        };

        this.websocket.onclose = (event) => {
            const closeReason = event.reason || 'Connection closed';
            const closeCode = event.code;
            console.log('WebSocketManager: WebSocket connection closed:', closeReason, 'Code:', closeCode);
            
            this.isInitialized = false;
            this.isConnecting = false;
            
            // Don't reconnect if it was a clean close
            if (closeCode !== 1000) {
                this.scheduleReconnect();
            }
        };

        this.websocket.onerror = (error) => {
            console.error('WebSocketManager: WebSocket error:', error);
        };
    }

    async waitForConnection() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('WebSocket connection timeout'));
            }, 10000); // 10 second timeout

            if (this.websocket.readyState === WebSocket.OPEN) {
                clearTimeout(timeout);
                resolve();
            } else {
                this.websocket.onopen = () => {
                    clearTimeout(timeout);
                    resolve();
                };
            }
        });
    }

    scheduleReconnect() {
        if (this.isReconnecting || this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('WebSocketManager: Max reconnection attempts reached or already reconnecting');
            return;
        }

        this.isReconnecting = true;
        this.reconnectAttempts++;

        // Exponential backoff with jitter
        const delay = Math.min(
            this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1) + Math.random() * 1000,
            this.maxReconnectDelay
        );

        console.log(`WebSocketManager: Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

        this.retryTimeoutId = setTimeout(async () => {
            try {
                await this.initializeConnection();
            } catch (error) {
                console.error('WebSocketManager: Reconnect failed:', error);
                this.isReconnecting = false;
                this.scheduleReconnect(); // Try again
            }
        }, delay);
    }

    on(eventName, callback) {
        if (!this.connection) {
            throw new Error('SignalRManagerQA: Connection not initialized');
        }

        if (!this.eventHandlers.has(eventName)) {
            this.eventHandlers.set(eventName, new Set());
        }
        this.eventHandlers.get(eventName).add(callback);

        this.connection.on(eventName, callback);
    }

    off(eventName, callback) {
        if (!this.connection) return;

        if (callback) {
            this.connection.off(eventName, callback);
            this.eventHandlers.get(eventName)?.delete(callback);
        } else {
            this.connection.off(eventName);
            this.eventHandlers.delete(eventName);
        }
    }

    send(data) {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            try {
                const message = typeof data === 'string' ? data : JSON.stringify(data);
                this.websocket.send(message);
                console.log('WebSocketManager: Message sent:', data);
                return true;
            } catch (error) {
                console.error('WebSocketManager: Error sending message:', error);
                return false;
            }
        } else {
            console.warn('WebSocketManager: Cannot send message - connection not open');
            return false;
        }
    }

    async stop() {
        if (this.retryTimeoutId) {
            clearTimeout(this.retryTimeoutId);
            this.retryTimeoutId = null;
        }

        if (this.connection) {
            for (const [eventName, handlers] of this.eventHandlers) {
                for (const handler of handlers) {
                    this.connection.off(eventName, handler);
                }
            }
            this.eventHandlers.clear();

            try {
                await this.connection.stop();
                console.log('SignalRManager: Connection stopped successfully');
            } catch (error) {
                console.error('SignalRManager: Error stopping connection:', error);
            }
            this.connection = null;
            this.isInitialized = false;
            this.isConnecting = false;
        }
    }

    getConnection() {
        return this.connection;
    }

    isConnected() {
        return this.websocket && this.websocket.readyState === WebSocket.OPEN;
    }

    getConnectionState() {
        if (!this.websocket) return 'Disconnected';
        
        switch (this.websocket.readyState) {
            case WebSocket.CONNECTING: return 'Connecting';
            case WebSocket.OPEN: return 'Connected';
            case WebSocket.CLOSING: return 'Closing';
            case WebSocket.CLOSED: return 'Disconnected';
            default: return 'Unknown';
        }
    }
}

export default new SignalRManager();