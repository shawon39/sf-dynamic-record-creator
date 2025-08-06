import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

// Import Apex methods for field analysis
import getAllSalesforceObjects from '@salesforce/apex/FieldAnalysisService.getAllSalesforceObjects';
import getObjectRecordTypes from '@salesforce/apex/FieldAnalysisService.getObjectRecordTypes';
import getObjectFields from '@salesforce/apex/FieldAnalysisService.getObjectFields';
import analyzeFieldsAndGenerateReport from '@salesforce/apex/FieldAnalysisService.analyzeFieldsAndGenerateReport';
import createAnalysisRecord from '@salesforce/apex/FieldAnalysisService.createAnalysisRecord';

// Import Apex methods for instruction management
import saveInstructions from '@salesforce/apex/InstructionManagerService.saveInstructions';

export default class DynamicFieldAnalyzer extends LightningElement {
    
    // Step Management
    @track currentStep = 'step1';
    
    // Object Selection (Step 1)
    @track objectOptions = [];
    @track selectedObject = '';
    @track recordTypeOptions = [];
    @track selectedRecordType = '';
    @track selectedRecordTypeName = '';
    @track selectedRecordTypeDescription = '';
    @track showRecordTypeSelector = false;
    
    // Field Selection & Analysis (Step 2)
    @track availableFields = [];
    @track selectedFields = [];
    @track analysisReport = '';
    @track fieldAnalysisDetails = [];
    
    // Instructions (Step 3)
    @track instructions = [];
    @track fieldOptionsForInstructions = [];
    nextStepNumber = 1;
    nextTempId = 1;
    
    // Loading States
    @track isLoadingObjects = false;
    @track isLoadingRecordTypes = false;
    @track isLoadingFields = false;
    @track isAnalyzing = false;
    @track isSaving = false;
    
    // Data persistence for the complete analysis
    analysisRecordId = null;

    // Step computed properties
    get isStep1() { return this.currentStep === 'step1'; }
    get isStep2() { return this.currentStep === 'step2'; }
    get isStep3() { return this.currentStep === 'step3'; }
    get isStep4() { return this.currentStep === 'step4'; }

    // Wire Salesforce Objects
    @wire(getAllSalesforceObjects)
    wiredObjects({ data, error }) {
        if (data) {
            this.objectOptions = data.map(obj => ({
                label: obj.label,
                value: obj.value
            }));
        } else if (error) {
            console.error('Error loading objects:', error);
            this.showToast('Error', 'Failed to load Salesforce objects: ' + this.getErrorMessage(error), 'error');
        }
    }

    // ========== STEP 1: OBJECT SELECTION ==========
    
    handleObjectChange(event) {
        this.selectedObject = event.detail.value;
        this.resetObjectDependentData();
        
        if (this.selectedObject) {
            this.loadRecordTypes();
        }
    }
    
    resetObjectDependentData() {
        this.recordTypeOptions = [];
        this.selectedRecordType = '';
        this.selectedRecordTypeName = '';
        this.selectedRecordTypeDescription = '';
        this.showRecordTypeSelector = false;
        this.availableFields = [];
        this.selectedFields = [];
        this.analysisReport = '';
        this.fieldAnalysisDetails = [];
        this.instructions = [];
        this.fieldOptionsForInstructions = [];
        this.nextStepNumber = 1;
        this.nextTempId = 1;
        this.analysisRecordId = null;
    }
    
    async loadRecordTypes() {
        this.isLoadingRecordTypes = true;
        
        try {
            const recordTypes = await getObjectRecordTypes({ objectName: this.selectedObject });
            
            if (recordTypes && recordTypes.length > 0) {
                this.recordTypeOptions = recordTypes.map(rt => ({
                    label: rt.label,
                    value: rt.value,
                    description: rt.description,
                    isDefault: rt.isDefault
                }));
                
                // Auto-select if only one record type (Master) or select default
                if (recordTypes.length === 1) {
                    this.selectedRecordType = recordTypes[0].value;
                    this.selectedRecordTypeName = recordTypes[0].label;
                    this.selectedRecordTypeDescription = recordTypes[0].description;
                    this.showRecordTypeSelector = false;
                } else {
                    // Multiple record types - show selector
                    this.showRecordTypeSelector = true;
                    
                    // Auto-select default record type if available
                    const defaultRT = recordTypes.find(rt => rt.isDefault);
                    if (defaultRT) {
                        this.selectedRecordType = defaultRT.value;
                        this.selectedRecordTypeName = defaultRT.label;
                        this.selectedRecordTypeDescription = defaultRT.description;
                    }
                }
            }
            
        } catch (error) {
            console.error('Error loading record types:', error);
            this.showToast('Error', 'Failed to load record types: ' + this.getErrorMessage(error), 'error');
        } finally {
            this.isLoadingRecordTypes = false;
        }
    }
    
    handleRecordTypeChange(event) {
        this.selectedRecordType = event.detail.value;
        
        // Find selected record type details
        const selectedRT = this.recordTypeOptions.find(rt => rt.value === this.selectedRecordType);
        if (selectedRT) {
            this.selectedRecordTypeName = selectedRT.label;
            this.selectedRecordTypeDescription = selectedRT.description;
        }
        
        // Reset dependent data when record type changes
        this.availableFields = [];
        this.selectedFields = [];
        this.analysisReport = '';
        this.instructions = [];
    }

    // ========== STEP 2: FIELD ANALYSIS ==========
    
    async loadFields() {
        this.isLoadingFields = true;
        
        try {
            const fields = await getObjectFields({ 
                objectName: this.selectedObject, 
                recordTypeId: this.selectedRecordType 
            });
            
            if (fields) {
                this.availableFields = fields.map(field => ({
                    label: `${field.label} (${field.type})${field.required ? ' *' : ''}`,
                    value: field.value
                }));
            }
            
        } catch (error) {
            console.error('Error loading fields:', error);
            this.showToast('Error', 'Failed to load fields: ' + this.getErrorMessage(error), 'error');
        } finally {
            this.isLoadingFields = false;
        }
    }
    
    handleFieldSelection(event) {
        this.selectedFields = event.detail.value;
        
        // Update field options for instructions
        this.fieldOptionsForInstructions = this.selectedFields.map(field => ({
            label: field,
            value: field
        }));
        
        // Clear analysis when field selection changes
        if (this.analysisReport) {
            this.analysisReport = '';
            this.fieldAnalysisDetails = [];
        }
    }
    
    async handleQuickAnalyze() {
        if (!this.selectedFields || this.selectedFields.length === 0) {
            this.showToast('Warning', 'Please select at least one field to analyze.', 'warning');
            return;
        }
        
        this.isAnalyzing = true;
        
        try {
            this.analysisReport = await analyzeFieldsAndGenerateReport({
                objectName: this.selectedObject,
                recordTypeId: this.selectedRecordType,
                recordTypeName: this.selectedRecordTypeName,
                selectedFieldNames: this.selectedFields
            });
            
            this.showToast('Success', `Analysis completed for ${this.selectedFields.length} field(s).`, 'success');
            
        } catch (error) {
            console.error('Error analyzing fields:', error);
            this.showToast('Error', 'Failed to analyze fields: ' + this.getErrorMessage(error), 'error');
        } finally {
            this.isAnalyzing = false;
        }
    }

    // ========== STEP 3: INSTRUCTIONS ==========
    
    handleAddInstruction() {
        const newInstruction = {
            id: 'temp_' + this.nextTempId++,
            stepNumber: this.nextStepNumber++,
            text: '',
            fields: [],
            isEditing: true,
            isNew: true,
            isFirst: this.instructions.length === 0,
            isLast: true
        };

        // Update isLast for existing instructions
        this.instructions = this.instructions.map(inst => ({
            ...inst,
            isLast: false
        }));

        this.instructions = [...this.instructions, newInstruction];
    }

    handleMenuAction(event) {
        const action = event.detail.value;
        const stepId = event.currentTarget.dataset.id;
        
        console.log(`Menu action: ${action} for instruction: ${stepId}`);
        
        switch (action) {
            case 'edit':
                this.handleEditInstruction(stepId);
                break;
            case 'moveup':
                this.handleMoveInstruction(stepId, 'moveup');
                break;
            case 'movedown':
                this.handleMoveInstruction(stepId, 'movedown');
                break;
            case 'delete':
                this.handleDeleteInstruction(stepId);
                break;
            default:
                console.warn('Unknown menu action:', action);
        }
    }

    handleEditInstruction(stepId) {
        this.instructions = this.instructions.map(inst => ({
            ...inst,
            isEditing: inst.id === stepId,
            originalData: inst.id === stepId ? { ...inst } : inst.originalData
        }));
    }

    handleInstructionTextChange(event) {
        const stepId = event.target.dataset.id;
        const newText = event.target.value;
        
        this.instructions = this.instructions.map(inst => 
            inst.id === stepId ? { ...inst, text: newText } : inst
        );
    }

    handleInstructionFieldChange(event) {
        const stepId = event.target.dataset.id;
        const selectedFields = event.detail.value;
        
        this.instructions = this.instructions.map(inst => 
            inst.id === stepId ? { ...inst, fields: selectedFields } : inst
        );
    }

    handleSaveInstruction(event) {
        const stepId = event.target.dataset.id;
        const instruction = this.instructions.find(inst => inst.id === stepId);
        
        // Enhanced validation
        if (!instruction.text || !instruction.text.trim()) {
            this.showToast('Error', 'Instruction text is required', 'error');
            return;
        }
        
        if (instruction.text.trim().length < 3) {
            this.showToast('Error', 'Instruction text must be at least 3 characters long', 'error');
            return;
        }
        
        if (!instruction.stepNumber || instruction.stepNumber <= 0) {
            this.showToast('Error', 'Valid step number is required', 'error');
            return;
        }

        // Update the instruction with clean data
        this.instructions = this.instructions.map(inst => ({
            ...inst,
            isEditing: inst.id === stepId ? false : inst.isEditing,
            text: inst.id === stepId ? inst.text.trim() : inst.text, // Clean whitespace
            originalData: inst.id === stepId ? { ...inst, text: inst.text.trim() } : inst.originalData
        }));
        
        this.showToast('Success', 'Instruction saved', 'success');
    }

    handleCancelEditInstruction(event) {
        const stepId = event.target.dataset.id;
        const instruction = this.instructions.find(inst => inst.id === stepId);
        
        if (instruction.isNew) {
            // Remove new instruction
            this.instructions = this.instructions.filter(inst => inst.id !== stepId);
            this.nextStepNumber--;
        } else {
            // Restore original data
            this.instructions = this.instructions.map(inst => 
                inst.id === stepId ? { ...inst.originalData, isEditing: false } : inst
            );
        }
        
        this.updatePositionFlags();
    }

    handleMoveInstruction(stepId, direction) {
        const currentIndex = this.instructions.findIndex(inst => inst.id === stepId);
        
        if (direction === 'moveup' && currentIndex > 0) {
            this.swapInstructions(currentIndex, currentIndex - 1);
        } else if (direction === 'movedown' && currentIndex < this.instructions.length - 1) {
            this.swapInstructions(currentIndex, currentIndex + 1);
        }
    }

    swapInstructions(index1, index2) {
        const newInstructions = [...this.instructions];
        [newInstructions[index1], newInstructions[index2]] = [newInstructions[index2], newInstructions[index1]];
        
        // Update step numbers
        newInstructions[index1].stepNumber = index1 + 1;
        newInstructions[index2].stepNumber = index2 + 1;
        
        this.instructions = newInstructions;
        this.updatePositionFlags();
    }

    handleDeleteInstruction(stepId) {
        // Remove from list
        this.instructions = this.instructions.filter(inst => inst.id !== stepId);
        
        this.reorderStepNumbers();
        this.updatePositionFlags();
    }

    reorderStepNumbers() {
        this.instructions = this.instructions.map((inst, index) => ({
            ...inst,
            stepNumber: index + 1
        }));
        this.nextStepNumber = this.instructions.length + 1;
    }

    updatePositionFlags() {
        this.instructions = this.instructions.map((inst, index) => ({
            ...inst,
            isFirst: index === 0,
            isLast: index === this.instructions.length - 1
        }));
    }

    // ========== VALIDATION METHODS ==========
    
    validateInstructions() {
        // Check if there are any instructions still in edit mode
        const editingInstructions = this.instructions.filter(inst => inst.isEditing);
        if (editingInstructions.length > 0) {
            this.showToast('Warning', 'Please save or cancel all instructions in edit mode before proceeding', 'warning');
            return false;
        }
        
        // Validate each instruction
        for (let i = 0; i < this.instructions.length; i++) {
            const inst = this.instructions[i];
            
            if (!inst.text || !inst.text.trim() || inst.text.trim().length < 3) {
                this.showToast('Error', `Instruction ${inst.stepNumber} has invalid text. Please fix or remove it.`, 'error');
                return false;
            }
            
            if (!inst.stepNumber || inst.stepNumber <= 0) {
                this.showToast('Error', `Instruction ${i + 1} has invalid step number. Please fix or remove it.`, 'error');
                return false;
            }
        }
        
        return true;
    }

    // ========== STEP 4: SAVE ANALYSIS ==========
    
    async handleSaveCompleteAnalysis() {
        if (!this.selectedFields || this.selectedFields.length === 0) {
            this.showToast('Warning', 'No fields selected to save.', 'warning');
            return;
        }
        
        // Validate instructions before saving
        if (this.instructions.length > 0 && !this.validateInstructions()) {
            return; // Validation failed, error message already shown
        }
        
        this.isSaving = true;
        
        try {
            // First create the analysis record
            this.analysisRecordId = await createAnalysisRecord({
                objectName: this.selectedObject,
                recordTypeName: this.selectedRecordTypeName,
                recordTypeId: this.selectedRecordType,
                selectedFields: this.selectedFields,
                analysisDetails: this.analysisReport || 'Analysis completed'
            });
            
            console.log('Analysis record created with ID:', this.analysisRecordId);
            
            // Then save the instructions if any exist
            if (this.instructions.length > 0) {
                console.log('Processing instructions for save:', this.instructions);
                
                // Auto-commit any instructions still in editing mode with valid content
                this.instructions = this.instructions.map(inst => {
                    const hasValidText = inst.text && typeof inst.text === 'string' && inst.text.trim().length > 0;
                    const hasValidStepNumber = inst.stepNumber && typeof inst.stepNumber === 'number' && inst.stepNumber > 0;
                    
                    // Auto-commit editing instructions that have valid content
                    if (inst.isEditing && hasValidText && hasValidStepNumber) {
                        return { ...inst, isEditing: false };
                    }
                    return inst;
                });
                
                const instructionsToSave = this.instructions
                    .filter(inst => {
                        // Filter: must have valid text and step number (editing state no longer matters)
                        const hasValidText = inst.text && typeof inst.text === 'string' && inst.text.trim().length > 0;
                        const hasValidStepNumber = inst.stepNumber && typeof inst.stepNumber === 'number' && inst.stepNumber > 0;
                        
                        console.log(`Instruction ${inst.id}: text="${inst.text}", stepNumber=${inst.stepNumber}, isEditing=${inst.isEditing}`);
                        console.log(`Valid text: ${hasValidText}, Valid step: ${hasValidStepNumber}`);
                        
                        return hasValidText && hasValidStepNumber;
                    })
                    .map(inst => ({
                        id: inst.isNew ? null : inst.id,
                        analysisId: this.analysisRecordId,
                        stepNumber: parseInt(inst.stepNumber), // Ensure it's an integer
                        text: inst.text.trim(), // Trim whitespace
                        fields: inst.fields || [] // Ensure fields is an array
                    }));
                
                console.log('Instructions to save after filtering:', instructionsToSave);
                
                if (instructionsToSave.length > 0) {
                    await saveInstructions({ 
                        analysisId: this.analysisRecordId,
                        instructions: instructionsToSave 
                    });
                    console.log('Instructions saved successfully');
                } else {
                    console.log('No valid instructions to save');
                }
            } else {
                console.log('No instructions to save');
            }
            
            this.showToast('Success', `Analysis and instructions saved successfully! Record ID: ${this.analysisRecordId}`, 'success');
            
            // Reset for next use
            this.handleStartOver();
            
        } catch (error) {
            console.error('Error saving complete analysis:', error);
            console.error('Error details:', error);
            this.showToast('Error', 'Failed to save complete analysis: ' + this.getErrorMessage(error), 'error');
        } finally {
            this.isSaving = false;
        }
    }

    handleStartOver() {
        // Reset all data and go back to step 1
        this.currentStep = 'step1';
        this.selectedObject = '';
        this.resetObjectDependentData();
    }

    // ========== NAVIGATION ==========
    
    async handleNext() {
        const currentStepNumber = parseInt(this.currentStep.replace('step', ''));
        
        // Validate current step before proceeding
        if (currentStepNumber === 1) {
            if (!this.selectedObject || !this.selectedRecordType) {
                this.showToast('Warning', 'Please select both object and record type before proceeding.', 'warning');
                return;
            }
            // Load fields for step 2
            await this.loadFields();
        } else if (currentStepNumber === 2) {
            if (!this.selectedFields || this.selectedFields.length === 0) {
                this.showToast('Warning', 'Please select at least one field before proceeding.', 'warning');
                return;
            }
            // Analysis is optional for preview - no auto-analysis needed for navigation
        } else if (currentStepNumber === 3) {
            // Step 3 is optional - user can proceed without instructions
        }
        
        // Move to next step
        if (currentStepNumber < 4) {
            this.currentStep = `step${currentStepNumber + 1}`;
        }
    }
    
    handlePrevious() {
        const currentStepNumber = parseInt(this.currentStep.replace('step', ''));
        if (currentStepNumber > 1) {
            this.currentStep = `step${currentStepNumber - 1}`;
        }
    }

    // ========== COMPUTED PROPERTIES ==========
    
    get fieldSelectionTitle() {
        return `Field Selection - ${this.selectedObject}${this.selectedRecordTypeName ? ' (' + this.selectedRecordTypeName + ')' : ''}`;
    }
    
    get nextDisabled() {
        if (this.currentStep === 'step1') {
            return !this.selectedObject || !this.selectedRecordType || this.isLoadingRecordTypes;
        } else if (this.currentStep === 'step2') {
            return !this.selectedFields || this.selectedFields.length === 0 || this.isLoadingFields;
        }
        return false; // Step 3 can always proceed (instructions are optional)
    }
    
    get quickAnalyzeDisabled() {
        return !this.selectedFields || this.selectedFields.length === 0 || this.isAnalyzing;
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