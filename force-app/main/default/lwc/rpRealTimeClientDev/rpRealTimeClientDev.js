import { LightningElement, wire, track } from 'lwc';
import { publish, MessageContext, subscribe } from 'lightning/messageService';
import signalRManager from 'c/signalRManagerDev';
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
            console.log('rpRealTimeClientQA Received TRANSCRIPTMC Message:', message);
        });
    }

    async handleTranscriptMessage(message) {
        try {
            if (message?.callRecordId && (this.currentCallRecordId == null || this.currentCallRecordId == '' || message?.callRecordId !== this.currentCallRecordId)) {
                this.currentCallRecordId = message?.callRecordId;
                console.log('rpRealTimeClientQA this.currentCallRecordId:', this.currentCallRecordId);
            }
        } catch (rpBotError) {
            console.error('rpRealTimeClientQA Error in handleTranscriptMessage:', rpBotError);
        }
    }

    async renderedCallback() {
        try {
            const connection = await signalRManager.initialize(this);
            if (connection) {
                this.setupEventHandlers(connection);
            }
        } catch (error) {
            console.error('rpRealTimeClientQA: Error initializing WebSocket:', error);
        }
    }

    setupEventHandlers(connection) {
        // Setup event handlers for WebSocket messages
        signalRManager.on('CallStatusChanged', (data) => {
            const normalizedData = JSON.stringify(data, null, '\t');
            console.log('rpRealTimeClientQA: CallStatusChanged event received: ', normalizedData);
        });

        signalRManager.on('UserStatusUpdate', (data) => {
            const normalizedData = JSON.stringify(data, null, '\t');
            console.log('rpRealTimeClientQA: UserStatusUpdate event received: ', normalizedData);
        });

        signalRManager.on('UserDisconnectMessage', (data) => {
            const normalizedData = JSON.stringify(data, null, '\t');
            console.log('rpRealTimeClientQA: UserDisconnectMessage event received: ', normalizedData);
        });

        signalRManager.on('RPBookmarkTriggered', (data) => {
            const normalizedData = JSON.stringify(data, null, '\t');
            console.log('rpRealTimeClientQA: RPBookmarkTriggered data: ', data);
            console.log('rpRealTimeClientQA: RPBookmarkTriggered normalizedData: ', normalizedData);

        });

        signalRManager.on('RCTranscription', (transcriptData) => {
            console.log('rpRealTimeClientQA: RCTranscription event received: ', transcriptData);
        });

        signalRManager.on('FormDataExtracted', (formData) => {
            console.log('rpRealTimeClientQA: FormDataExtracted event received: ', JSON.stringify(formData, null, 2));
            const inProgressFormData = {
                    type: 'inProgressFormData',
                    title: 'rpRealTimeClientDev',
                    callFormData: formData,
                }
            console.log('rpRealTimeClientQA: FormDataExtracted inProgressFormData: ', JSON.stringify(inProgressFormData, null, 2));
            publish(this.context, RPISTOLWC, inProgressFormData);
        });

        // Additional WebSocket-specific event handlers
        signalRManager.on('connection_status', (status) => {
            console.log('rpRealTimeClientQA: Connection status changed:', status);
        });

        signalRManager.on('error', (error) => {
            console.error('rpRealTimeClientQA: WebSocket error:', error);
        });

    }

    handleBookmarkResponse(data) {
        console.log("rpRealTimeClientQA handleBookmarkResponse data: ", data);
        if (data) {
            const { callData: { id: callRecordId, actions: rawActions, bookmarks } } = data;
            console.log("rpRealTimeClientQA data actions", rawActions);

            if (bookmarks?.length > 0) {
                const lastBookmark = bookmarks[bookmarks.length - 1];
                let lastBookmarkObject = { rpCallId: callRecordId, bookmarkData: lastBookmark };
                let bookmarkObject = { bookmarkType: 'All', bookmarkData: lastBookmark, rpCallId: callRecordId };
                console.log("rpRealTimeClientQA handleBookmarkResponse bookmarkObject: ", bookmarkObject);
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
        if (signalRManager.isConnected()) {
            return signalRManager.send(message);
        } else {
            console.warn('rpRealTimeClientQA: Cannot send message - WebSocket not connected');
            return false;
        }
    }

    // Method to check connection status
    isConnected() {
        return signalRManager.isConnected();
    }

    // Method to get connection state
    getConnectionState() {
        return signalRManager.getConnectionState();
    }

    disconnectedCallback() {
        // Remove all event handlers
        signalRManager.off('CallStatusChanged');
        signalRManager.off('UserStatusUpdate');
        signalRManager.off('UserDisconnectMessage');
        signalRManager.off('RPBookmarkTriggered');
        signalRManager.off('RCTranscription');
        signalRManager.off('DetectedQuestions');
        signalRManager.off('connection_status');
        signalRManager.off('error');
    }
}