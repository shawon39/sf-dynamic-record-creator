import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getObjectFields from '@salesforce/apex/FieldService.getObjectFields';
import analyzeFieldsAndGenerateReport from '@salesforce/apex/FieldService.analyzeFieldsAndGenerateReport';

export default class FieldSelector extends LightningElement {
    @api selectedObject;
    @api selectedRecordType;
    @api selectedRecordTypeName;
    
    // API properties for receiving existing data from parent
    @api initialSelectedFields;
    @api initialAnalysisReport;
    @api initialFieldAnalysisDetails;
    
    @track availableFields = [];
    @track selectedFields = [];
    @track analysisReport = '';
    @track fieldAnalysisDetails = [];
    
    // Loading states
    @track isLoadingFields = false;
    @track isAnalyzing = false;
    
    // UI state
    @track showAnalysisResults = false;
    
    // Track if component has been initialized
    @track isInitialized = false;
    
    connectedCallback() {
        if (this.selectedObject) {
            this.loadObjectFields();
        }
    }
    
    // Initialize component with existing data from parent
    initializeFromParentData() {
        if (!this.isInitialized) {
            if (this.initialSelectedFields && this.initialSelectedFields.length > 0) {
                this.selectedFields = [...this.initialSelectedFields];
            }
            
            if (this.initialAnalysisReport) {
                this.analysisReport = this.initialAnalysisReport;
                this.showAnalysisResults = true;
            }
            
            if (this.initialFieldAnalysisDetails && this.initialFieldAnalysisDetails.length > 0) {
                this.fieldAnalysisDetails = [...this.initialFieldAnalysisDetails];
            }
            
            this.isInitialized = true;
        }
    }
    
    async loadObjectFields() {
        this.isLoadingFields = true;
        
        try {
            const fields = await getObjectFields({ objectName: this.selectedObject });
            
            this.availableFields = fields.map(field => ({
                label: field.label + (field.required ? ' *' : '') + ' (' + field.type + ')',
                value: field.value,
                type: field.type,
                required: field.required
            }));
            
            console.log('Loaded ' + this.availableFields.length + ' fields for ' + this.selectedObject);
            
            // Initialize with existing data after fields are loaded
            this.initializeFromParentData();
            
        } catch (error) {
            console.error('Error loading fields:', error);
            this.dispatchErrorEvent('Failed to load object fields: ' + this.getErrorMessage(error));
        } finally {
            this.isLoadingFields = false;
        }
    }
    
    handleFieldSelection(event) {
        this.selectedFields = event.detail.value;
        this.showAnalysisResults = false;
    }
    
    async handleAnalyzeFields() {
        if (!this.selectedFields || this.selectedFields.length === 0) {
            this.dispatchErrorEvent('Please select at least one field to analyze');
            return;
        }
        
        this.isAnalyzing = true;
        
        try {
            const result = await analyzeFieldsAndGenerateReport({
                objectName: this.selectedObject,
                selectedFields: this.selectedFields
            });
            
            this.analysisReport = result.analysisReport;
            this.fieldAnalysisDetails = result.fieldDetails;
            this.showAnalysisResults = true;
            
            // Show success toast notification
            this.dispatchEvent(new ShowToastEvent({
                title: 'Analysis Complete',
                message: `Successfully analyzed ${this.selectedFieldsCount} fields`,
                variant: 'success'
            }));
            
            console.log('Field analysis completed successfully');
            
        } catch (error) {
            console.error('Error analyzing fields:', error);
            this.dispatchErrorEvent('Failed to analyze fields: ' + this.getErrorMessage(error));
        } finally {
            this.isAnalyzing = false;
        }
    }
    
    handleContinue() {
        if (!this.selectedFields || this.selectedFields.length === 0) {
            this.dispatchErrorEvent('Please select and analyze fields before continuing');
            return;
        }
        
        if (!this.showAnalysisResults) {
            this.dispatchErrorEvent('Please analyze the selected fields before continuing');
            return;
        }
        
        // Dispatch event with analysis data
        const analyzedEvent = new CustomEvent('fieldsanalyzed', {
            detail: {
                selectedFields: this.selectedFields,
                analysisReport: this.analysisReport,
                fieldAnalysisDetails: this.fieldAnalysisDetails
            }
        });
        this.dispatchEvent(analyzedEvent);
    }
    
    handleGoBack() {
        const backEvent = new CustomEvent('goback');
        this.dispatchEvent(backEvent);
    }
    
    // Computed properties
    get hasSelectedFields() {
        return this.selectedFields && this.selectedFields.length > 0;
    }
    
    get canAnalyze() {
        return this.hasSelectedFields && !this.isAnalyzing;
    }
    
    get isAnalyzeDisabled() {
        return !this.canAnalyze;
    }
    
    get canContinue() {
        return this.hasSelectedFields && this.showAnalysisResults;
    }
    
    get isContinueDisabled() {
        return !this.canContinue;
    }
    
    get selectedFieldsCount() {
        return this.selectedFields ? this.selectedFields.length : 0;
    }
    
    get totalFieldsCount() {
        return this.availableFields ? this.availableFields.length : 0;
    }
    
    // Utility methods
    dispatchErrorEvent(message) {
        const errorEvent = new CustomEvent('error', {
            detail: { message }
        });
        this.dispatchEvent(errorEvent);
    }
    

    getErrorMessage(error) {
        if (error && error.body) {
            if (error.body.message) {
                return error.body.message;
            }
            if (error.body.pageErrors && error.body.pageErrors.length > 0) {
                return error.body.pageErrors[0].message;
            }
        }
        return error.message || 'Unknown error occurred';
    }
}