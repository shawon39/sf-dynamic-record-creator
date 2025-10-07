import { LightningElement, api, track } from 'lwc';
import getObjectFields from '@salesforce/apex/FieldService.getObjectFields';

export default class SectionBuilder extends LightningElement {
    @api selectedObject;
    @api selectedRecordType;
    @api selectedRecordTypeName;
    @api initialSections;
    
    @track availableFields = [];
    @track allocatedFields = [];
    @track sections = [];
    @track currentSection = null;
    @track isLoadingFields = false;
    
    nextSectionOrder = 1;
    nextTempId = 1;
    @track isInitialized = false;
    
    async connectedCallback() {
        await this.loadObjectFields();
        this.initializeFromParentData();
    }
    
    // Load all available fields for selected object
    async loadObjectFields() {
        if (!this.selectedObject) return;
        
        this.isLoadingFields = true;
        try {
            const fields = await getObjectFields({ objectName: this.selectedObject });
            this.availableFields = fields.map(field => ({
                label: field.label,
                value: field.value
            }));
        } catch (error) {
            console.error('Error loading fields:', error);
            this.dispatchErrorEvent('Failed to load fields: ' + this.getErrorMessage(error));
        } finally {
            this.isLoadingFields = false;
        }
    }
    
    // Restore existing sections when editing (only once)
    initializeFromParentData() {
        if (!this.isInitialized && this.initialSections && this.initialSections.length > 0) {
            this.sections = this.initialSections.map(section => ({
                id: 'temp_' + this.nextTempId++,
                sectionOrder: section.stepNumber,
                sectionName: section.text,
                selectedFields: section.fields || [],
                fieldsList: (section.fields || []).join(', '),
                isEditing: false
            })).sort((a, b) => a.sectionOrder - b.sectionOrder);
            
            // Track which fields are already allocated to sections
            this.allocatedFields = [];
            this.sections.forEach(section => {
                this.allocatedFields.push(...section.selectedFields);
            });
            
            this.nextSectionOrder = Math.max(...this.sections.map(s => s.sectionOrder)) + 1;
            this.isInitialized = true;
        }
    }
    
    // Return fields not yet assigned to any section
    get unallocatedFields() {
        return this.availableFields.filter(field => 
            !this.allocatedFields.includes(field.value)
        );
    }
    
    get hasAvailableFields() {
        return this.unallocatedFields.length > 0;
    }
    
    get hasSections() {
        return this.sections && this.sections.length > 0;
    }
    
    get sectionCount() {
        return this.sections ? this.sections.length : 0;
    }
    
    get canContinue() {
        return this.sections.length > 0 && !this.currentSection;
    }
    
    get isContinueDisabled() {
        return !this.canContinue;
    }
    
    get addSectionDisabled() {
        return this.currentSection !== null || this.unallocatedFields.length === 0;
    }
    
    handleAddSection() {
        if (this.unallocatedFields.length === 0) {
            this.dispatchErrorEvent('No available fields to add to a new section');
            return;
        }
        
        this.currentSection = {
            id: 'temp_' + this.nextTempId++,
            sectionOrder: this.nextSectionOrder++,
            sectionName: '',
            selectedFields: [],
            isEditing: true
        };
    }
    
    // Validate and save new/edited section
    handleSaveSection() {
        const sectionNameInput = this.template.querySelector('[data-section-name]');
        const sectionFieldsInput = this.template.querySelector('[data-section-fields]');
        
        if (!sectionNameInput || !sectionFieldsInput) {
            this.dispatchErrorEvent('Required fields not found');
            return;
        }
        
        const sectionName = sectionNameInput.value;
        const selectedFields = sectionFieldsInput.value || [];
        
        if (!sectionName || !sectionName.trim()) {
            this.dispatchErrorEvent('Section name is required');
            return;
        }
        
        if (!selectedFields.length) {
            this.dispatchErrorEvent('Please select at least one field for this section');
            return;
        }
        
        // Prevent duplicate section names
        const existingSectionNames = this.sections.map(s => s.sectionName.toLowerCase());
        if (existingSectionNames.includes(sectionName.trim().toLowerCase())) {
            this.dispatchErrorEvent('Section name already exists');
            return;
        }
        
        this.allocatedFields = [...this.allocatedFields, ...selectedFields];
        
        const newSection = {
            ...this.currentSection,
            sectionName: sectionName.trim(),
            selectedFields: selectedFields,
            fieldsList: selectedFields.join(', '),
            isEditing: false
        };
        
        this.sections = [...this.sections, newSection].sort((a, b) => a.sectionOrder - b.sectionOrder);
        this.currentSection = null;
    }
    
    handleCancelSection() {
        this.nextSectionOrder--;
        this.currentSection = null;
    }
    
    // Load section for editing (deallocates its fields)
    handleEditSection(event) {
        const sectionId = event.target.dataset.id;
        const sectionToEdit = this.sections.find(s => s.id === sectionId);
        
        if (sectionToEdit) {
            // Free up fields for reallocation
            this.allocatedFields = this.allocatedFields.filter(field => 
                !sectionToEdit.selectedFields.includes(field)
            );
            
            this.sections = this.sections.filter(s => s.id !== sectionId);
            
            this.currentSection = {
                ...sectionToEdit,
                isEditing: true
            };
        }
    }
    
    // Remove section and free its fields
    handleDeleteSection(event) {
        const sectionId = event.target.dataset.id;
        const sectionToDelete = this.sections.find(s => s.id === sectionId);
        
        if (sectionToDelete) {
            // Free up fields from deleted section
            this.allocatedFields = this.allocatedFields.filter(field => 
                !sectionToDelete.selectedFields.includes(field)
            );
            
            this.sections = this.sections.filter(s => s.id !== sectionId);
            
            // Renumber sections after deletion
            this.sections = this.sections.map((section, index) => ({
                ...section,
                sectionOrder: index + 1,
                fieldsList: section.selectedFields.join(', ')
            }));
            
            this.nextSectionOrder = this.sections.length + 1;
        }
    }
    
    // Reorder section up in display order
    handleMoveUp(event) {
        const sectionId = event.target.dataset.id;
        const currentIndex = this.sections.findIndex(s => s.id === sectionId);
        
        if (currentIndex > 0) {
            const sections = [...this.sections];
            [sections[currentIndex - 1], sections[currentIndex]] = [sections[currentIndex], sections[currentIndex - 1]];
            
            // Renumber after reordering
            this.sections = sections.map((section, index) => ({
                ...section,
                sectionOrder: index + 1,
                fieldsList: section.selectedFields.join(', ')
            }));
        }
    }
    
    // Reorder section down in display order
    handleMoveDown(event) {
        const sectionId = event.target.dataset.id;
        const currentIndex = this.sections.findIndex(s => s.id === sectionId);
        
        if (currentIndex < this.sections.length - 1) {
            const sections = [...this.sections];
            [sections[currentIndex], sections[currentIndex + 1]] = [sections[currentIndex + 1], sections[currentIndex]];
            
            // Renumber after reordering
            this.sections = sections.map((section, index) => ({
                ...section,
                sectionOrder: index + 1,
                fieldsList: section.selectedFields.join(', ')
            }));
        }
    }
    
    // Validate and send sections to parent for review
    handleContinue() {
        if (this.sections.length === 0) {
            this.dispatchErrorEvent('Please create at least one section');
            return;
        }
        
        const allSelectedFields = [];
        this.sections.forEach(section => {
            allSelectedFields.push(...section.selectedFields);
        });
        
        const sectionsForBackend = this.sections.map(section => ({
            stepNumber: section.sectionOrder,
            text: section.sectionName,
            fields: section.selectedFields
        }));
        
        const sectionsEvent = new CustomEvent('sectionscreated', {
            detail: {
                sections: sectionsForBackend,
                allSelectedFields: allSelectedFields
            }
        });
        this.dispatchEvent(sectionsEvent);
    }
    
    // Sync current sections when navigating back
    handleGoBack() {
        if (this.sections.length > 0) {
            const allSelectedFields = [];
            this.sections.forEach(section => {
                allSelectedFields.push(...section.selectedFields);
            });
            
            const sectionsForBackend = this.sections.map(section => ({
                stepNumber: section.sectionOrder,
                text: section.sectionName,
                fields: section.selectedFields
            }));
            
            const syncEvent = new CustomEvent('sectionssync', {
                detail: {
                    sections: sectionsForBackend,
                    allSelectedFields: allSelectedFields
                }
            });
            this.dispatchEvent(syncEvent);
        }
        
        const backEvent = new CustomEvent('goback');
        this.dispatchEvent(backEvent);
    }
    
    dispatchErrorEvent(message) {
        const errorEvent = new CustomEvent('error', {
            detail: { message }
        });
        this.dispatchEvent(errorEvent);
    }
    
    getErrorMessage(error) {
        return error.body?.message || error.message || 'Unknown error';
    }
}
