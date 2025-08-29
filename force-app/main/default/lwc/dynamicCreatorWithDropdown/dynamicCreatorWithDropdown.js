// dynamicCreatorWithDropdown.js
import { LightningElement, track, wire } from 'lwc';
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';

// Import Apex methods
import getObjectFieldsData from '@salesforce/apex/DynamicObjectService.getObjectFieldsData';

// Import static resource
import AudioVisualization from '@salesforce/resourceUrl/AudioVisualization';

export default class DynamicCreatorWithDropdown extends NavigationMixin(LightningElement) {
    // URL param handling
    @track formPreselected = false;
    @track selectedForm;
    @track selectedFormName;
    @track selectedObject;
    @track recordTypeId;
    @track recordTypeName;
    @track sourceRecordId; // For navigation back to source record
    
     // Field and form data
    @track fieldsArray = [];
    @track objectFieldsData = null;
    @track sectionSteps = []; // Updated from sectionSteps
    @track filledFields = new Set();
    @track completedSteps = new Set();
    @track isLoadingFields = false;
    @track isCreating = false;
    
    // Success modal
    @track showSuccessModal = false;
    @track createdRecordId;

    connectedCallback() {
        // Prepare and attach stable handler references so removeEventListener works
        if (!this._boundFocusIn) {
            this._boundFocusIn = this.handleFieldFocus.bind(this);
        }
        if (!this._boundClick) {
            this._boundClick = this.handleTemplateClick.bind(this);
        }

        // Add event listeners for focus events on input fields and outside clicks
        this.template.addEventListener('focusin', this._boundFocusIn);
        this.template.addEventListener('click', this._boundClick);
    }

    disconnectedCallback() {
        // Remove event listeners using the same bound references
        if (this._boundFocusIn) {
            this.template.removeEventListener('focusin', this._boundFocusIn);
        }
        if (this._boundClick) {
            this.template.removeEventListener('click', this._boundClick);
        }
    }

    // Read URL params for deep-linking (c__formId or formId, c__recordId for navigation back)
    @wire(CurrentPageReference)
    setCurrentPageReference(pageRef) {
        try {
            const state = pageRef?.state || {};
            const formId = state.c__formId || state.formId || '';
            const recordId = state.c__recordId || state.recordId || '';
            
            
            if (formId) {
                // If param-driven and changed, reload
                if (formId !== this.selectedForm) {
                    this.formPreselected = true;
                    this.selectedForm = formId;
                    this.sourceRecordId = recordId; // Store source record ID for navigation back
                    this.resetFormState();
                    this.loadObjectFieldsData();
                }
            } else {
                // No param: allow on-page selector
                this.formPreselected = false;
            }
        } catch (e) {
            console.error('Error reading URL params', e);
        }
    }

    // No local selector UI; page expects a deep link

    // Wire adapter to fetch object metadata for record type (if needed)
    @wire(getObjectInfo, { objectApiName: '$selectedObject' })
    wiredInfo({ data, error }) {
        if (data && !this.recordTypeId) {
            // Use default record type if not already set from field analysis
            this.recordTypeId = data.defaultRecordTypeId;
        } else if (error) {
            console.error('Error loading object metadata', error);
        }
    }

    // ========== FORM SELECTION REMOVED ==========

    resetFormState() {
        this.filledFields.clear();
        this.completedSteps.clear();
        this.fieldsArray = [];
        this.objectFieldsData = null;
        this.sectionSteps = [];
        this.selectedObject = null;
        this.selectedFormName = null;
        this.recordTypeId = null;
        this.recordTypeName = '';
        this.isLoadingFields = false;
        this.showSuccessModal = false;
        this.createdRecordId = null;
    }

    // ========== DATA LOADING ==========

    async loadObjectFieldsData() {
        this.isLoadingFields = true;
        
        try {
            const result = await getObjectFieldsData({ analysisId: this.selectedForm });
            console.log('Field data received:', result);
            
            this.objectFieldsData = result;
            this.selectedObject = result.objectName;
            this.selectedFormName = result.formName;
            this.recordTypeId = result.recordTypeId;
            this.recordTypeName = result.recordTypeName || '';
            
            // Create fields array with API names and full-width logic
            this.fieldsArray = result.fields.map((fieldName, fieldIndex) => {
                const isFullWidth = (result.fields.length % 2 === 1) && (fieldIndex === result.fields.length - 1);
                return {
                    apiName: fieldName,
                    isFullWidth: isFullWidth,
                    cssClass: isFullWidth 
                        ? "slds-col slds-size_1-of-1 slds-var-m-bottom_x-small full-width-field"
                        : "slds-col slds-size_1-of-1 slds-medium-size_6-of-12 slds-var-m-bottom_x-small"
                };
            });
            
            // Process instructions for step-by-step guidance
            this.processSections();
            
        } catch (error) {
            console.error('Error loading field data:', error);
            this.showToast('Error', 'Failed to load form configuration: ' + this.getErrorMessage(error), 'error');
            this.fieldsArray = [];
        } finally {
            this.isLoadingFields = false;
        }
    }

    // ========== SECTION PROCESSING ==========

    processSections() {
        if (!this.objectFieldsData) {
            this.sectionSteps = [];
            return;
        }

        // Only show sections if we have custom sections from database
        if (this.objectFieldsData.instructions && this.objectFieldsData.instructions.length > 0) {
            console.log('Using custom sections from database:', this.objectFieldsData.instructions);
            this.sectionSteps = this.objectFieldsData.instructions.map((section, index) => ({
                ...section,
                sectionName: section.text, // Section name from Name field
                fieldComponents: section.fields.map((field, fieldIndex) => {
                    const isFullWidth = (section.fields.length % 2 === 1) && (fieldIndex === section.fields.length - 1);
                    return {
                        apiName: field,
                        isFullWidth: isFullWidth,
                        cssClass: isFullWidth 
                            ? "slds-col slds-size_1-of-1 slds-var-m-bottom_xx-small full-width-field"
                            : "slds-col slds-size_1-of-1 slds-small-size_6-of-12 slds-var-m-bottom_xx-small"
                    };
                }),
                isCompleted: false,
                isActive: index === 0, // First section is active by default
                completionPercentage: 0,
                completedFields: 0,
                totalFields: section.fields.length,
                cssClass: 'section-step slds-var-m-bottom_small',
                textCssClass: 'slds-text-body_regular',
                fieldCssClass: '',
                // Enhanced properties for section display
                sectionId: `section-${section.id || index}`,
                hasFields: section.fields && section.fields.length > 0
            }));
            
            // Update step progress
            this.updateStepProgress();
        } else {
            console.log('No custom sections found, not showing any sections');
            this.sectionSteps = [];
        }
    }
    
    // Get section progress for individual section
    getSectionProgress(section) {
        if (!section || !section.fieldComponents) {
            return { completed: 0, total: 0, percentage: 0 };
        }
        
        const filledFields = section.fieldComponents.filter(field => 
            this.filledFields.has(field.apiName)
        ).length;
        
        return {
            completed: filledFields,
            total: section.fieldComponents.length,
            percentage: section.fieldComponents.length > 0 ? 
                Math.round((filledFields / section.fieldComponents.length) * 100) : 0
        };
    }
    
    // Get sections with enhanced progress data
    get sectionsWithProgress() {
        return this.sectionSteps.map(section => ({
            ...section,
            progress: this.getSectionProgress(section),
            isComplete: this.getSectionProgress(section).percentage === 100
        }));
    }



    // ========== FIELD CHANGE HANDLING ==========

    handleFieldChange(event) {
        const fieldName = event.target.fieldName;
        const value = event.target.value;
        
        if (value != null && value !== '') {
            this.filledFields.add(fieldName);
        } else {
            this.filledFields.delete(fieldName);
        }
        
        // Trigger reactivity
        this.filledFields = new Set(this.filledFields);
        
        // Update step progress
        this.updateStepProgress();
        
        // Update section completion status
        this.updateSectionProgress(fieldName);
    }
    
    handleFieldFocus(event) {
        // Check if the focused element is within a lightning-input-field
        const inputField = event.target.closest('lightning-input-field');
        if (inputField) {
            const fieldName = inputField.fieldName || inputField.dataset.fieldName;
            console.log('Field focused:', fieldName);
            
            if (fieldName) {
                // Find which section this field belongs to and set it as active
                this.setActiveSectionByField(fieldName);
            }
        }
    }
    
    handleTemplateClick(event) {
        // Check if click is on a section item
        const sectionItem = event.target.closest('.slds-progress__item');
        if (sectionItem) {
            // Click is on a section item, don't remove border
            return;
        }
        
        // Check if click is on or within an input field
        const inputField = event.target.closest('lightning-input-field');
        if (inputField) {
            // Click is on an input field, don't remove border
            return;
        }
        
        // Click is outside section items and input fields, remove all active borders
        console.log('Click outside section items and input fields, clearing active highlights');
        this.clearAllActiveHighlights();
    }
    
    // Clear all active highlights from section navigation
    clearAllActiveHighlights() {
        try {
            // Remove active highlights from all navigation sections
            const allNavSections = this.template.querySelectorAll('.slds-progress__item');
            allNavSections.forEach(section => {
                section.classList.remove('progress-step-active');
            });
            
            // Clear active state from all sections (but keep filled field states)
            this.sectionSteps = this.sectionSteps.map(section => ({
                ...section,
                isActive: false
            }));
            
            console.log('Cleared all active section highlights');
        } catch (error) {
            console.error('Error clearing active highlights:', error);
        }
    }
    
    // Set active section based on which field is being edited
    setActiveSectionByField(fieldName) {
        const sectionWithField = this.sectionSteps.find(section => 
            section.fieldComponents && section.fieldComponents.some(field => field.apiName === fieldName)
        );
        
        if (sectionWithField) {
            console.log(`Setting active section to ${sectionWithField.sectionId} for field ${fieldName}`);
            this.setActiveSection(sectionWithField.sectionId);
            // Add visual highlight to the navigation section item
            this.highlightNavigationSection(sectionWithField.sectionId);
        }
    }
    
    // Add visual highlight to navigation section item - same as hover/click
    highlightNavigationSection(sectionId) {
        try {
            // Remove existing active highlights
            const allNavSections = this.template.querySelectorAll('.slds-progress__item');
            allNavSections.forEach(section => {
                section.classList.remove('progress-step-active');
            });
            
            // Find and highlight the target navigation section
            const targetNavSection = this.template.querySelector(`[data-section-id="${sectionId}"]`);
            if (targetNavSection) {
                console.log('Adding active highlight to navigation section:', sectionId);
                
                // Add the visual highlight with CSS outline
                targetNavSection.classList.add('progress-step-active');
            }
        } catch (error) {
            console.error('Error highlighting navigation section:', error);
        }
    }
    
    // Update progress for sections when field changes
    updateSectionProgress(changedFieldName) {
        this.sectionSteps = this.sectionSteps.map(section => {
            // Check if the changed field belongs to this section
            const fieldBelongsToSection = section.fieldComponents.some(
                field => field.apiName === changedFieldName
            );
            
            if (fieldBelongsToSection) {
                const progress = this.getSectionProgress(section);
                return {
                    ...section,
                    completionPercentage: progress.percentage,
                    completedFields: progress.completed,
                    isCompleted: progress.percentage === 100
                };
            }
            
            return section;
        });
    }
    
    // ========== SECTION NAVIGATION ==========
    
    // Handle section navigation clicks
    handleSectionClick(event) {
        const sectionId = event.currentTarget.dataset.sectionId;
        console.log('Section clicked:', sectionId);
        
        this.focusOnSection(sectionId);
        this.setActiveSection(sectionId);
        this.highlightNavigationSection(sectionId);
    }
    
    // Handle keyboard navigation for sections
    handleSectionKeyDown(event) {
        // Support Enter and Space keys for accessibility
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            const sectionId = event.currentTarget.dataset.sectionId;
            console.log('Section activated via keyboard:', sectionId);
            
            this.focusOnSection(sectionId);
            this.setActiveSection(sectionId);
            this.highlightNavigationSection(sectionId);
        }
    }
    
    // Scroll to and focus on specific section
    focusOnSection(sectionId) {
        try {
            // Find the target section in the main form area
            const targetSection = this.template.querySelector(`[data-section-id="${sectionId}"].section-container`);
            
            if (targetSection) {
                console.log('Scrolling to section:', sectionId);
                
                // Smooth scroll to the section
                targetSection.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'start',
                    inline: 'nearest'
                });
                
                // Add visual focus highlight (temporary) and remove after animation ends
                targetSection.classList.add('section-focused');
                const onAnimationEnd = () => {
                    targetSection.classList.remove('section-focused');
                    targetSection.removeEventListener('animationend', onAnimationEnd);
                };
                targetSection.addEventListener('animationend', onAnimationEnd);
            } else {
                console.warn('Target section not found:', sectionId);
            }
        } catch (error) {
            console.error('Error focusing on section:', error);
        }
    }
    
    // Update active section in navigation
    setActiveSection(sectionId) {
        try {
            // Update section active states
            this.sectionSteps = this.sectionSteps.map(section => ({
                ...section,
                isActive: section.sectionId === sectionId
            }));
            
            console.log('Active section set to:', sectionId);
        } catch (error) {
            console.error('Error setting active section:', error);
        }
    }

    // Check if step is completed based on filled fields
    checkStepCompletion(instruction) {
        const stepFields = instruction.fields || [];
        // Instruction is completed only when ALL related fields are filled
        return stepFields.length > 0 && stepFields.every(field => this.filledFields.has(field));
    }

    // Update step progress based on filled fields
    updateStepProgress() {
        // Only update if we have instructions
        if (!this.sectionSteps || this.sectionSteps.length === 0) {
            return;
        }
        
        // Update completed steps based on field completion
        this.updateCompletedSteps();
        
        // Update instruction step UI states
        this.sectionSteps = this.sectionSteps.map((instruction) => {
            const completedFieldsCount = instruction.fields.filter(field => 
                this.filledFields.has(field)
            ).length;
            
            const isCompleted = this.completedSteps.has(instruction.id);
            const completionPercentage = instruction.totalFields > 0 
                ? Math.round((completedFieldsCount / instruction.totalFields) * 100) 
                : 0;
            
            return {
                ...instruction,
                completedFields: completedFieldsCount,
                completionPercentage: completionPercentage,
                isCompleted: isCompleted,
                // Keep existing isActive state - don't change it automatically
                isActive: instruction.isActive,
                cssClass: isCompleted 
                    ? 'instruction-step slds-var-m-bottom_small slds-theme_success'
                    : 'instruction-step slds-var-m-bottom_small',
                textCssClass: isCompleted 
                    ? 'slds-text-body_regular slds-text-color_success'
                    : 'slds-text-body_regular',
                fieldCssClass: isCompleted ? 'slds-theme_success' : ''
            };
        });
    }

    // Update completed steps
    updateCompletedSteps() {
        this.completedSteps.clear();
        if (this.sectionSteps && this.sectionSteps.length > 0) {
            this.sectionSteps.forEach(instruction => {
                if (this.checkStepCompletion(instruction)) {
                    this.completedSteps.add(instruction.id);
                }
            });
        }
        // Force reactivity
        this.completedSteps = new Set(this.completedSteps);
    }

    handleSuccess(event) {
        const recordId = event.detail.id;
        console.log(`${this.selectedObject} created: ${recordId}`);
        this.showToast('Success', `${this.selectedObject} record created successfully!`, 'success');
        
        // Return to form selection for a clear post-success UX
        this.handleCancel();
    }

    handleError(event) {
        console.error('Create error', event.detail);
        this.showToast('Error', 'Failed to create record: ' + event.detail.message, 'error');
    }



    handleCancel() {
        this.navigateBack();
    }

    handleGoBack() {
        this.navigateBack();
    }

    navigateBack() {
        // If we have a source record ID, navigate back to that record
        if (this.sourceRecordId) {
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: {
                    recordId: this.sourceRecordId,
                    actionName: 'view'
                }
            });
            return;
        }

        // If form was preselected via URL param, navigate back to selector tab
        if (this.formPreselected) {
            
            const navigationState = {};
            // Pass the recordId back to Form Selector if we have one
            if (this.sourceRecordId) {
                navigationState.c__recordId = this.sourceRecordId;
            }
            
            this[NavigationMixin.Navigate]({
                type: 'standard__navItemPage',
                attributes: { apiName: 'Form_Selector' },
                state: navigationState
            });
            return;
        }
        
        // Fallback: reset to local selector UI
        this.selectedForm = '';
        this.resetFormState();
    }


    // Getter for static card title
    get cardTitle() {
        return 'Dynamic Record Creator';
    }

    // Check if we have custom instructions to show
    get hasSections() {
        return this.sectionSteps && this.sectionSteps.length > 0;
    }

    // Dynamic create button label
    get createButtonLabel() {
        return this.selectedObject ? `Create ${this.selectedObject}` : 'Create Record';
    }

    // Get progress indicator steps
    get progressSteps() {
        return this.sectionSteps.map(section => {
            const progress = this.getSectionProgress(section);
            const isCompleted = progress.percentage === 100;
            const hasAnyFilledFields = progress.completed > 0;
            const isActive = section.isActive || hasAnyFilledFields;
            
            return {
                ...section,
                text: section.sectionName,
                isCompleted: isCompleted,
                isActive: isActive && !isCompleted, // Active only if has fields but not completed
                completedFields: progress.completed,
                totalFields: progress.total,
                cssClass: isCompleted
                    ? 'slds-progress__item slds-is-completed progress-step-clickable' 
                    : isActive 
                        ? 'slds-progress__item slds-is-active progress-step-clickable'
                        : 'slds-progress__item progress-step-clickable'
            };
        });
    }

    // Progress calculations
    get totalFields() { 
        return this.fieldsArray.length; 
    }
    
    get filledCount() { 
        return this.filledFields.size; 
    }
    
    get progressValue() {
        return this.totalFields
            ? Math.round((this.filledCount / this.totalFields) * 100)
            : 0;
    }

    // ========== UTILITY METHODS ==========

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
        if (error?.body?.message) return error.body.message;
        if (error?.message) return error.message;
        if (typeof error === 'string') return error;
        return 'An unknown error occurred';
    }

    // Getter for AudioVisualization static resource URL
    get audioVisualizationUrl() {
        return AudioVisualization;
    }
}
