import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getAnalysisById from '@salesforce/apex/AnalysisService.getAnalysisById';
import getInstructionsForAnalysis from '@salesforce/apex/InstructionManagerService.getInstructionsForAnalysis';

export default class FieldAnalysisContainer extends LightningElement {
    @api analysisId; // For edit mode - ID of the analysis to edit
    @api mode; // 'edit' or 'new' (default)
    
    @track currentStep = 'step1';
    @track analysisData = {};
    @track isEditMode = false;
    @track isLoading = false;
    
    // Step computed properties
    get isStep1() { return this.currentStep === 'step1'; }
    get isStep2() { return this.currentStep === 'step2'; }
    get isStep3() { return this.currentStep === 'step3'; }
    
    // Progress indicator configuration
    get currentStepNumber() {
        switch(this.currentStep) {
            case 'step1': return "1";
            case 'step2': return "2";
            case 'step3': return "3";
            default: return "1";
        }
    }
    
    async connectedCallback() {
        // Check if we're in edit mode and load existing data
        if (this.mode === 'edit' && this.analysisId) {
            this.isEditMode = true;
            await this.loadExistingAnalysis();
        }
    }
    
    async loadExistingAnalysis() {
        this.isLoading = true;
        
        try {
            // Load the parent analysis record
            const analysisRecord = await getAnalysisById({ analysisId: this.analysisId });
            
            // Load the child instruction records (sections)
            const instructionsData = await getInstructionsForAnalysis({ analysisId: this.analysisId });
            
            // Build analysisData from loaded records
            this.analysisData = {
                selectedObject: analysisRecord.Object_Name__c,
                selectedRecordType: analysisRecord.Record_Type_Id__c,
                selectedRecordTypeName: analysisRecord.Record_Type_Name__c || 'Master',
                formName: analysisRecord.Name,
                allSelectedFields: analysisRecord.Selected_Fields__c ? 
                    analysisRecord.Selected_Fields__c.split(',').map(field => field.trim()) : [],
                sections: instructionsData.instructions ? instructionsData.instructions.map(instruction => ({
                    stepNumber: instruction.stepNumber,
                    text: instruction.text,
                    fields: instruction.fields || []
                })) : []
            };
            
            // Start at step 1 (object selection) for edit mode so user can see all prefilled data
            this.currentStep = 'step1';
            
        } catch (error) {
            console.error('Error loading existing analysis:', error);
            this.showToast('Error', 'Failed to load analysis for editing: ' + (error.body?.message || error.message), 'error');
            // Stay on step 1 if loading fails
        } finally {
            this.isLoading = false;
        }
    }
    
    // Event handlers for step navigation
    handleObjectSelected(event) {
        // Preserve existing sections and other data when navigating from step 1 to step 2
        const existingSections = this.analysisData.sections;
        const existingAllSelectedFields = this.analysisData.allSelectedFields;
        
        this.analysisData.selectedObject = event.detail.objectName;
        this.analysisData.selectedRecordType = event.detail.recordTypeId;
        this.analysisData.selectedRecordTypeName = event.detail.recordTypeName;
        this.analysisData.formName = event.detail.formName;
        
        // Restore preserved sections data if it exists
        if (existingSections) {
            this.analysisData.sections = existingSections;
        }
        if (existingAllSelectedFields) {
            this.analysisData.allSelectedFields = existingAllSelectedFields;
        }
        
        this.currentStep = 'step2'; // Go directly to Create Sections
    }
    
    handleSectionsCreated(event) {
        this.analysisData.sections = event.detail.sections;
        this.analysisData.allSelectedFields = event.detail.allSelectedFields;
        this.currentStep = 'step3'; // Go to Review & Save (triggers auto field analysis)
    }
    
    handleSectionsSync(event) {
        // Sync sections data without navigation (used when going back from step 2)
        this.analysisData.sections = event.detail.sections;
        this.analysisData.allSelectedFields = event.detail.allSelectedFields;
    }
    
    handleAnalysisSaved(event) {
        this.showToast('Success', event.detail.message, 'success');
        this.handleStartOver();
    }
    
    // Navigation methods
    handleGoBack() {
        switch(this.currentStep) {
            case 'step2':
                this.currentStep = 'step1';
                break;
            case 'step3':
                this.currentStep = 'step2';
                break;
            default:
                break;
        }
    }
    
    handleStartOver() {
        this.currentStep = 'step1';
        this.analysisData = {};
    }
    
    // Error handling
    handleError(event) {
        this.showToast('Error', event.detail.message, 'error');
    }
    
    // Utility methods
    showToast(title, message, variant) {
        const event = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant
        });
        this.dispatchEvent(event);
    }
}