import { LightningElement, api, track, wire } from 'lwc';
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation';
import getForms from '@salesforce/apex/FormSelectorController.getForms';

export default class DynamicFormSelector extends NavigationMixin(LightningElement) {
    @api recordId; // Automatically populated when component is on a record page
    @track forms = [];
    @track isLoading = true;
    @track sourceRecordId; // Record ID to pass for navigation back
    
    // Dashboard forms data - now dynamic from session storage
    @track dashboardForms = [];

    connectedCallback() {
        // Set initial sourceRecordId if recordId is available
        if (this.recordId) {
            this.sourceRecordId = this.recordId;
        }
        
        // Load dashboard forms from session storage
        this.loadDashboardForms();
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

    // Dashboard forms getter with duplicate form numbering
    get formList() {
        // Count occurrences of each form type (based on formId)
        const formTypeCounts = {};
        const formTypeCounters = {};
        
        // First pass: count how many forms of each type we have
        this.dashboardForms.forEach(form => {
            const formType = form.id; // formId identifies the form template
            formTypeCounts[formType] = (formTypeCounts[formType] || 0) + 1;
            formTypeCounters[formType] = 0;
        });
        
        // Second pass: assign numbers and create display labels
        return this.dashboardForms.map(form => {
            const formType = form.id;
            const totalOfThisType = formTypeCounts[formType];
            
            // Increment counter for this form type
            formTypeCounters[formType]++;
            const currentCount = formTypeCounters[formType];
            
            // Add numbering only if there are multiple forms of this type
            let displayName = form.formName;
            if (totalOfThisType > 1) {
                displayName = `${form.formName} (${currentCount})`;
            }
            
            return {
                ...form,
                isCompleted: form.progress === 100,
                progressText: form.progress === 100 ? 'Completed' : `${form.progress}% Complete`,
                progressTextClass: form.progress === 100 
                    ? 'slds-text-body_small slds-text-color_success' 
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

    handleNavigate(event) {
        const formId = event.currentTarget?.dataset?.id;
        if (!formId) return;
        
        const externalFormId = this.generateUniqueFormId(); // Generate new UUID for new form
        
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
                                externalFormId: sessionData.externalFormId || 'default', // New field
                                sessionKey: key,
                                objectName: sessionData.objectApiName,
                                formName: sessionData.formName || 'Untitled Form',
                                progress: sessionData.progressPercentage || 0,
                                recordId: sessionData.recordId,
                                lastModified: sessionData.timestamp || Date.now(),
                                fieldValues: sessionData.fieldValues || {},
                                totalFields: sessionData.totalFields || 0
                            });
                        }
                    } catch (parseError) {
                        console.warn('Error parsing session data:', parseError);
                    }
                }
            }
            
            // Sort by last modified (most recent first)
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
}
