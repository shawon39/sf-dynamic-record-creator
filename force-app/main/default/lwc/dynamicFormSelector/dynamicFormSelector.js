import { LightningElement, api, track, wire } from 'lwc';
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation';
import getForms from '@salesforce/apex/FormSelectorController.getForms';
import updateActiveForm from '@salesforce/apex/TestLWCConnection.updateActiveForm';
import TRANSCRIPTMC from "@salesforce/messageChannel/rocketphone__TRANSCRIPTMC__c";
import { MessageContext, subscribe } from 'lightning/messageService';

import getAllDraftForms from '@salesforce/apex/DraftFormService.getAllDraftForms';

export default class DynamicFormSelector extends NavigationMixin(LightningElement) {
    @wire(MessageContext)
    context;

    @api recordId;
    @track forms = [];
    @track isLoading = true;
    @track sourceRecordId;
    
    @track dashboardForms = [];
    @track isDashboardVisible = true;

    transcriptSubscription = null;
    @track currentCallRecordId = null;

    connectedCallback() {
        this.subscribeTranscriptMC();

        if (this.recordId) {
            this.sourceRecordId = this.recordId;
        }
        
        this.loadDashboardForms();
    }

    // Subscribe to voice/chat transcript messages to link forms with call records
    subscribeTranscriptMC() {
        if (this.transcriptSubscription) {
            return;
        }
        this.transcriptSubscription = subscribe(this.context, TRANSCRIPTMC, (message) => {
            this.handleTranscriptMessage(message);
        });
    }

    // Track active call record ID for form association
    async handleTranscriptMessage(message) {
        try {
            if (message?.callRecordId && (this.currentCallRecordId === null || this.currentCallRecordId === '' || message?.callRecordId !== this.currentCallRecordId)) {
                this.currentCallRecordId = message?.callRecordId;
            }
        } catch (rpBotError) {
            console.error('DynamicFormSelector Error in handleTranscriptMessage:', rpBotError);
        }
    }

    // Parse URL parameters to capture source record context
    @wire(CurrentPageReference)
    setCurrentPageReference(pageRef) {
        try {
            const state = pageRef?.state || {};
            const attributes = pageRef?.attributes || {};
            
            // Prioritize @api recordId from record page over URL parameters
            this.sourceRecordId = this.recordId || state.c__recordId || state.recordId || attributes.recordId || '';
            this.loadDashboardForms();
        } catch (e) {
            console.error('Error reading URL params', e);
        }
    }

    @wire(getForms)
    wiredForms({ data, error }) {
        this.isLoading = false;
        if (data) {
            this.forms = data;
        } else if (error) {
            console.error('Error loading forms', error);
            this.forms = [];
        }
    }

    get hasForms() {
        return this.forms && this.forms.length > 0;
    }

    get hasDashboardForms() {
        return this.dashboardForms && this.dashboardForms.length > 0;
    }

    get dashboardToggleButtonClass() {
        return 'dashboard-toggle-button';
    }

    get dashboardToggleTitle() {
        return this.isDashboardVisible ? 'Collapse dashboard' : 'Expand dashboard';
    }

    // Transform dashboard forms with stable numbering for multiple instances of same form type
    get formList() {
        const formsByType = {};
        const formNumbers = new Map();
        
        this.dashboardForms.forEach(form => {
            const formType = form.id;
            if (!formsByType[formType]) {
                formsByType[formType] = [];
            }
            formsByType[formType].push(form);
        });
        
        // Assign stable numbers based on creation order (first created = 1, second = 2, etc.)
        Object.keys(formsByType).forEach(formType => {
            const formsOfThisType = formsByType[formType];
            
            if (formsOfThisType.length > 1) {
                const sortedByCreation = [...formsOfThisType].sort((a, b) => a.creationTime - b.creationTime);
                
                sortedByCreation.forEach((form, index) => {
                    formNumbers.set(form.externalFormId, index + 1);
                });
            }
        });
        
        return this.dashboardForms.map(form => {
            const formType = form.id;
            const totalOfThisType = formsByType[formType].length;
            
            let displayName = form.formName;
            if (totalOfThisType > 1) {
                const number = formNumbers.get(form.externalFormId);
                displayName = `${form.formName} (${number})`;
            }
            
            return {
                ...form,
                isCompleted: form.status === 'Created' || form.progress === 100,
                progressText: form.status === 'Created' ? 'Created' : (form.progress === 100 ? 'Completed' : `${form.progress}% Complete`),
                progressTextClass: form.status === 'Created' 
                    ? 'slds-text-body_small progress-completed-text' 
                    : 'slds-text-body_small slds-text-color_weak',
                label: `${form.objectName} / ${displayName}`
            };
        });
    }

    handleTileKeydown(event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.handleNavigate(event);
        }
    }

    // Navigate to new form instance with unique ID and call context
    async handleNavigate(event) {
        const formId = event.currentTarget?.dataset?.id;
        if (!formId) return;

        const externalFormId = this.generateUniqueFormId();
        const selectedForm = this.forms.find(form => form.id === formId);
        let formStructureJsonString = selectedForm?.fieldAnalysisDetails || '{}';

        // Notify external integration (RocketPhone) about active form
        const requestObject = {
            callRecordId: this.currentCallRecordId,
            formStructureJson: formStructureJsonString,
            id: externalFormId
        };
        let requestStringActiveForm = JSON.stringify(requestObject);
        await updateActiveForm({ requestString: requestStringActiveForm });
        
        const navigationState = {
            c__formId: formId,
            c__externalFormId: externalFormId,
            c__mode: 'new'
        };
        
        if (this.sourceRecordId) {
            navigationState.c__recordId = this.sourceRecordId;
        }
        
        this[NavigationMixin.Navigate]({
            type: 'standard__navItemPage',
            attributes: {
                apiName: 'RocketForm'
            },
            state: navigationState
        });
    }

    // Load draft and completed forms from Salesforce (replaces session storage)
    async loadDashboardForms() {
        try {
            const draftForms = await getAllDraftForms({ recordId: this.recordId || null });
            
            const transformedForms = draftForms.map(draft => {
                let formData = {};
                try {
                    formData = JSON.parse(draft.Form_Data_JSON__c || '{}');
                } catch (parseError) {
                    console.warn('Error parsing draft form data:', parseError);
                    formData = {};
                }
                
                return {
                    id: draft.Form_ID__c,
                    draftRecordId: draft.Id,
                    externalFormId: draft.External_Form_ID__c,
                    sessionKey: `draft-${draft.Id}`,
                    objectName: formData.objectName || 'Unknown',
                    formName: formData.formName || 'Untitled Form',
                    progress: formData.progress || 0,
                    status: draft.Status__c || 'Draft',
                    createdRecordId: draft.Created_Record_ID__c,
                    recordId: draft.Source_Record_ID__c,
                    lastModified: new Date(draft.LastModifiedDate).getTime(),
                    creationTime: new Date(draft.CreatedDate).getTime(),
                    createdBy: draft.CreatedBy?.Name || 'Unknown User',
                    createdDate: draft.CreatedDate,
                    fieldValues: formData.fieldValues || {},
                    totalFields: formData.totalFields || 0
                };
            });
            
            // Sort by last modified (most recent first)
            transformedForms.sort((a, b) => b.lastModified - a.lastModified);
            
            this.dashboardForms = transformedForms;
            
        } catch (error) {
            console.error('Error loading draft forms:', error);
            this.dashboardForms = [];
            this.loadSessionStorageForms(); // Fallback to session storage
        }
    }
    
    // Fallback method to load forms from session storage (legacy support)
    loadSessionStorageForms() {
        try {
            const sessionForms = [];
            
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                
                // Look for form session keys (format: recordId-formId-objectName-externalFormId)
                if (key && key.includes('-') && key.split('-').length >= 4) {
                    try {
                        const sessionData = JSON.parse(sessionStorage.getItem(key));
                        
                        if (sessionData && sessionData.formId && sessionData.objectApiName) {
                            sessionForms.push({
                                id: sessionData.formId,
                                externalFormId: sessionData.externalFormId || 'default',
                                sessionKey: key,
                                objectName: sessionData.objectApiName,
                                formName: sessionData.formName || 'Untitled Form',
                                progress: sessionData.progressPercentage || 0,
                                recordId: sessionData.recordId,
                                lastModified: sessionData.timestamp || Date.now(),
                                creationTime: sessionData.creationTime || sessionData.timestamp || Date.now(),
                                createdBy: 'Session Storage', // Placeholder for compatibility
                                createdDate: new Date(sessionData.timestamp || Date.now()).toISOString(),
                                fieldValues: sessionData.fieldValues || {},
                                totalFields: sessionData.totalFields || 0
                            });
                        }
                    } catch (parseError) {
                        console.warn('Error parsing session data:', parseError);
                    }
                }
            }
            
            sessionForms.sort((a, b) => b.lastModified - a.lastModified);
            this.dashboardForms = sessionForms;
            
        } catch (error) {
            console.error('Error loading session storage forms:', error);
            this.dashboardForms = [];
        }
    }
    
    // Navigate to edit existing draft or update completed form
    handleEditForm(event) {
        const draftRecordId = event.currentTarget.dataset.draftRecordId;
        const sessionKey = event.currentTarget.dataset.sessionKey;
        
        if (draftRecordId && draftRecordId.startsWith('draft-')) {
            const actualDraftId = draftRecordId.replace('draft-', '');
            const formData = this.dashboardForms.find(form => form.draftRecordId === actualDraftId);
            
            if (formData) {
                const navigationState = {
                    c__formId: formData.id,
                    c__draftRecordId: actualDraftId,
                    c__mode: 'edit'
                };
                
                if (formData.recordId) {
                    navigationState.c__recordId = formData.recordId;
                }
                
                // If form was completed, set mode to 'update' to modify the created record
                if (formData.status === 'Created' && formData.createdRecordId) {
                    navigationState.c__createdRecordId = formData.createdRecordId;
                    navigationState.c__mode = 'update';
                }
                
                this[NavigationMixin.Navigate]({
                    type: 'standard__navItemPage',
                    attributes: {
                        apiName: 'RocketForm'
                    },
                    state: navigationState
                });
            }
        } else {
            const sessionData = this.getSessionData(sessionKey);
            
            if (sessionData) {
                const navigationState = {
                    c__formId: sessionData.formId,
                    c__externalFormId: sessionData.externalFormId || 'default',
                    c__mode: 'edit'
                };
                
                if (sessionData.recordId) {
                    navigationState.c__recordId = sessionData.recordId;
                }
                
                this[NavigationMixin.Navigate]({
                    type: 'standard__navItemPage',
                    attributes: {
                        apiName: 'RocketForm'
                    },
                    state: navigationState
                });
            }
        }
    }
    
    getSessionData(sessionKey) {
        try {
            const data = sessionStorage.getItem(sessionKey);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Error getting session data:', error);
            return null;
        }
    }
    
    refreshDashboard() {
        this.loadDashboardForms();
    }

    generateUniqueFormId() {
        return 'form_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    handleDashboardToggle() {
        this.isDashboardVisible = !this.isDashboardVisible;
    }
}