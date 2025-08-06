// dynamicCreatorWithDropdown.js
import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getAllCreateableObjects from '@salesforce/apex/DynamicObjectService.getAllCreateableObjects';
import getObjectFieldsData from '@salesforce/apex/DynamicObjectService.getObjectFieldsData';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';

export default class DynamicCreatorWithDropdown extends LightningElement {
    @track objectOptions = [];
    @track selectedObject;
    @track recordTypeId;
    @track fieldsArray = [];
    @track filledFields = new Set();
    @track completedSteps = new Set();
    @track isLoadingFields = false;
    @track objectFieldsData = null;
    @track dynamicInstructions = [];

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
        this.objectFieldsData = null;
        this.dynamicInstructions = [];
        this.isLoadingFields = true; // Set loading state
        
        if (this.selectedObject) {
            this.loadObjectFieldsData();
        }
    }

    // Load field data from Dynamic_Field_Analysis__c
    loadObjectFieldsData() {
        getObjectFieldsData({ objectName: this.selectedObject })
            .then(result => {
                console.log('Field data received:', result);
                this.objectFieldsData = result;
                this.recordTypeId = result.recordTypeId;
                
                // Create fields array with API names
                this.fieldsArray = result.fields.map(fieldName => ({ apiName: fieldName }));
                
                // Use custom instructions or generate generic ones as fallback
                this.setupInstructions();
                
                this.isLoadingFields = false;
            })
            .catch(error => {
                console.error('Error loading field data:', error);
                this.showToast('Error', 'Failed to load field data: ' + error.body?.message, 'error');
                this.fieldsArray = [];
                this.isLoadingFields = false;
            });
    }

    // Setup instructions - use custom instructions if available, otherwise generate generic ones
    setupInstructions() {
        if (!this.objectFieldsData) {
            this.dynamicInstructions = [];
            return;
        }

        // Check if we have custom instructions
        if (this.objectFieldsData.instructions && this.objectFieldsData.instructions.length > 0) {
            console.log('Using custom instructions from database:', this.objectFieldsData.instructions);
            this.dynamicInstructions = this.objectFieldsData.instructions;
        } else {
            console.log('No custom instructions found, generating generic ones');
            this.generateGenericInstructions();
        }
    }

    // Generate generic instructions based on available fields (fallback)
    generateGenericInstructions() {
        if (!this.objectFieldsData || !this.objectFieldsData.fields) {
            this.dynamicInstructions = [];
            return;
        }

        const fields = this.objectFieldsData.fields;
        const instructions = [];
        
        // Group fields into logical steps (4 fields per step)
        const fieldsPerStep = 4;
        let stepId = 1;
        
        for (let i = 0; i < fields.length; i += fieldsPerStep) {
            const stepFields = fields.slice(i, i + fieldsPerStep);
            const fieldLabels = stepFields.join(', ');
            
            instructions.push({
                id: stepId,
                text: `Complete ${fieldLabels}`,
                fields: stepFields
            });
            stepId++;
        }
        
        this.dynamicInstructions = instructions;
        console.log('Generated generic instructions:', this.dynamicInstructions);
    }

    // Wire adapter to fetch object metadata for record type (if needed)
    @wire(getObjectInfo, { objectApiName: '$selectedObject' })
    wiredInfo({ data, error }) {
        if (data && !this.recordTypeId) {
            // Use default record type if not already set from field analysis
            this.recordTypeId = data.defaultRecordTypeId;
        } else if (error) {
            console.error('Error loading object metadata', error);
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
        return this.dynamicInstructions || [];
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
        this.objectFieldsData = null;
        this.dynamicInstructions = [];
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
        this.objectFieldsData = null;
        this.dynamicInstructions = [];
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