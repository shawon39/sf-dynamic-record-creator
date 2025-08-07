import { LightningElement, api, track } from 'lwc';
import createCompleteAnalysis from '@salesforce/apex/AnalysisService.createCompleteAnalysis';

export default class AnalysisReview extends LightningElement {
    @api analysisData;
    
    @track isSaving = false;
    
    // Computed properties for display
    get selectedObject() {
        return this.analysisData?.selectedObject || '';
    }
    
    get selectedRecordTypeName() {
        return this.analysisData?.selectedRecordTypeName || 'Master';
    }
    
    get selectedFields() {
        return this.analysisData?.selectedFields || [];
    }
    
    get selectedFieldsCount() {
        return this.selectedFields.length;
    }
    
    get instructions() {
        return this.analysisData?.instructions || [];
    }
    
    get instructionsCount() {
        return this.instructions.length;
    }
    
    get hasInstructions() {
        return this.instructionsCount > 0;
    }
    
    get analysisReport() {
        return this.analysisData?.analysisReport || '';
    }
    
    get fieldAnalysisDetails() {
        return this.analysisData?.fieldAnalysisDetails || [];
    }
    
    get selectedFieldsList() {
        return this.selectedFields.join(', ');
    }
    
    // Save the complete analysis
    async handleSaveAnalysis() {
        this.isSaving = true;
        
        try {
            console.log('Starting save operation...');
            console.log('Analysis data:', JSON.stringify(this.analysisData));
            
            // Validate required data
            if (!this.selectedObject) {
                throw new Error('Selected object is required');
            }
            
            if (!this.selectedFields || this.selectedFields.length === 0) {
                throw new Error('Selected fields are required');
            }
            
            // Prepare instruction data for Apex
            const instructionsData = this.instructions.map(instruction => ({
                stepNumber: instruction.stepNumber,
                text: instruction.text,
                fields: instruction.fields || []
            }));
            
            console.log('Calling createCompleteAnalysis with:', {
                objectName: this.selectedObject,
                recordTypeName: this.selectedRecordTypeName,
                recordTypeId: this.analysisData.selectedRecordType,
                selectedFields: this.selectedFields,
                analysisDetails: this.analysisReport,
                instructions: instructionsData
            });
            
            // Call Apex method to create complete analysis
            const analysisId = await createCompleteAnalysis({
                objectName: this.selectedObject,
                recordTypeName: this.selectedRecordTypeName,
                recordTypeId: this.analysisData.selectedRecordType || '',
                selectedFields: this.selectedFields,
                analysisDetails: this.analysisReport || 'Analysis completed',
                instructions: instructionsData
            });
            
            console.log('Analysis created successfully with ID:', analysisId);
            
            const message = this.hasInstructions 
                ? `Complete analysis with ${this.instructionsCount} instruction(s) saved successfully! Record ID: ${analysisId}`
                : `Analysis saved successfully! Record ID: ${analysisId}`;
            
            // Dispatch success event
            const savedEvent = new CustomEvent('analysissaved', {
                detail: {
                    message: message,
                    analysisId: analysisId
                }
            });
            this.dispatchEvent(savedEvent);
            
        } catch (error) {
            console.error('Error saving analysis:', error);
            this.dispatchErrorEvent('Failed to save analysis: ' + this.getErrorMessage(error));
        } finally {
            this.isSaving = false;
        }
    }
    
    handleGoBack() {
        const backEvent = new CustomEvent('goback');
        this.dispatchEvent(backEvent);
    }
    
    handleStartOver() {
        const startOverEvent = new CustomEvent('startover');
        this.dispatchEvent(startOverEvent);
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