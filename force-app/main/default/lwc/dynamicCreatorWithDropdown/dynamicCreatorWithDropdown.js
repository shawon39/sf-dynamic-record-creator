// dynamicCreatorWithDropdown.js
import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';

// Import Apex methods
import getAllCreateableObjects from '@salesforce/apex/DynamicObjectService.getAllCreateableObjects';
import getObjectFieldsData from '@salesforce/apex/DynamicObjectService.getObjectFieldsData';

export default class DynamicCreatorWithDropdown extends LightningElement {
    // Object selection
    @track objectOptions = [];
    @track selectedObject;
    @track recordTypeId;
    @track recordTypeName;
    
    // Field and form data
    @track fieldsArray = [];
    @track objectFieldsData = null;
    @track instructionSteps = [];
    @track filledFields = new Set();
    @track completedSteps = new Set();
    @track isLoadingFields = false;
    @track isCreating = false;
    
    // Success modal
    @track showSuccessModal = false;
    @track createdRecordId;

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
            this.showToast('Error', 'Failed to load objects: ' + this.getErrorMessage(error), 'error');
        }
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

    // ========== OBJECT SELECTION ==========

    handleObjectChange(event) {
        this.selectedObject = event.detail.value;
        this.resetFormState();
        
        if (this.selectedObject) {
            this.loadObjectFieldsData();
        }
    }

    resetFormState() {
        this.filledFields.clear();
        this.completedSteps.clear();
        this.fieldsArray = [];
        this.objectFieldsData = null;
        this.instructionSteps = [];
        this.recordTypeId = null;
        this.recordTypeName = '';
        this.isLoadingFields = false;
        this.showSuccessModal = false;
        this.createdRecordId = null;
    }

    // ========== DATA LOADING ==========

    async loadObjectFieldsData() {
        this.isLoadingFields = true;
        
        try {
            const result = await getObjectFieldsData({ objectName: this.selectedObject });
            console.log('Field data received:', result);
            
            this.objectFieldsData = result;
            this.recordTypeId = result.recordTypeId;
            this.recordTypeName = result.recordTypeName || '';
            
            // Create fields array with API names
            this.fieldsArray = result.fields.map(fieldName => ({ apiName: fieldName }));
            
            // Process instructions for step-by-step guidance
            this.processInstructions();
            
        } catch (error) {
            console.error('Error loading field data:', error);
            this.showToast('Error', 'Failed to load field data: ' + this.getErrorMessage(error), 'error');
            this.fieldsArray = [];
        } finally {
            this.isLoadingFields = false;
        }
    }

    // ========== INSTRUCTION PROCESSING ==========

    processInstructions() {
        if (!this.objectFieldsData) {
            this.instructionSteps = [];
            return;
        }

        // Check if we have custom instructions
        if (this.objectFieldsData.instructions && this.objectFieldsData.instructions.length > 0) {
            console.log('Using custom instructions from database:', this.objectFieldsData.instructions);
            this.instructionSteps = this.objectFieldsData.instructions.map(instruction => ({
                ...instruction,
                fieldComponents: instruction.fields.map(field => ({ apiName: field })),
                isCompleted: false,
                isActive: false,
                completionPercentage: 0,
                completedFields: 0,
                totalFields: instruction.fields.length,
                cssClass: 'instruction-step slds-var-m-bottom_small',
                textCssClass: 'slds-text-body_regular',
                fieldCssClass: ''
            }));
            
            // Mark first step as active
            if (this.instructionSteps.length > 0) {
                this.instructionSteps[0].isActive = true;
            }
        } else {
            console.log('No custom instructions found, generating generic ones');
            this.generateGenericInstructions();
        }
        
        // Update step progress
        this.updateStepProgress();
    }

    generateGenericInstructions() {
        if (!this.objectFieldsData || !this.objectFieldsData.fields) {
            this.instructionSteps = [];
            return;
        }

        const fields = this.objectFieldsData.fields;
        const instructions = [];
        
        // Group fields into logical steps (4-5 fields per step for better UX)
        const fieldsPerStep = 5;
        let stepId = 1;
        
        for (let i = 0; i < fields.length; i += fieldsPerStep) {
            const stepFields = fields.slice(i, i + fieldsPerStep);
            
            instructions.push({
                id: stepId,
                stepNumber: stepId,
                text: `Complete section ${stepId} fields`,
                fields: stepFields,
                fieldComponents: stepFields.map(field => ({ apiName: field })),
                isCompleted: false,
                isActive: stepId === 1, // First step is active by default
                completionPercentage: 0,
                completedFields: 0,
                totalFields: stepFields.length,
                cssClass: 'instruction-step slds-var-m-bottom_small',
                textCssClass: 'slds-text-body_regular',
                fieldCssClass: ''
            });
            stepId++;
        }
        
        this.instructionSteps = instructions;
        console.log('Generated generic instructions:', this.instructionSteps);
    }

    // ========== FIELD CHANGE HANDLING ==========

    handleFieldChange(event) {
        const fieldName = event.target.fieldName;
        const value = event.target.value;
        
        if (value != null && value !== '') {
            this.filledFields.add(fieldName);
        } else {
            this.filledFields.delete(fieldName);
        }
        
        // Trigger reactivity
        this.filledFields = new Set(this.filledFields);
        
        // Update step progress
        this.updateStepProgress();
    }

    // Check if step is completed based on filled fields
    checkStepCompletion(instruction) {
        const stepFields = instruction.fields || [];
        return stepFields.some(field => this.filledFields.has(field));
    }

    // Update step progress based on filled fields
    updateStepProgress() {
        // Update completed steps based on field completion
        this.updateCompletedSteps();
        
        // Update instruction step UI states
        this.instructionSteps = this.instructionSteps.map((instruction, index) => {
            const completedFieldsCount = instruction.fields.filter(field => 
                this.filledFields.has(field)
            ).length;
            
            const isCompleted = this.completedSteps.has(instruction.id);
            const completionPercentage = instruction.totalFields > 0 
                ? Math.round((completedFieldsCount / instruction.totalFields) * 100) 
                : 0;
            
            // Determine if step is active (first step or previous step is completed)
            const previousStepCompleted = index === 0 || 
                (this.instructionSteps[index - 1] && 
                 this.completedSteps.has(this.instructionSteps[index - 1].id));
            
            return {
                ...instruction,
                completedFields: completedFieldsCount,
                completionPercentage: completionPercentage,
                isCompleted: isCompleted,
                isActive: !isCompleted && previousStepCompleted,
                cssClass: isCompleted 
                    ? 'instruction-step slds-var-m-bottom_small slds-theme_success'
                    : 'instruction-step slds-var-m-bottom_small',
                textCssClass: isCompleted 
                    ? 'slds-text-body_regular slds-text-color_success'
                    : 'slds-text-body_regular',
                fieldCssClass: isCompleted ? 'slds-theme_success' : ''
            };
        });
    }

    // Update completed steps
    updateCompletedSteps() {
        this.completedSteps.clear();
        this.instructionSteps.forEach(instruction => {
            if (this.checkStepCompletion(instruction)) {
                this.completedSteps.add(instruction.id);
            }
        });
        // Force reactivity
        this.completedSteps = new Set(this.completedSteps);
    }

    handleSuccess(event) {
        const recordId = event.detail.id;
        console.log(`${this.selectedObject} created: ${recordId}`);
        this.showToast('Success', `${this.selectedObject} record created successfully!`, 'success');
        
        // Reset form
        this.selectedObject = '';
        this.filledFields.clear();
        this.completedSteps.clear();
        this.fieldsArray = [];
        this.objectFieldsData = null;
        this.instructionSteps = [];
        this.isLoadingFields = false;
    }

    handleError(event) {
        console.error('Create error', event.detail);
        this.showToast('Error', 'Failed to create record: ' + event.detail.message, 'error');
    }

    handleClearForm() {
        // Reset form by clearing all field values
        const inputFields = this.template.querySelectorAll('lightning-input-field');
        inputFields.forEach(field => {
            field.reset();
        });
        
        // Reset progress tracking
        this.filledFields.clear();
        this.filledFields = new Set();
        this.updateCompletedSteps();
        
        this.showToast('Info', 'Form has been cleared', 'info');
    }


    // Getter for static card title
    get cardTitle() {
        return 'Dynamic Record Creator';
    }

    // Dynamic create button label
    get createButtonLabel() {
        return this.selectedObject ? `Create ${this.selectedObject}` : 'Create Record';
    }

    // Get progress indicator steps
    get progressSteps() {
        return this.instructionSteps.map(instruction => ({
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

    // ========== UTILITY METHODS ==========

    showToast(title, message, variant) {
        const evt = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant,
            mode: variant === 'error' ? 'sticky' : 'dismissable'
        });
        this.dispatchEvent(evt);
    }

    getErrorMessage(error) {
        if (error?.body?.message) {
            return error.body.message;
        } else if (error?.message) {
            return error.message;
        } else if (typeof error === 'string') {
            return error;
        } else {
            return 'An unknown error occurred';
        }
    }
}