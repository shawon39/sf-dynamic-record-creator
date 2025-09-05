import { LightningElement, wire, track } from 'lwc';
import { publish, MessageContext, subscribe } from 'lightning/messageService';
import webSocketManager from 'c/signalRManagerDev';
import TRANSCRIPTMC from "@salesforce/messageChannel/rocketphone__TRANSCRIPTMC__c";
import RPISTOLWC from "@salesforce/messageChannel/FORMMC__c";

export default class RpRealTimeClientDev extends LightningElement {
    @wire(MessageContext)
    context;
    capturedBookmark = [];
    beaconData;
    transcriptSubscription = null;
    @track currentCallRecordId = null;

    connectedCallback() {
        this.subscribeTranscriptMC();
    }

    subscribeTranscriptMC() {
        if (this.transcriptSubscription) {
            return;
        }
        this.transcriptSubscription = subscribe(this.context, TRANSCRIPTMC, (message) => {
            this.handleTranscriptMessage(message);
            console.log('rpRealTimeClientDev Received TRANSCRIPTMC Message:', message);
        });
    }

    async handleTranscriptMessage(message) {
        try {
            if (message?.callRecordId && (this.currentCallRecordId == null || this.currentCallRecordId == '' || message?.callRecordId !== this.currentCallRecordId)) {
                this.currentCallRecordId = message?.callRecordId;
                console.log('rpRealTimeClientDev this.currentCallRecordId:', this.currentCallRecordId);
            }
        } catch (rpBotError) {
            console.error('rpRealTimeClientDev Error in handleTranscriptMessage:', rpBotError);
        }
    }

    async renderedCallback() {
        try {
            const connection = await webSocketManager.initialize(this);
            if (connection) {
                this.setupEventHandlers(connection);
            }
        } catch (error) {
            console.error('RpRealTimeClientDev: Error initializing WebSocket:', error);
        }
    }

    setupEventHandlers(connection) {
        // Setup event handlers for WebSocket messages
        webSocketManager.on('CallStatusChanged', (data) => {
            const normalizedData = JSON.stringify(data, null, '\t');
            console.log('RpRealTimeClientDev: CallStatusChanged event received: ', normalizedData);
        });

        webSocketManager.on('UserStatusUpdate', (data) => {
            const normalizedData = JSON.stringify(data, null, '\t');
            console.log('RpRealTimeClientDev: UserStatusUpdate event received: ', normalizedData);
        });

        webSocketManager.on('UserDisconnectMessage', (data) => {
            const normalizedData = JSON.stringify(data, null, '\t');
            console.log('RpRealTimeClientDev: UserDisconnectMessage event received: ', normalizedData);
        });

        webSocketManager.on('RPBookmarkTriggered', (data) => {
            const normalizedData = JSON.stringify(data, null, '\t');
            console.log('RpRealTimeClientDev: RPBookmarkTriggered data: ', data);
            console.log('RpRealTimeClientDev: RPBookmarkTriggered normalizedData: ', normalizedData);

        });

        webSocketManager.on('RCTranscription', (transcriptData) => {
            console.log('RpRealTimeClientDev: RCTranscription event received: ', transcriptData);
        });

        webSocketManager.on('FormDataExtracted', (formData) => {
            console.log('RpRealTimeClientDev: FormDataExtracted event received: ', formData);
            const inProgressFormData = {
                    type: 'inProgressFormData',
                    title: 'rpRealTimeClientDev',
                    callFormData: formData,
                }
            console.log('RpRealTimeClientDev: FormDataExtracted inProgressFormData: ', inProgressFormData);
            publish(this.context, RPISTOLWC, inProgressFormData);
        });

        // Additional WebSocket-specific event handlers
        webSocketManager.on('connection_status', (status) => {
            console.log('RpRealTimeClientDev: Connection status changed:', status);
        });

        webSocketManager.on('error', (error) => {
            console.error('RpRealTimeClientDev: WebSocket error:', error);
        });

        // Log connection state
        console.log('RpRealTimeClientDev: WebSocket connection state:', webSocketManager.getConnectionState());
    }

    handleBookmarkResponse(data) {
        console.log("RpRealTimeClientDev handleBookmarkResponse data: ", data);
        if (data) {
            const { callData: { id: callRecordId, actions: rawActions, bookmarks } } = data;
            console.log("RpRealTimeClientDev data actions", rawActions);

            if (bookmarks?.length > 0) {
                const lastBookmark = bookmarks[bookmarks.length - 1];
                let lastBookmarkObject = { rpCallId: callRecordId, bookmarkData: lastBookmark };
                let bookmarkObject = { bookmarkType: 'All', bookmarkData: lastBookmark, rpCallId: callRecordId };
                console.log("RpRealTimeClientDev handleBookmarkResponse bookmarkObject: ", bookmarkObject);
            }

            if (rawActions?.length > 0) {
                const lastElement = rawActions[rawActions.length - 1];
                let isExist = this.capturedBookmark.find(b => b?.id === lastElement.id);
                if (isExist) {
                    return;
                }
            }
        }
    }

    // Method to send messages to WebSocket
    sendMessage(message) {
        if (webSocketManager.isConnected()) {
            return webSocketManager.send(message);
        } else {
            console.warn('RpRealTimeClient: Cannot send message - WebSocket not connected');
            return false;
        }
    }

    // Method to check connection status
    isConnected() {
        return webSocketManager.isConnected();
    }

    // Method to get connection state
    getConnectionState() {
        return webSocketManager.getConnectionState();
    }

    disconnectedCallback() {
        // Remove all event handlers
        webSocketManager.off('CallStatusChanged');
        webSocketManager.off('UserStatusUpdate');
        webSocketManager.off('UserDisconnectMessage');
        webSocketManager.off('RPBookmarkTriggered');
        webSocketManager.off('RCTranscription');
        webSocketManager.off('DetectedQuestions');
        webSocketManager.off('connection_status');
        webSocketManager.off('error');
    }
}