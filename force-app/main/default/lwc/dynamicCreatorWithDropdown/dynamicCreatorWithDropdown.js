// dynamicCreatorWithDropdown.js
import { LightningElement, track, wire } from 'lwc';
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';
import Listening from "@salesforce/resourceUrl/Listening"; // Current image
import RPISTOLWC from "@salesforce/messageChannel/FORMMC__c";
import { subscribe, MessageContext } from 'lightning/messageService';

// Import Apex methods
import getObjectFieldsData from '@salesforce/apex/DynamicObjectService.getObjectFieldsData';
import getContactAndAccountData from '@salesforce/apex/DynamicObjectService.getContactAndAccountData';


export default class DynamicCreatorWithDropdown extends NavigationMixin(LightningElement) {
    @wire(MessageContext)
    context;

    // URL param handling
    @track formPreselected = false;
    @track selectedForm;
    @track selectedFormName;
    @track selectedObject;
    @track recordTypeId;
    @track recordTypeName;
    @track sourceRecordId; // For navigation back to source record
    @track contactId; // Contact ID from URL for auto-population

    // Static image for listening visualization
    listeningImageUrl = Listening; // Using new Listening image
    // voiceVisualizationUrl = voiceVisualization; // Backup option
    
    // External form identification
    @track externalFormId; // Unique identifier for form instances
    @track isEditMode = false; // Flag to distinguish new vs edit forms
    
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
    
    // Session storage for form persistence
    _saveDataTimeout;

    RPISTOLWCSubscription = null;

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

        this.subscribeRPISTOLWCMC();
    }

    subscribeRPISTOLWCMC() {
        console.log('dynamicCreatorWithDropDown: Subscribing to RPISTOLWC!!');
        if (this.RPISTOLWCSubscription) {
            console.log('dynamicCreatorWithDropDown: RPISTOLWC subscription already exists');
            return;
        }
        console.log('dynamicCreatorWithDropDown: Creating RPISTOLWC subscription');
        this.RPISTOLWCSubscription = subscribe(this.context, RPISTOLWC, (message) => {
            console.log('dynamicCreatorWithDropDown: Received RPISTOLWC message:', message);
            if ( message?.type === 'inProgressFormData') {
                this.handleFormDataMessage(message);
                console.log('dynamicCreatorWithDropDown Received RPISTOLWC inProgressFormData Message:', message);
            } else {
                console.log('dynamicCreatorWithDropDown: Message type not inProgressFormData:', message?.type);
            }
        });
        console.log('dynamicCreatorWithDropDown: RPISTOLWC subscription created successfully');
    }

    async handleFormDataMessage(message) {
        try {
            console.log('SHS: Paichi');
            console.log('SHS: Received form data message:', message);
            
            if (!message || !message.callFormData) {
                console.warn('No callFormData in message');
                return;
            }

            // Step 1: Parse the top-level 'callFormData' (first JSON parse)
            const dataObj = JSON.parse(message.callFormData);
            console.log('Parsed data object:', dataObj);

            // Step 2: Parse the 'formData' which is still a JSON string (second JSON parse)
            if (!dataObj.formData) {
                console.warn('No formData in parsed data object');
                return;
            }

            const formDataObj = JSON.parse(dataObj.formData);
            console.log('Parsed form data object:', formDataObj);

            // Step 3: Extract the field details
            if (!formDataObj.fieldsDetails) {
                console.warn('No fieldsDetails in form data object');
                return;
            }

            const fieldsDetails = formDataObj.fieldsDetails;
            console.log('Fields to populate:', fieldsDetails);

            // Wait for DOM to be ready then populate the fields
            await Promise.resolve();
            
            this.populateFormFields(fieldsDetails);

        } catch (error) {
            console.error('Error processing form data message:', error);
            this.showToast('Error', 'Failed to process form data: ' + error.message, 'error');
        }
    }

    populateFormFields(fieldsDetails) {
        console.log('SHS: Paichiv2');
        try {
            console.log('Populating form fields with:', fieldsDetails);
            
            // Get all lightning-input-field elements
            const inputFields = this.template.querySelectorAll('lightning-input-field');
            let fieldsPopulated = 0;
            
            inputFields.forEach(field => {
                const fieldName = field.fieldName;
                
                // Check if this field has data in the fieldsDetails
                if (Object.prototype.hasOwnProperty.call(fieldsDetails, fieldName)) {
                    const fieldValue = fieldsDetails[fieldName];
                    
                    // Set the field value
                    field.value = fieldValue;
                    
                    // Add to filled fields tracking
                    if (fieldValue != null && fieldValue !== undefined && fieldValue !== '') {
                        this.filledFields.add(fieldName);
                        fieldsPopulated++;
                    }
                    
                    console.log(`Populated field ${fieldName} with value:`, fieldValue);
                }
            });
            
            // Trigger reactivity for filled fields
            this.filledFields = new Set(this.filledFields);
            
            // Update step progress and section progress
            this.updateStepProgress();
            
            // Update all section progress
            this.sectionSteps.forEach(section => {
                this.updateSectionProgress(section.fieldComponents?.[0]?.apiName);
            });
            
        // Update field styling for populated fields individually (avoid bulk updates after data load)
        Promise.resolve().then(() => {
            this.updateIndividualFieldStyling();
        });
            
            // Save the updated form data to session storage
            this.saveFormData();
            
            console.log(`Successfully populated ${fieldsPopulated} fields`);
            
        } catch (error) {
            console.error('Error populating form fields:', error);
            this.showToast('Error', 'Failed to populate form fields: ' + error.message, 'error');
        }
    }

    renderedCallback() {
        // Field layout is handled statically by the field generation logic
        
        // Don't do bulk styling updates in renderedCallback - causes issues after refresh
        // Individual field styling is handled by specific methods when needed
    }
    
    
    // Update styling for a single field that was changed
    updateSingleFieldStyling(lightningField) {
        try {
            // Find the container for this specific field
            const container = lightningField.closest('.slds-col');
            if (container) {
                const fieldValue = lightningField.value;
                
                // Check if this field actually has a non-empty value
                const hasValue = this.fieldHasValue(fieldValue);
                
                if (hasValue) {
                    container.classList.add('field-with-value');
                } else {
                    container.classList.remove('field-with-value');
                }
            }
        } catch (error) {
            console.warn('Error updating single field styling:', error);
        }
    }
    
    // Update field styling individually based on filledFields set (safe after data load)
    updateIndividualFieldStyling() {
        // Prevent multiple rapid calls
        if (this.isUpdatingStyling) {
            return;
        }
        
        this.isUpdatingStyling = true;
        
        Promise.resolve().then(() => {
            this.doUpdateIndividualFieldStyling();
            this.isUpdatingStyling = false;
        });
    }
    
    doUpdateIndividualFieldStyling() {
        try {
            // Clear processed fields at start of new run
            this.processedFields = new Set();
            
            // Get all lightning-input-field elements and work backwards to containers
            const allLightningFields = this.template.querySelectorAll('lightning-input-field');
            
            allLightningFields.forEach(lightningField => {
                const container = lightningField.closest('.slds-col');
                if (container) {
                    this.processSingleFieldStyling(container, lightningField);
                }
            });
            
            // Clear at the end
            this.processedFields.clear();
        } catch (error) {
            console.warn('Error updating individual field styling:', error);
        }
    }
    
    processSingleFieldStyling(container, lightningField) {
        const fieldName = lightningField.fieldName;
        
        // Check for duplicate processing
        if (this.processedFields.has(fieldName)) {
            return;
        }
        this.processedFields.add(fieldName);
        
        // Use filledFields set which is accurate after data restoration
        const hasValue = this.filledFields.has(fieldName);
        
        if (hasValue) {
            container.classList.add('field-with-value');
            container.setAttribute('data-has-value', 'true');
        } else {
            container.classList.remove('field-with-value');
            container.setAttribute('data-has-value', 'false');
        }
    }
    
    // Update field styling to highlight fields with values (used for bulk updates)
    updateFieldStyling() {
        try {
            // Get all field containers
            const fieldContainers = this.template.querySelectorAll('.slds-col');
            
            fieldContainers.forEach(container => {
                const lightningField = container.querySelector('lightning-input-field');
                if (lightningField) {
                    const fieldValue = lightningField.value;
                    
                    // Always check actual field values, not just the filledFields set
                    // This prevents stale data after page refresh
                    const hasValue = this.fieldHasValue(fieldValue);
                    
                    if (hasValue) {
                        container.classList.add('field-with-value');
                    } else {
                        container.classList.remove('field-with-value');
                    }
                }
            });
        } catch (error) {
            console.warn('Error updating field styling:', error);
        }
    }
    
    // Helper method to determine if a field has a meaningful value
    fieldHasValue(value) {
        // Handle different value types
        if (value === null || value === undefined) {
            return false;
        }
        
        // For boolean fields, both true and false are considered "has value"
        if (typeof value === 'boolean') {
            return true;
        }
        
        // For numbers, including 0
        if (typeof value === 'number') {
            return true;
        }
        
        // For strings, check if not empty (trim to handle whitespace-only strings)
        if (typeof value === 'string') {
            return value.trim() !== '';
        }
        
        // For arrays (multi-select picklists)
        if (Array.isArray(value)) {
            return value.length > 0;
        }
        
        // For objects (dates, lookups, etc.)
        if (typeof value === 'object') {
            return true;
        }
        
        // Default: if it exists and isn't empty string, it has value
        return value !== '';
    }

    disconnectedCallback() {
        // Save form data before unmounting
        this._saveDataTimeout = false;
        this.saveFormData();
        
        // Remove event listeners using the same bound references
        if (this._boundFocusIn) {
            this.template.removeEventListener('focusin', this._boundFocusIn);
        }
        if (this._boundClick) {
            this.template.removeEventListener('click', this._boundClick);
        }

        // No cleanup needed for static images
    }

    // No animation methods needed - using simple image

    // Read URL params for deep-linking (c__formId, c__externalFormId, c__mode, c__recordId for navigation back and auto-population if Contact)
    @wire(CurrentPageReference)
    setCurrentPageReference(pageRef) {
        try {
            const state = pageRef?.state || {};
            const formId = state.c__formId || state.formId || '';
            const recordId = state.c__recordId || state.recordId || '';
            const externalFormId = state.c__externalFormId || '';
            const mode = state.c__mode || 'new';
            // Check if recordId is a Contact ID (starts with '003')
            const recordIdToCheck = state.c__recordId || state.recordId || '';
            const contactId = recordIdToCheck.startsWith('003') ? recordIdToCheck : null;
            
            
            if (formId) {
                // If param-driven and changed, reload
                if (formId !== this.selectedForm || externalFormId !== this.externalFormId || contactId !== this.contactId) {
                    this.formPreselected = true;
                    this.selectedForm = formId;
                    this.sourceRecordId = recordId; // Store source record ID for navigation back
                    this.contactId = contactId; // Store contact ID for auto-population
                    this.externalFormId = externalFormId || 'default';
                    this.isEditMode = (mode === 'edit');
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
        // Note: Don't reset externalFormId, isEditMode, and contactId here as they come from URL params
        this.showSuccessModal = false;
        this.createdRecordId = null;
        // Removed _hasInitialStyleUpdate flag - no longer needed
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
            
            // Create fields array with 3-column grid system
            this.fieldsArray = result.fields.map((fieldName, index) => {
                const totalFields = result.fields.length;
                const remainingFields = totalFields % 3;
                const isInRemainingGroup = index >= totalFields - remainingFields && remainingFields > 0;
                
                let cssClass;
                
                if (totalFields === 1) {
                    // Single field takes full width
                    cssClass = "slds-col slds-size_1-of-1 slds-var-m-bottom_x-small full-width-field";
                } else if (totalFields === 2) {
                    // Two fields split full width (50% each)
                    cssClass = "slds-col slds-size_1-of-1 slds-medium-size_6-of-12 slds-var-m-bottom_x-small remaining-field";
                } else if (isInRemainingGroup) {
                    // Remaining fields (1 or 2) take full width and split evenly
                    if (remainingFields === 1) {
                        cssClass = "slds-col slds-size_1-of-1 slds-var-m-bottom_x-small remaining-field full-width-field";
                    } else {
                        // 2 remaining fields split 50/50
                        cssClass = "slds-col slds-size_1-of-1 slds-medium-size_6-of-12 slds-var-m-bottom_x-small remaining-field";
                    }
                } else {
                    // First 3 fields (or multiples of 3) use 3-column layout
                    cssClass = "slds-col slds-size_1-of-1 slds-medium-size_4-of-12 slds-var-m-bottom_x-small grid-field";
                }
                
                return {
                    apiName: fieldName,
                    isFullWidth: totalFields === 1 || (isInRemainingGroup && remainingFields === 1),
                    cssClass: cssClass,
                    isRemainingField: isInRemainingGroup
                };
            });
            
            // Process instructions for step-by-step guidance
            this.processSections();
            
            // Load saved form data
            this.loadFormData();
            
            // Auto-populate contact and account fields if contact ID is provided
            if (this.contactId) {
                this.autoPopulateContactFields();
            }
            
            
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
            this.sectionSteps = this.objectFieldsData.instructions.map((section, index) => ({
                ...section,
                sectionName: section.text, // Section name from Name field
                fieldComponents: section.fields.map((field, fieldIndex) => {
                    const totalFields = section.fields.length;
                    const remainingFields = totalFields % 3;
                    const isInRemainingGroup = fieldIndex >= totalFields - remainingFields && remainingFields > 0;
                    
                    let cssClass;
                    
                    if (totalFields === 1) {
                        // Single field takes full width
                        cssClass = "slds-col slds-size_1-of-1 slds-var-m-bottom_xx-small full-width-field";
                    } else if (totalFields === 2) {
                        // Two fields split full width (50% each)
                        cssClass = "slds-col slds-size_1-of-1 slds-medium-size_6-of-12 slds-var-m-bottom_xx-small remaining-field";
                    } else if (isInRemainingGroup) {
                        // Remaining fields (1 or 2) take full width and split evenly
                        if (remainingFields === 1) {
                            cssClass = "slds-col slds-size_1-of-1 slds-var-m-bottom_xx-small remaining-field full-width-field";
                        } else {
                            // 2 remaining fields split 50/50
                            cssClass = "slds-col slds-size_1-of-1 slds-medium-size_6-of-12 slds-var-m-bottom_xx-small remaining-field";
                        }
                    } else {
                        // First 3 fields (or multiples of 3) use 3-column layout
                        cssClass = "slds-col slds-size_1-of-1 slds-medium-size_4-of-12 slds-var-m-bottom_xx-small grid-field";
                    }
                    
                    return {
                        apiName: field,
                        isFullWidth: totalFields === 1 || (isInRemainingGroup && remainingFields === 1),
                        cssClass: cssClass,
                        isRemainingField: isInRemainingGroup
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
        
        // Handle different field types properly
        if (typeof value === 'boolean') {
            // For boolean fields, any interaction (true or false) counts as filled
            this.filledFields.add(fieldName);
        } else if (value != null && value !== undefined && value !== '') {
            // For other fields, only non-empty values count as filled
            this.filledFields.add(fieldName);
        } else {
            // Remove from filled fields if empty/null
            this.filledFields.delete(fieldName);
        }
        
        // Trigger reactivity
        this.filledFields = new Set(this.filledFields);
        
        // Update field visual styling ONLY for the field that changed
        this.updateSingleFieldStyling(event.target);
        
        // Update step progress
        this.updateStepProgress();
        
        // Update section completion status
        this.updateSectionProgress(fieldName);
        
        
        // Debounced save to session storage
        if (this._saveDataTimeout) {
            clearTimeout(this._saveDataTimeout);
        }
        this._saveDataTimeout = true;
        
        // Use Promise for debouncing instead of setTimeout
        Promise.resolve().then(() => {
            if (this._saveDataTimeout) {
                this._saveDataTimeout = false;
                this.saveFormData();
            }
        });
    }
    
    handleFieldFocus(event) {
        // Check if the focused element is within a lightning-input-field
        const inputField = event.target.closest('lightning-input-field');
        if (inputField) {
            const fieldName = inputField.fieldName || inputField.dataset.fieldName;
            
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
        
        // Clear session data for this form
        this.clearFormData();
        
        this.showToast('Success', `${this.selectedObject} record created successfully!`, 'success');
        
        // Return to form selection for a clear post-success UX
        this.handleCancel();
    }

    handleError(event) {
        console.error('Create error', event.detail);
        this.showToast('Error', 'Failed to create record: ' + event.detail.message, 'error');
    }



    handleCancel() {
        // Clear the session data for this form when canceling
        this.clearFormData();
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

    // ========== SESSION STORAGE METHODS ==========
    
    generateSessionKey() {
        const recordId = this.sourceRecordId || 'new';
        const externalFormId = this.externalFormId || 'default';
        const contactIdParam = this.contactId || 'none';
        return `${recordId}-${this.selectedForm}-${this.selectedObject}-${externalFormId}-${contactIdParam}`;
    }
    
    extractFieldValues() {
        const fieldValues = {};
        const inputFields = this.template.querySelectorAll('lightning-input-field');
        inputFields.forEach(field => {
            // Save all field values (including boolean false) for complete form state preservation
            if (field.value != null) {
                fieldValues[field.fieldName] = field.value;
            }
        });
        return fieldValues;
    }
    
    saveFormData() {
        try {
            if (!this.selectedForm || !this.selectedObject) return;
            
            const sessionData = {
                recordId: this.sourceRecordId || null,
                formId: this.selectedForm,
                externalFormId: this.externalFormId, // New field for unique form instances
                isEditMode: this.isEditMode, // Mode tracking
                recordTypeId: this.recordTypeId,
                objectApiName: this.selectedObject,
                fieldValues: this.extractFieldValues(),
                filledFields: Array.from(this.filledFields), // Save which fields were actually filled by user
                creationTime: this.getFormCreationTime(),
                timestamp: Date.now(), // Last modified time
                formName: this.selectedFormName,
                totalFields: this.fieldsArray.length,
                progressPercentage: this.progressValue // Save exact progress from main form
            };
            
            const sessionKey = this.generateSessionKey();
            sessionStorage.setItem(sessionKey, JSON.stringify(sessionData));
        } catch (error) {
            console.error('Error saving form data:', error);
        }
    }
    
    loadFormData() {
        try {
            if (!this.selectedForm || !this.selectedObject) return;
            
            const sessionKey = this.generateSessionKey();
            const savedData = sessionStorage.getItem(sessionKey);
            
            if (savedData) {
                const sessionData = JSON.parse(savedData);
                
                // Validate data structure
                if (sessionData.formId === this.selectedForm && 
                    sessionData.objectApiName === this.selectedObject) {
                    
                    // Wait for form to render then populate fields
                    Promise.resolve().then(() => {
                        this.populateFieldsFromStorage(sessionData);
                    });
                }
            }
        } catch (error) {
            console.error('Error loading form data:', error);
        }
    }
    
    populateFieldsFromStorage(sessionData) {
        const inputFields = this.template.querySelectorAll('lightning-input-field');
        const fieldValues = sessionData.fieldValues || {};
        const savedFilledFields = sessionData.filledFields || [];
        
        inputFields.forEach(field => {
            // Check if field exists in saved values (using in operator to handle boolean false)
            if (field.fieldName in fieldValues) {
                const value = fieldValues[field.fieldName];
                field.value = value;
            }
        });
        
        // Restore the exact filled fields that were saved (don't reconstruct from values)
        this.filledFields = new Set(savedFilledFields);
        this.updateStepProgress();
        
        // Update field styling for restored values individually (avoid bulk updates after refresh)
        Promise.resolve().then(() => {
            this.updateIndividualFieldStyling();
        });
    }
    
    clearFormData() {
        try {
            if (!this.selectedForm || !this.selectedObject) return;
            
            const sessionKey = this.generateSessionKey();
            sessionStorage.removeItem(sessionKey);
        } catch (error) {
            console.error('Error clearing form data:', error);
        }
    }

    // ========== AUTO-POPULATION METHODS ==========
    
    async autoPopulateContactFields() {
        try {
            if (!this.contactId || !this.fieldsArray) {
                return;
            }
            
            console.log('Auto-populating contact fields for contact ID:', this.contactId);
            
            // Check if form has Contact or Account fields
            const hasContactField = this.fieldsArray.some(field => 
                field.apiName === 'ContactId' || field.apiName === 'Contact__c'
            );
            const hasAccountField = this.fieldsArray.some(field => 
                field.apiName === 'AccountId' || field.apiName === 'Account__c'
            );
            
            if (!hasContactField && !hasAccountField) {
                console.log('No Contact or Account fields found in form - skipping auto-population');
                return;
            }
            
            // Fetch contact and account data
            const contactData = await getContactAndAccountData({ contactId: this.contactId });
            console.log('Retrieved contact data:', contactData);
            
            // Wait for form to render
            await Promise.resolve();
            
            // Auto-populate fields
            const fieldsToPopulate = {};
            
            if (hasContactField && contactData.contactId) {
                // Try common Contact field names
                if (this.fieldsArray.some(field => field.apiName === 'ContactId')) {
                    fieldsToPopulate.ContactId = contactData.contactId;
                }
                if (this.fieldsArray.some(field => field.apiName === 'Contact__c')) {
                    fieldsToPopulate.Contact__c = contactData.contactId;
                }
            }
            
            if (hasAccountField && contactData.accountId) {
                // Try common Account field names
                if (this.fieldsArray.some(field => field.apiName === 'AccountId')) {
                    fieldsToPopulate.AccountId = contactData.accountId;
                }
                if (this.fieldsArray.some(field => field.apiName === 'Account__c')) {
                    fieldsToPopulate.Account__c = contactData.accountId;
                }
            }
            
            // Populate the fields
            if (Object.keys(fieldsToPopulate).length > 0) {
                this.populateFormFields(fieldsToPopulate);
                // Update styling for auto-populated fields individually (avoid bulk updates)
                Promise.resolve().then(() => {
                    this.updateIndividualFieldStyling();
                });
                console.log('Auto-populated fields:', fieldsToPopulate);
            }
            
        } catch (error) {
            console.error('Error auto-populating contact fields:', error);
        }
    }

    // ========== UTILITY METHODS ==========

    getFormCreationTime() {
        if (this.isEditMode) {
            // If editing, preserve existing creation time
            try {
                const existingData = sessionStorage.getItem(this.generateSessionKey());
                if (existingData) {
                    const parsedData = JSON.parse(existingData);
                    return parsedData.creationTime || Date.now();
                }
            } catch (error) {
                console.warn('Error getting existing creation time:', error);
            }
        }
        // If new form, use current time
        return Date.now();
    }

    showToast(title, message, variant) {
        const evt = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant,
            mode: variant === 'dismissable'
        });
        this.dispatchEvent(evt);
    }

    getErrorMessage(error) {
        if (error?.body?.message) return error.body.message;
        if (error?.message) return error.message;
        if (typeof error === 'string') return error;
        return 'An unknown error occurred';
    }

    // Getter for combined Object Name / Form Name display
    get selectedFormDisplayName() {
        if (this.selectedObject && this.selectedFormName) {
            return `${this.selectedObject} / ${this.selectedFormName}`;
        }
        return this.selectedFormName || '';
    }

}