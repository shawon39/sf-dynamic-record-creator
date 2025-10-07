import { LightningElement, api, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import createCompleteAnalysisWithJSON from '@salesforce/apex/AnalysisService.createCompleteAnalysisWithJSON';
import updateCompleteAnalysisWithJSON from '@salesforce/apex/AnalysisService.updateCompleteAnalysisWithJSON';
import analyzeFieldsAndGenerateJSONReport from '@salesforce/apex/FieldService.analyzeFieldsAndGenerateJSONReport';

export default class AnalysisReview extends NavigationMixin(LightningElement) {
    @api analysisData;
    @api analysisId;
    @api isEditMode = false;
    
    @track isSaving = false;
    @track isAnalyzing = true;
    @track autoAnalysisReport = '';
    @track autoFieldAnalysisDetails = [];
    
    // Auto-trigger field analysis when component loads
    async connectedCallback() {
        await this.performFieldAnalysis();
    }
    
    // Call AI service to analyze selected fields and generate report
    async performFieldAnalysis() {
        if (!this.analysisData?.allSelectedFields || this.analysisData.allSelectedFields.length === 0) {
            this.isAnalyzing = false;
            return;
        }
        
        try {
            this.isAnalyzing = true;
            
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
    
    // Transform sections data for display with field groupings
    get sections() {
        const sections = this.analysisData?.sections || [];
        return sections.map(section => ({
            sectionName: section.text,
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
    
    // Group field analysis details by section for organized display
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
        if (this.isSaving) {
            return this.isEditMode ? 'Updating Analysis Configuration...' : 'Saving Analysis Configuration...';
        }
        return this.isEditMode ? 'Update Analysis Configuration' : 'Save Analysis Configuration';
    }
    
    get saveButtonIcon() {
        return this.isSaving ? 'utility:spinner' : 'utility:save';
    }
    
    // Save or update analysis configuration with sections and field mappings
    async handleSaveAnalysis() {
        this.isSaving = true;
        
        try {
            if (!this.selectedObject) {
                throw new Error('Selected object is required');
            }
            
            if (!this.selectedFields || this.selectedFields.length === 0) {
                throw new Error('Selected fields are required');
            }
            
            const sectionsData = this.sections.map(section => ({
                stepNumber: section.sectionOrder,
                text: section.sectionName,
                fields: section.selectedFields || []
            }));
            
            let analysisId;
            let message;
            
            // Edit mode updates existing analysis, otherwise create new
            if (this.isEditMode && this.analysisId) {
                analysisId = await updateCompleteAnalysisWithJSON({
                    analysisId: this.analysisId,
                    objectName: this.selectedObject,
                    recordTypeName: this.selectedRecordTypeName,
                    recordTypeId: this.analysisData.selectedRecordType || '',
                    selectedFields: this.selectedFields,
                    sections: sectionsData,
                    formName: this.analysisData.formName || null
                });
                
                message = this.hasSections 
                    ? `Analysis configuration with ${this.sectionsCount} section(s) updated successfully!`
                    : `Analysis configuration updated successfully!`;
            } else {
                analysisId = await createCompleteAnalysisWithJSON({
                    objectName: this.selectedObject,
                    recordTypeName: this.selectedRecordTypeName,
                    recordTypeId: this.analysisData.selectedRecordType || '',
                    selectedFields: this.selectedFields,
                    sections: sectionsData,
                    formName: this.analysisData.formName || null
                });
                
                message = this.hasSections 
                    ? `Analysis configuration with ${this.sectionsCount} section(s) saved successfully!`
                    : `Analysis configuration saved successfully!`;
            }
            
            this.isSaving = false;
            
            // In edit mode, navigate to record detail; in new mode, notify parent
            if (this.isEditMode && this.analysisId) {
                this[NavigationMixin.Navigate]({
                    type: 'standard__recordPage',
                    attributes: {
                        recordId: this.analysisId,
                        objectApiName: 'Dynamic_Field_Analysis__c',
                        actionName: 'view'
                    }
                });
            } else {
                this.dispatchEvent(new CustomEvent('analysissaved', {
                    detail: {
                        message: message,
                        analysisId: analysisId
                    }
                }));
            }
            
        } catch (error) {
            console.error('Error saving analysis:', error);
            this.isSaving = false;
            this.dispatchEvent(new CustomEvent('error', {
                detail: { 
                    message: 'Failed to save analysis: ' + (error.body?.message || error.message || 'Unknown error')
                }
            }));
        }
    }
    
    handleGoBack() {
        this.dispatchEvent(new CustomEvent('goback'));
    }
}