import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

// Import Apex methods
import getAllSalesforceObjects from '@salesforce/apex/FieldAnalysisService.getAllSalesforceObjects';
import getObjectRecordTypes from '@salesforce/apex/FieldAnalysisService.getObjectRecordTypes';
import getObjectFields from '@salesforce/apex/FieldAnalysisService.getObjectFields';
import analyzeSelectedFields from '@salesforce/apex/FieldAnalysisService.analyzeSelectedFields';
import generateFieldAnalysisReport from '@salesforce/apex/FieldAnalysisService.generateFieldAnalysisReport';
import analyzeFieldsAndGenerateReport from '@salesforce/apex/FieldAnalysisService.analyzeFieldsAndGenerateReport';
import createAnalysisRecord from '@salesforce/apex/FieldAnalysisService.createAnalysisRecord';

export default class DynamicFieldAnalyzer extends LightningElement {
    
    // Object Selection
    @track objectOptions = [];
    @track selectedObject = '';
    
    // Record Type Selection
    @track recordTypeOptions = [];
    @track selectedRecordType = '';
    @track selectedRecordTypeName = '';
    @track selectedRecordTypeDescription = '';
    @track showRecordTypeSelector = false;
    
    // Field Selection
    @track availableFields = [];
    @track selectedFields = [];
    
    // Analysis Results
    @track analysisReport = '';
    @track fieldAnalysisDetails = [];
    
    // Loading States
    @track isLoadingObjects = false;
    @track isLoadingRecordTypes = false;
    @track isLoadingFields = false;
    @track isAnalyzing = false;
    @track isSaving = false;
    
    // Wire Salesforce Objects
    @wire(getAllSalesforceObjects)
    wiredObjects({ data, error }) {
        console.log('wiredObjects called with data:', data, 'error:', error);
        if (data) {
            console.log('Successfully loaded', data.length, 'objects');
            this.objectOptions = data.map(obj => ({
                label: obj.label,
                value: obj.value
            }));
            console.log('Mapped objectOptions:', this.objectOptions);
        } else if (error) {
            console.error('Error loading objects:', error);
            console.error('Error details:', JSON.stringify(error));
            this.showToast('Error', 'Failed to load Salesforce objects: ' + this.getErrorMessage(error), 'error');
        }
    }
    
    // Handle Object Selection
    handleObjectChange(event) {
        console.log('handleObjectChange called with:', event.detail.value);
        this.selectedObject = event.detail.value;
        this.resetObjectDependentData();
        
        if (this.selectedObject) {
            console.log('Loading record types for:', this.selectedObject);
            this.loadRecordTypes();
        }
    }
    
    // Reset data when object changes
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
    }
    
    // Load Record Types for Selected Object
    async loadRecordTypes() {
        console.log('loadRecordTypes started for:', this.selectedObject);
        this.isLoadingRecordTypes = true;
        
        try {
            const recordTypes = await getObjectRecordTypes({ objectName: this.selectedObject });
            console.log('Received record types:', recordTypes);
            
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
                    this.loadFields();
                } else {
                    // Multiple record types - show selector
                    this.showRecordTypeSelector = true;
                    
                    // Auto-select default record type if available
                    const defaultRT = recordTypes.find(rt => rt.isDefault);
                    if (defaultRT) {
                        this.selectedRecordType = defaultRT.value;
                        this.selectedRecordTypeName = defaultRT.label;
                        this.selectedRecordTypeDescription = defaultRT.description;
                        this.loadFields();
                    }
                }
            }
            
        } catch (error) {
            console.error('Error loading record types:', error);
            console.error('Error details:', JSON.stringify(error));
            this.showToast('Error', 'Failed to load record types: ' + this.getErrorMessage(error), 'error');
        } finally {
            console.log('loadRecordTypes finished, isLoadingRecordTypes set to false');
            this.isLoadingRecordTypes = false;
        }
    }
    
    // Handle Record Type Selection
    handleRecordTypeChange(event) {
        this.selectedRecordType = event.detail.value;
        
        // Find selected record type details
        const selectedRT = this.recordTypeOptions.find(rt => rt.value === this.selectedRecordType);
        if (selectedRT) {
            this.selectedRecordTypeName = selectedRT.label;
            this.selectedRecordTypeDescription = selectedRT.description;
        }
        
        // Reset field selection when record type changes
        this.availableFields = [];
        this.selectedFields = [];
        this.analysisReport = '';
        
        if (this.selectedRecordType) {
            this.loadFields();
        }
    }
    
    // Load Fields for Selected Object and Record Type
    async loadFields() {
        console.log('loadFields started for object:', this.selectedObject, 'recordType:', this.selectedRecordType);
        this.isLoadingFields = true;
        
        try {
            const fields = await getObjectFields({ 
                objectName: this.selectedObject, 
                recordTypeId: this.selectedRecordType 
            });
            console.log('Received fields:', fields);
            
            if (fields) {
                this.availableFields = fields.map(field => ({
                    label: `${field.label} (${field.type})${field.required ? ' *' : ''}`,
                    value: field.value
                }));
            }
            
        } catch (error) {
            console.error('Error loading fields:', error);
            console.error('Error details:', JSON.stringify(error));
            this.showToast('Error', 'Failed to load fields: ' + this.getErrorMessage(error), 'error');
        } finally {
            console.log('loadFields finished');
            this.isLoadingFields = false;
        }
    }
    
    // Handle Field Selection in Dual Listbox
    handleFieldSelection(event) {
        this.selectedFields = event.detail.value;
        
        // Clear analysis when field selection changes
        if (this.analysisReport) {
            this.analysisReport = '';
            this.fieldAnalysisDetails = [];
        }
    }
    
    // Analyze Selected Fields
    async handleAnalyzeFields() {
        if (!this.selectedFields || this.selectedFields.length === 0) {
            this.showToast('Warning', 'Please select at least one field to analyze.', 'warning');
            return;
        }
        
        this.isAnalyzing = true;
        
        try {
            console.log('Starting field analysis with params:', {
                objectName: this.selectedObject,
                recordTypeId: this.selectedRecordType,
                recordTypeName: this.selectedRecordTypeName,
                selectedFields: this.selectedFields
            });
            
            // Get both analysis details and report in one call to avoid data loss
            this.analysisReport = await analyzeFieldsAndGenerateReport({
                objectName: this.selectedObject,
                recordTypeId: this.selectedRecordType,
                recordTypeName: this.selectedRecordTypeName,
                selectedFieldNames: this.selectedFields
            });
            
            // Also get the field analysis details separately for saving functionality
            this.fieldAnalysisDetails = await analyzeSelectedFields({
                objectName: this.selectedObject,
                recordTypeId: this.selectedRecordType,
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
    
    // Save Analysis to Custom Object
    async handleSaveAnalysis() {
        if (!this.analysisReport) {
            this.showToast('Warning', 'No analysis to save. Please analyze fields first.', 'warning');
            return;
        }
        
        this.isSaving = true;
        
        try {
            const recordId = await createAnalysisRecord({
                objectName: this.selectedObject,
                recordTypeName: this.selectedRecordTypeName,
                recordTypeId: this.selectedRecordType,
                selectedFields: this.selectedFields,
                analysisDetails: this.analysisReport
            });
            
            this.showToast('Success', `Analysis saved successfully! Record ID: ${recordId}`, 'success');
            
        } catch (error) {
            console.error('Error saving analysis:', error);
            this.showToast('Error', 'Failed to save analysis: ' + this.getErrorMessage(error), 'error');
        } finally {
            this.isSaving = false;
        }
    }
    
    // Clear Field Selection
    handleClearSelection() {
        this.selectedFields = [];
        this.analysisReport = '';
        this.fieldAnalysisDetails = [];
    }
    
    // Clear Analysis Results
    handleClearAnalysis() {
        this.analysisReport = '';
        this.fieldAnalysisDetails = [];
    }
    
    // Computed Properties
    get showMainContent() {
        return this.selectedObject && this.selectedRecordType && !this.isLoadingRecordTypes && !this.isLoadingFields;
    }
    
    get fieldSelectionTitle() {
        return `Field Selection - ${this.selectedObject}${this.selectedRecordTypeName ? ' (' + this.selectedRecordTypeName + ')' : ''}`;
    }
    
    get analyzeDisabled() {
        return !this.selectedFields || this.selectedFields.length === 0 || this.isAnalyzing;
    }
    
    get clearDisabled() {
        return !this.selectedFields || this.selectedFields.length === 0;
    }
    
    // Utility Methods
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