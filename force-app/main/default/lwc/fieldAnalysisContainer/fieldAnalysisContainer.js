import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getAnalysisById from '@salesforce/apex/AnalysisService.getAnalysisById';
import getInstructionsForAnalysis from '@salesforce/apex/InstructionManagerService.getInstructionsForAnalysis';

export default class FieldAnalysisContainer extends LightningElement {
    @api analysisId;
    @api mode;
    
    @track currentStep = 'step1';
    @track analysisData = {};
    @track isEditMode = false;
    @track isLoading = false;
    
    get isStep1() { return this.currentStep === 'step1'; }
    get isStep2() { return this.currentStep === 'step2'; }
    get isStep3() { return this.currentStep === 'step3'; }
    
    get currentStepNumber() {
        switch(this.currentStep) {
            case 'step1': return "1";
            case 'step2': return "2";
            case 'step3': return "3";
            default: return "1";
        }
    }
    
    // Load existing analysis data for editing
    async connectedCallback() {
        if (this.mode === 'edit' && this.analysisId) {
            this.isEditMode = true;
            await this.loadExistingAnalysis();
        }
    }
    
    // Fetch analysis configuration and sections from Salesforce
    async loadExistingAnalysis() {
        this.isLoading = true;
        
        try {
            const analysisRecord = await getAnalysisById({ analysisId: this.analysisId });
            const instructionsData = await getInstructionsForAnalysis({ analysisId: this.analysisId });
            
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
            
            this.currentStep = 'step1';
            
        } catch (error) {
            console.error('Error loading existing analysis:', error);
            this.showToast('Error', 'Failed to load analysis for editing: ' + (error.body?.message || error.message), 'error');
        } finally {
            this.isLoading = false;
        }
    }
    
    // Step 1: Capture object selection and advance to section builder
    handleObjectSelected(event) {
        const existingSections = this.analysisData.sections;
        const existingAllSelectedFields = this.analysisData.allSelectedFields;
        
        this.analysisData.selectedObject = event.detail.objectName;
        this.analysisData.selectedRecordType = event.detail.recordTypeId;
        this.analysisData.selectedRecordTypeName = event.detail.recordTypeName;
        this.analysisData.formName = event.detail.formName;
        
        // Preserve existing sections when going back
        if (existingSections) {
            this.analysisData.sections = existingSections;
        }
        if (existingAllSelectedFields) {
            this.analysisData.allSelectedFields = existingAllSelectedFields;
        }
        
        this.currentStep = 'step2';
    }
    
    // Step 2: Capture section configuration and advance to review
    handleSectionsCreated(event) {
        this.analysisData.sections = event.detail.sections;
        this.analysisData.allSelectedFields = event.detail.allSelectedFields;
        this.currentStep = 'step3';
    }
    
    // Sync sections when navigating back from review without advancing
    handleSectionsSync(event) {
        this.analysisData.sections = event.detail.sections;
        this.analysisData.allSelectedFields = event.detail.allSelectedFields;
    }
    
    handleAnalysisSaved(event) {
        this.showToast('Success', event.detail.message, 'success');
        this.handleStartOver();
    }
    
    // Navigate to previous step (preserves data)
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
    
    // Reset wizard to start new analysis
    handleStartOver() {
        this.currentStep = 'step1';
        this.analysisData = {};
    }
    
    handleError(event) {
        this.showToast('Error', event.detail.message, 'error');
    }
    
    showToast(title, message, variant) {
        const event = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant
        });
        this.dispatchEvent(event);
    }
}