import { LightningElement, api, track, wire } from 'lwc';
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation';
import getForms from '@salesforce/apex/FormSelectorController.getForms';
import updateActiveForm from '@salesforce/apex/TestLWCConnection.updateActiveForm';
import TRANSCRIPTMC from "@salesforce/messageChannel/rocketphone__TRANSCRIPTMC__c";
import { MessageContext, subscribe } from 'lightning/messageService';

export default class DynamicFormSelector extends NavigationMixin(LightningElement) {
    @wire(MessageContext)
    context;

    @api recordId; // Automatically populated when component is on a record page
    @track forms = [];
    @track isLoading = true;
    @track sourceRecordId; // Record ID to pass for navigation back
    
    // Dashboard forms data - now dynamic from session storage
    @track dashboardForms = [];
    @track isDashboardVisible = true;

    transcriptSubscription = null;
    @track currentCallRecordId = null;

    connectedCallback() {
        this.subscribeTranscriptMC();

        // Set initial sourceRecordId if recordId is available
        if (this.recordId) {
            this.sourceRecordId = this.recordId;
        }
        
        // Load dashboard forms from session storage
        this.loadDashboardForms();
    }

    subscribeTranscriptMC() {
        if (this.transcriptSubscription) {
            return;
        }
        this.transcriptSubscription = subscribe(this.context, TRANSCRIPTMC, (message) => {
            this.handleTranscriptMessage(message);
            console.log('DynamicFormSelector Received TRANSCRIPTMC Message:', message);
        });
    }

    async handleTranscriptMessage(message) {
        try {
            if (message?.callRecordId && (this.currentCallRecordId == null || this.currentCallRecordId == '' || message?.callRecordId !== this.currentCallRecordId)) {
                this.currentCallRecordId = message?.callRecordId;
                console.log('DynamicFormSelector this.currentCallRecordId:', this.currentCallRecordId);
            }
        } catch (rpBotError) {
            console.error('DynamicFormSelector Error in handleTranscriptMessage:', rpBotError);
        }
    }

    // Read URL params to capture source record ID, but prioritize @api recordId
    @wire(CurrentPageReference)
    setCurrentPageReference(pageRef) {
        try {
            const state = pageRef?.state || {};
            const attributes = pageRef?.attributes || {};
            
            // Prioritize @api recordId (from record page), then URL params
            this.sourceRecordId = this.recordId || state.c__recordId || state.recordId || attributes.recordId || '';
            
            // Refresh dashboard when returning from form editor
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
            console.log('dynamicFormSelector 1 this.forms', JSON.stringify(this.forms?.[0]));
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

    // Dashboard forms getter with stable numbering based on creation order
    get formList() {
        // Group forms by type and assign stable numbers based on creation order
        const formsByType = {};
        const formNumbers = new Map();
        
        // Group forms by type
        this.dashboardForms.forEach(form => {
            const formType = form.id;
            if (!formsByType[formType]) {
                formsByType[formType] = [];
            }
            formsByType[formType].push(form);
        });
        
        // Assign numbers based on creation order for each form type
        Object.keys(formsByType).forEach(formType => {
            const formsOfThisType = formsByType[formType];
            
            if (formsOfThisType.length > 1) {
                // Sort by creation time to assign stable numbers: first created = 1, second = 2, etc.
                const sortedByCreation = [...formsOfThisType].sort((a, b) => a.creationTime - b.creationTime);
                
                // Assign numbers: first form = 1, second form = 2, etc.
                sortedByCreation.forEach((form, index) => {
                    formNumbers.set(form.externalFormId, index + 1);
                });
            }
        });
        
        // Return forms with correct numbering (keeping display order as-is)
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
                isCompleted: form.progress === 100,
                progressText: form.progress === 100 ? 'Completed' : `${form.progress}% Complete`,
                progressTextClass: form.progress === 100 
                    ? 'slds-text-body_small progress-completed-text' 
                    : 'slds-text-body_small slds-text-color_weak',
                label: `${form.objectName} / ${displayName}`,
            };
        });
    }

    handleTileKeydown(event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.handleNavigate(event);
        }
    }

    async handleNavigate(event) {
        const formId = event.currentTarget?.dataset?.id;
        if (!formId) return;

        console.log('dynamicFormSelectore formId:: ', formId);
        
        const externalFormId = this.generateUniqueFormId(); // Generate new UUID for new form

        // Find the matching form from this.forms based on formId and get its fieldAnalysisDetails
        const selectedForm = this.forms.find(form => form.id === formId);
        console.log('dynamicFormSelector selectedForm:', selectedForm);
        // fieldAnalysisDetails is already a JSON string from database, no need to stringify again
        let formStructureJsonString = selectedForm?.fieldAnalysisDetails || '{}';
        console.log('dynamicFormSelector Selected form fieldAnalysisDetails:', formStructureJsonString);

        // Build request object properly to avoid JSON escaping issues
        const requestObject = {
            callRecordId: this.currentCallRecordId,
            formStructureJson: formStructureJsonString,
            id: externalFormId
        };
        let requestStringActiveForm = JSON.stringify(requestObject);
        console.log('dynamicFormSelector requestStringActiveForm:', requestStringActiveForm);
        let responseOfUpdateActiveForm = await updateActiveForm({ requestString: requestStringActiveForm });
        console.log('dynamicFormSelectore responseOfUpdateActiveForm: ', responseOfUpdateActiveForm);
        
        const navigationState = {
            c__formId: formId,
            c__externalFormId: externalFormId, // New parameter for unique form instances
            c__mode: 'new' // Explicit mode flag for new forms
        };
        
        // Include source record ID if available for navigation back
        if (this.sourceRecordId) {
            navigationState.c__recordId = this.sourceRecordId;
        }
        
        this[NavigationMixin.Navigate]({
            type: 'standard__navItemPage',
            attributes: {
                apiName: 'Dynamic_Record_Creator'
            },
            state: navigationState
        });
    }

    // ========== SESSION STORAGE METHODS ==========
    
    loadDashboardForms() {
        try {
            const sessionForms = [];
            
            // Iterate through session storage to find form data
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
                                creationTime: sessionData.creationTime || sessionData.timestamp || Date.now(), // Use stored creation time
                                fieldValues: sessionData.fieldValues || {},
                                totalFields: sessionData.totalFields || 0
                            });
                        }
                    } catch (parseError) {
                        console.warn('Error parsing session data:', parseError);
                    }
                }
            }
            
            // Sort by last modified (most recent first) for display
            sessionForms.sort((a, b) => b.lastModified - a.lastModified);
            
            this.dashboardForms = sessionForms;
            
        } catch (error) {
            console.error('Error loading dashboard forms:', error);
            this.dashboardForms = [];
        }
    }
    
    handleEditForm(event) {
        const sessionKey = event.currentTarget.dataset.sessionKey;
        const sessionData = this.getSessionData(sessionKey);
        
        if (sessionData) {
            const navigationState = {
                c__formId: sessionData.formId,
                c__externalFormId: sessionData.externalFormId || 'default', // Use existing external form ID
                c__mode: 'edit' // Explicit mode flag for editing forms
            };
            
            // Include source record ID if available
            if (sessionData.recordId) {
                navigationState.c__recordId = sessionData.recordId;
            }
            
            this[NavigationMixin.Navigate]({
                type: 'standard__navItemPage',
                attributes: {
                    apiName: 'Dynamic_Record_Creator'
                },
                state: navigationState
            });
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