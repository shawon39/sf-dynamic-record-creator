import { LightningElement, api, track } from 'lwc';
import getObjectFields from '@salesforce/apex/FieldService.getObjectFields';

export default class SectionBuilder extends LightningElement {
    @api selectedObject;
    @api selectedRecordType;
    @api selectedRecordTypeName;
    @api initialSections;
    
    @track availableFields = []; // All object fields
    @track allocatedFields = []; // Fields already assigned to sections
    @track sections = [];
    @track currentSection = null; // Section being created/edited
    @track isLoadingFields = false;
    
    // Tracking for UI state
    nextSectionOrder = 1;
    nextTempId = 1;
    @track isInitialized = false;
    
    async connectedCallback() {
        await this.loadObjectFields();
        this.initializeFromParentData();
    }
    
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
    
    // Initialize component with existing sections from parent
    initializeFromParentData() {
        if (!this.isInitialized && this.initialSections && this.initialSections.length > 0) {
            this.sections = this.initialSections.map(section => ({
                id: 'temp_' + this.nextTempId++,
                sectionOrder: section.stepNumber,
                sectionName: section.text,
                selectedFields: section.fields || [],
                fieldsList: (section.fields || []).join(', '),
                isEditing: false
            }));
            
            // Update allocated fields
            this.allocatedFields = [];
            this.sections.forEach(section => {
                this.allocatedFields.push(...section.selectedFields);
            });
            
            // Update next section order
            this.nextSectionOrder = Math.max(...this.sections.map(s => s.sectionOrder)) + 1;
            
            this.isInitialized = true;
        }
    }
    
    // Get fields not yet allocated to any section
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
        
        // Check for duplicate section name
        const existingSectionNames = this.sections.map(s => s.sectionName.toLowerCase());
        if (existingSectionNames.includes(sectionName.trim().toLowerCase())) {
            this.dispatchErrorEvent('Section name already exists');
            return;
        }
        
        // Add fields to allocated list
        this.allocatedFields = [...this.allocatedFields, ...selectedFields];
        
        // Add section to list
        const newSection = {
            ...this.currentSection,
            sectionName: sectionName.trim(),
            selectedFields: selectedFields,
            fieldsList: selectedFields.join(', '),
            isEditing: false
        };
        
        this.sections = [...this.sections, newSection];
        this.currentSection = null;
    }
    
    handleCancelSection() {
        // Reset next section order if we're canceling
        this.nextSectionOrder--;
        this.currentSection = null;
    }
    
    handleEditSection(event) {
        const sectionId = event.target.dataset.id;
        const sectionToEdit = this.sections.find(s => s.id === sectionId);
        
        if (sectionToEdit) {
            // Return fields to available pool temporarily
            this.allocatedFields = this.allocatedFields.filter(field => 
                !sectionToEdit.selectedFields.includes(field)
            );
            
            // Remove from sections list temporarily
            this.sections = this.sections.filter(s => s.id !== sectionId);
            
            // Set as current section for editing
            this.currentSection = {
                ...sectionToEdit,
                isEditing: true
            };
        }
    }
    
    handleDeleteSection(event) {
        const sectionId = event.target.dataset.id;
        const sectionToDelete = this.sections.find(s => s.id === sectionId);
        
        if (sectionToDelete) {
            // Return fields to available pool
            this.allocatedFields = this.allocatedFields.filter(field => 
                !sectionToDelete.selectedFields.includes(field)
            );
            
            // Remove section
            this.sections = this.sections.filter(s => s.id !== sectionId);
            
            // Renumber sections
            this.sections = this.sections.map((section, index) => ({
                ...section,
                sectionOrder: index + 1,
                fieldsList: section.selectedFields.join(', ')
            }));
            
            this.nextSectionOrder = this.sections.length + 1;
        }
    }
    
    handleMoveUp(event) {
        const sectionId = event.target.dataset.id;
        const currentIndex = this.sections.findIndex(s => s.id === sectionId);
        
        if (currentIndex > 0) {
            const sections = [...this.sections];
            [sections[currentIndex - 1], sections[currentIndex]] = [sections[currentIndex], sections[currentIndex - 1]];
            
            // Renumber sections
            this.sections = sections.map((section, index) => ({
                ...section,
                sectionOrder: index + 1,
                fieldsList: section.selectedFields.join(', ')
            }));
        }
    }
    
    handleMoveDown(event) {
        const sectionId = event.target.dataset.id;
        const currentIndex = this.sections.findIndex(s => s.id === sectionId);
        
        if (currentIndex < this.sections.length - 1) {
            const sections = [...this.sections];
            [sections[currentIndex], sections[currentIndex + 1]] = [sections[currentIndex + 1], sections[currentIndex]];
            
            // Renumber sections
            this.sections = sections.map((section, index) => ({
                ...section,
                sectionOrder: index + 1,
                fieldsList: section.selectedFields.join(', ')
            }));
        }
    }
    
    handleContinue() {
        if (this.sections.length === 0) {
            this.dispatchErrorEvent('Please create at least one section');
            return;
        }
        
        // Get all selected fields across all sections
        const allSelectedFields = [];
        this.sections.forEach(section => {
            allSelectedFields.push(...section.selectedFields);
        });
        
        // Prepare section data for backend (reuse instruction format)
        const sectionsForBackend = this.sections.map(section => ({
            stepNumber: section.sectionOrder,
            text: section.sectionName, // Section name stored as instruction text
            fields: section.selectedFields
        }));
        
        // Dispatch event
        const sectionsEvent = new CustomEvent('sectionscreated', {
            detail: {
                sections: sectionsForBackend,
                allSelectedFields: allSelectedFields
            }
        });
        this.dispatchEvent(sectionsEvent);
    }
    
    handleGoBack() {
        const backEvent = new CustomEvent('goback');
        this.dispatchEvent(backEvent);
    }
    
    // Utility methods
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
