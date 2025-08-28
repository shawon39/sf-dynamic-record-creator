import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class FieldAnalysisContainer extends LightningElement {
    @track currentStep = 'step1';
    @track analysisData = {};
    
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
    
    
    // Event handlers for step navigation
    handleObjectSelected(event) {
        this.analysisData.selectedObject = event.detail.objectName;
        this.analysisData.selectedRecordType = event.detail.recordTypeId;
        this.analysisData.selectedRecordTypeName = event.detail.recordTypeName;
        this.analysisData.formName = event.detail.formName;
        this.currentStep = 'step2'; // Go directly to Create Sections
    }
    
    handleSectionsCreated(event) {
        this.analysisData.sections = event.detail.sections;
        this.analysisData.allSelectedFields = event.detail.allSelectedFields;
        this.currentStep = 'step3'; // Go to Review & Save (triggers auto field analysis)
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