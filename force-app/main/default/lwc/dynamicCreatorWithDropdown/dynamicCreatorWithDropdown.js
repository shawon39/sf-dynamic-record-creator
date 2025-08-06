// dynamicCreatorWithDropdown.js
import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getAllCreateableObjects from '@salesforce/apex/DynamicObjectService.getAllCreateableObjects';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';

// Add this constant to define allowed fields for each object
const sfObjectsFields = {
    Account: [
        'Name',
        'AccountNumber',
        'Type',
        'Industry',
        'AnnualRevenue',
        'Rating',
        'Phone',
        'Website',
        'BillingAddress',
        'Description'
    ],
    Opportunity: [
        'Name',
        'AccountId',
        'Amount',
        'CloseDate',
        'StageName',
        'Probability',
        'Type',
        'LeadSource',
        'ExpectedRevenue',
        'Description'
    ],
    Contact: [
        'FirstName',
        'LastName',
        'AccountId',
        'Title',
        'Email',
        'Phone',
        'MobilePhone',
        'LeadSource',
        'MailingAddress',
        'Department'
    ]
};

// Instructions for each object type - simplified to plain text
const INSTRUCTIONS = {
    Account: [
        { id: 1, text: 'Enter company name and account number', fields: ['Name', 'AccountNumber'] },
        { id: 2, text: 'Select account type and industry', fields: ['Type', 'Industry'] },
        { id: 3, text: 'Add annual revenue and rating', fields: ['AnnualRevenue', 'Rating'] },
        { id: 4, text: 'Provide phone number and website', fields: ['Phone', 'Website'] },
        { id: 5, text: 'Enter the billing address', fields: ['BillingAddress'] },
        { id: 6, text: 'Add relevant description', fields: ['Description'] }
    ],
    Contact: [
        { id: 1, text: 'Enter first name, last name, and title', fields: ['FirstName', 'LastName', 'Title'] },
        { id: 2, text: 'Link contact to an account', fields: ['AccountId'] },
        { id: 3, text: 'Add email and phone numbers', fields: ['Email', 'Phone', 'MobilePhone'] },
        { id: 4, text: 'Complete address and department details', fields: ['MailingAddress', 'Department', 'LeadSource'] }
    ],
    Opportunity: [
        { id: 1, text: 'Enter opportunity name and link to account', fields: ['Name', 'AccountId'] },
        { id: 2, text: 'Set amount and expected revenue', fields: ['Amount', 'ExpectedRevenue'] },
        { id: 3, text: 'Define the close date', fields: ['CloseDate'] },
        { id: 4, text: 'Select current stage and probability', fields: ['StageName', 'Probability'] },
        { id: 5, text: 'Categorize the opportunity type', fields: ['Type'] },
        { id: 6, text: 'Identify the lead source', fields: ['LeadSource'] },
        { id: 7, text: 'Add description and notes', fields: ['Description'] }
    ]
};

export default class DynamicCreatorWithDropdown extends LightningElement {
    @track objectOptions = [];
    @track selectedObject;
    @track recordTypeId;
    @track fieldsArray = [];
    @track filledFields = new Set();
    @track completedSteps = new Set();
    @track isLoadingFields = false;

    // Load dropdown options on init
    @wire(getAllCreateableObjects)
    wiredObjects({ data, error }) {
        if (data) {
            this.objectOptions = data.map(o => ({
                label: o.label,
                value: o.value
            }));
        } else if (error) {
            console.error('Error loading objects', error);
            this.showToast('Error', 'Failed to load objects: ' + error.body?.message, 'error');
        }
    }

    // When user picks an object, reset state and fetch its metadata
    handleObjectChange(event) {
        this.selectedObject = event.detail.value;
        this.filledFields.clear();
        this.completedSteps.clear();
        this.fieldsArray = []; // Clear fields array immediately
        this.isLoadingFields = true; // Set loading state
        // getObjectInfo wire (below) will fire because selectedObject changed
    }

    // Wire adapter to fetch object metadata automatically
    @wire(getObjectInfo, { objectApiName: '$selectedObject' })
    wiredInfo({ data, error }) {
        if (data) {
            this.recordTypeId = data.defaultRecordTypeId;
            // Only use fields from sfObjectsFields for the selected object
            const allowedFields = sfObjectsFields[this.selectedObject] || [];
            this.fieldsArray = allowedFields
                .map(fieldName => data.fields[fieldName])
                .filter(f => f && f.createable && f.updateable && !f.customRestricted)
                .map(f => ({ apiName: f.apiName }));
            this.isLoadingFields = false; // Fields loaded successfully
        } else if (error) {
            console.error('Error loading metadata', error);
            this.fieldsArray = [];
            this.isLoadingFields = false; // Stop loading on error
            this.showToast('Error', 'Failed to load object metadata: ' + error.body?.message, 'error');
        }
    }

    // Getter for static card title
    get cardTitle() {
        return 'Dynamic Record Creator';
    }

    // Dynamic create button label
    get createButtonLabel() {
        return this.selectedObject ? `Create ${this.selectedObject}` : 'Create Record';
    }

    // Get instructions for current object
    get currentInstructions() {
        return INSTRUCTIONS[this.selectedObject] || [];
    }

    // Get progress indicator steps
    get progressSteps() {
        return this.currentInstructions.map(instruction => ({
            ...instruction,
            isCompleted: this.completedSteps.has(instruction.id),
            cssClass: this.completedSteps.has(instruction.id) 
                ? 'slds-progress__item slds-is-completed' 
                : 'slds-progress__item'
        }));
    }

    // Progress calculations
    get totalFields() { 
        return this.fieldsArray.length; 
    }
    
    get filledCount() { 
        return this.filledFields.size; 
    }
    
    get progressValue() {
        return this.totalFields
            ? Math.round((this.filledCount / this.totalFields) * 100)
            : 0;
    }

    // Check if step is completed based on filled fields
    checkStepCompletion(instruction) {
        const stepFields = instruction.fields || [];
        return stepFields.some(field => this.filledFields.has(field));
    }

    // Update completed steps
    updateCompletedSteps() {
        this.completedSteps.clear();
        this.currentInstructions.forEach(instruction => {
            if (this.checkStepCompletion(instruction)) {
                this.completedSteps.add(instruction.id);
            }
        });
        this.completedSteps = new Set(this.completedSteps);
    }

    handleFieldChange(evt) {
        const fieldName = evt.target.fieldName;
        const value = evt.target.value;
        
        if (value != null && value !== '') {
            this.filledFields.add(fieldName);
        } else {
            this.filledFields.delete(fieldName);
        }
        // Trigger reactivity
        this.filledFields = new Set(this.filledFields);
        
        // Update completed steps
        this.updateCompletedSteps();
    }

    handleSuccess(evt) {
        const recordId = evt.detail.id;
        console.log(`${this.selectedObject} created: ${recordId}`);
        this.showToast('Success', `${this.selectedObject} record created successfully!`, 'success');
        
        // Reset form
        this.selectedObject = '';
        this.filledFields.clear();
        this.completedSteps.clear();
        this.fieldsArray = [];
        this.isLoadingFields = false;
    }

    handleError(evt) {
        console.error('Create error', evt.detail);
        this.showToast('Error', 'Failed to create record: ' + evt.detail.message, 'error');
    }

    handleCancel() {
        // Reset form
        this.selectedObject = '';
        this.filledFields.clear();
        this.completedSteps.clear();
        this.fieldsArray = [];
        this.isLoadingFields = false;
    }

    showToast(title, message, variant) {
        const evt = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant
        });
        this.dispatchEvent(evt);
    }
} 