import { LightningElement, api, track, wire } from 'lwc';
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation';
import getForms from '@salesforce/apex/FormSelectorController.getForms';

export default class DynamicFormSelector extends NavigationMixin(LightningElement) {
    @api recordId; // Automatically populated when component is on a record page
    @track forms = [];
    @track isLoading = true;
    @track sourceRecordId; // Record ID to pass for navigation back

    connectedCallback() {
        // Set initial sourceRecordId if recordId is available
        if (this.recordId) {
            this.sourceRecordId = this.recordId;
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

    handleTileKeydown(event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.handleNavigate(event);
        }
    }

    handleNavigate(event) {
        const formId = event.currentTarget?.dataset?.id;
        if (!formId) return;
        
        const navigationState = {
            c__formId: formId
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
}
