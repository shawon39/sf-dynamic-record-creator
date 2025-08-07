import { LightningElement, api, track } from 'lwc';
import createCompleteAnalysis from '@salesforce/apex/AnalysisService.createCompleteAnalysis';

export default class AnalysisReview extends LightningElement {
    @api analysisData;
    
    @track isSaving = false;
    
    // Simple computed properties for display
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
    
    get selectedFieldsList() {
        return this.selectedFields.join(', ');
    }
    
    get instructions() {
        const instructions = this.analysisData?.instructions || [];
        return instructions.map(instruction => {
            return {
                ...instruction,
                hasFields: instruction.fields && instruction.fields.length > 0,
                fieldsText: instruction.fields ? instruction.fields.join(', ') : ''
            };
        });
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
    
    get saveButtonLabel() {
        return this.isSaving ? 'Saving Analysis Configuration...' : 'Save Analysis Configuration';
    }
    
    get saveButtonIcon() {
        return this.isSaving ? 'utility:spinner' : 'utility:save';
    }
    
    // Save the complete analysis
    async handleSaveAnalysis() {
        this.isSaving = true;
        
        try {
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
            
            // Call Apex method to create complete analysis
            const analysisId = await createCompleteAnalysis({
                objectName: this.selectedObject,
                recordTypeName: this.selectedRecordTypeName,
                recordTypeId: this.analysisData.selectedRecordType || '',
                selectedFields: this.selectedFields,
                analysisDetails: this.analysisReport || 'Analysis completed',
                instructions: instructionsData
            });
            
            const message = this.hasInstructions 
                ? `Analysis configuration with ${this.instructionsCount} instruction(s) saved successfully!`
                : `Analysis configuration saved successfully!`;
            
            // Reset saving state immediately on success
            this.isSaving = false;
            
            // Dispatch success event
            this.dispatchEvent(new CustomEvent('analysissaved', {
                detail: {
                    message: message,
                    analysisId: analysisId
                }
            }));
            
        } catch (error) {
            console.error('Error saving analysis:', error);
            
            // Reset saving state on error
            this.isSaving = false;
            
            // Dispatch error event
            this.dispatchEvent(new CustomEvent('error', {
                detail: { 
                    message: 'Failed to save analysis: ' + (error.body?.message || error.message || 'Unknown error')
                }
            }));
        }
    }
    
    // Handle navigation back to instructions
    handleGoBack() {
        this.dispatchEvent(new CustomEvent('goback'));
    }
}