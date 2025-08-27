import { LightningElement, api, track } from 'lwc';
import createCompleteAnalysisWithJSON from '@salesforce/apex/AnalysisService.createCompleteAnalysisWithJSON';
import analyzeFieldsAndGenerateJSONReport from '@salesforce/apex/FieldService.analyzeFieldsAndGenerateJSONReport';

export default class AnalysisReview extends LightningElement {
    @api analysisData;
    
    @track isSaving = false;
    @track isAnalyzing = true; // Start with analysis
    @track autoAnalysisReport = '';
    @track autoFieldAnalysisDetails = [];
    
    async connectedCallback() {
        // Auto-trigger field analysis when component loads
        await this.performFieldAnalysis();
    }
    
    async performFieldAnalysis() {
        if (!this.analysisData?.allSelectedFields || this.analysisData.allSelectedFields.length === 0) {
            this.isAnalyzing = false;
            return;
        }
        
        try {
            this.isAnalyzing = true;
            
            // Prepare sections data for the new JSON method
            const sectionsData = this.analysisData?.sections?.map(section => ({
                stepNumber: section.stepNumber,
                text: section.text,
                fields: section.fields || []
            })) || [];
            
            const result = await analyzeFieldsAndGenerateJSONReport({
                objectName: this.analysisData.selectedObject,
                recordTypeName: this.analysisData.selectedRecordTypeName || 'Master',
                recordTypeId: this.analysisData.selectedRecordType || '',
                selectedFields: this.analysisData.allSelectedFields,
                sections: sectionsData
            });
            
            this.autoAnalysisReport = result.analysisReport;
            this.autoFieldAnalysisDetails = result.fieldDetails;
            
        } catch (error) {
            console.error('Auto field analysis failed:', error);
            this.dispatchEvent(new CustomEvent('error', {
                detail: { 
                    message: 'Field analysis failed: ' + (error.body?.message || error.message || 'Unknown error')
                }
            }));
        } finally {
            this.isAnalyzing = false;
        }
    }
    
    // Simple computed properties for display
    get selectedObject() {
        return this.analysisData?.selectedObject || '';
    }
    
    get selectedRecordTypeName() {
        return this.analysisData?.selectedRecordTypeName || 'Master';
    }
    
    get selectedFields() {
        return this.analysisData?.allSelectedFields || [];
    }
    
    get selectedFieldsCount() {
        return this.selectedFields.length;
    }
    
    get selectedFieldsList() {
        return this.selectedFields.join(', ');
    }
    
    // Sections (replacing instructions)
    get sections() {
        const sections = this.analysisData?.sections || [];
        return sections.map(section => ({
            sectionName: section.text, // Section name from instruction text
            sectionOrder: section.stepNumber,
            selectedFields: section.fields || [],
            fieldsText: section.fields ? section.fields.join(', ') : '',
            hasFields: section.fields && section.fields.length > 0
        }));
    }
    
    get sectionsCount() {
        return this.sections.length;
    }
    
    get hasSections() {
        return this.sectionsCount > 0;
    }
    
    get analysisReport() {
        return this.autoAnalysisReport || '';
    }
    
    // Group field analysis by sections
    get sectionedFieldAnalysis() {
        const analysis = [];
        
        this.sections.forEach(section => {
            const sectionAnalysis = {
                sectionName: section.sectionName,
                sectionOrder: section.sectionOrder,
                fields: []
            };
            
            section.selectedFields.forEach(fieldName => {
                const fieldDetail = this.autoFieldAnalysisDetails.find(f => f.fieldName === fieldName);
                if (fieldDetail) {
                    sectionAnalysis.fields.push(fieldDetail);
                }
            });
            
            analysis.push(sectionAnalysis);
        });
        
        return analysis;
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
            
            // Prepare section data for Apex (reusing instruction format)
            const sectionsData = this.sections.map(section => ({
                stepNumber: section.sectionOrder,
                text: section.sectionName,
                fields: section.selectedFields || []
            }));
            
            // Call Apex method to create complete analysis with JSON format
            const analysisId = await createCompleteAnalysisWithJSON({
                objectName: this.selectedObject,
                recordTypeName: this.selectedRecordTypeName,
                recordTypeId: this.analysisData.selectedRecordType || '',
                selectedFields: this.selectedFields,
                sections: sectionsData
            });
            
            const message = this.hasSections 
                ? `Analysis configuration with ${this.sectionsCount} section(s) saved successfully!`
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