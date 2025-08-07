import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class FieldAnalysisContainer extends LightningElement {
    @track currentStep = 'step1';
    @track analysisData = {};
    
    // Step computed properties
    get isStep1() { return this.currentStep === 'step1'; }
    get isStep2() { return this.currentStep === 'step2'; }
    get isStep3() { return this.currentStep === 'step3'; }
    get isStep4() { return this.currentStep === 'step4'; }
    
    // Progress indicator configuration
    get currentStepNumber() {
        switch(this.currentStep) {
            case 'step1': return "1";
            case 'step2': return "2";
            case 'step3': return "3";
            case 'step4': return "4";
            default: return "1";
        }
    }
    
    
    // Event handlers for step navigation
    handleObjectSelected(event) {
        this.analysisData.selectedObject = event.detail.objectName;
        this.analysisData.selectedRecordType = event.detail.recordTypeId;
        this.analysisData.selectedRecordTypeName = event.detail.recordTypeName;
        this.currentStep = 'step2';
    }
    
    handleFieldsAnalyzed(event) {
        this.analysisData.selectedFields = event.detail.selectedFields;
        this.analysisData.analysisReport = event.detail.analysisReport;
        this.analysisData.fieldAnalysisDetails = event.detail.fieldAnalysisDetails;
        this.currentStep = 'step3';
    }
    
    handleInstructionsCreated(event) {
        this.analysisData.instructions = event.detail.instructions;
        this.currentStep = 'step4';
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
            case 'step4':
                this.currentStep = 'step3';
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