import { LightningElement, track, wire } from 'lwc';
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';
import Listening from "@salesforce/resourceUrl/Listening";
import RPISTOLWC from "@salesforce/messageChannel/FORMMC__c";
import { subscribe, MessageContext } from 'lightning/messageService';
import noHeader from '@salesforce/resourceUrl/NoHeader';
import {loadStyle} from "lightning/platformResourceLoader";

import getObjectFieldsData from '@salesforce/apex/DynamicObjectService.getObjectFieldsData';
import getContactAndAccountData from '@salesforce/apex/DynamicObjectService.getContactAndAccountData';

import saveDraftForm from '@salesforce/apex/DraftFormService.saveDraftForm';
import getDraftById from '@salesforce/apex/DraftFormService.getDraftById';
import deleteDraftForm from '@salesforce/apex/DraftFormService.deleteDraftForm';
import updateDraftStatus from '@salesforce/apex/DraftFormService.updateDraftStatus';

export default class DynamicCreatorWithDropdown extends NavigationMixin(LightningElement) {
    @wire(MessageContext)
    context;

    @track formPreselected = false;
    @track selectedForm;
    @track selectedFormName;
    @track selectedObject;
    @track recordTypeId;
    @track recordTypeName;
    @track sourceRecordId;
    @track contactId;

    listeningImageUrl = Listening;
    
    @track externalFormId;
    @track isEditMode = false;
    
    @track fieldsArray = [];
    @track objectFieldsData = null;
    @track sectionSteps = [];
    @track filledFields = new Set();
    @track completedSteps = new Set();
    @track isLoadingFields = false;
    @track isCreating = false;
    
    @track showSuccessModal = false;
    @track createdRecordId;
    
    @track showCancelModal = false;
    @track showDeleteModal = false;
    @track draftRecordId;
    @track isEditingDraft = false;
    @track draftExternalFormId;
    @track isUpdateMode = false;
    @track recordIdToUpdate;
    @track modalContext = 'cancel';
    
    _saveDataTimeout;
    RPISTOLWCSubscription = null;

    connectedCallback() {
        loadStyle(this, noHeader);

        // Bind event handlers once to enable proper cleanup on disconnect
        if (!this._boundFocusIn) {
            this._boundFocusIn = this.handleFieldFocus.bind(this);
        }
        if (!this._boundClick) {
            this._boundClick = this.handleTemplateClick.bind(this);
        }

        this.template.addEventListener('focusin', this._boundFocusIn);
        this.template.addEventListener('click', this._boundClick);

        this.subscribeRPISTOLWCMC();
    }

    subscribeRPISTOLWCMC() {
        if (this.RPISTOLWCSubscription) {
            return;
        }
        // Subscribe to receive real-time form data from external voice/chat integrations
        this.RPISTOLWCSubscription = subscribe(this.context, RPISTOLWC, (message) => {
            if ( message?.type === 'inProgressFormData') {
                this.handleFormDataMessage(message);
            }
        });
    }

    async handleFormDataMessage(message) {
        try {
            if (!message || !message.callFormData) {
                return;
            }

            const dataObj = message.callFormData;

            if (!dataObj.formData) {
                return;
            }

            const formDataObj = JSON.parse(dataObj.formData);

            // Ensure message is targeting this specific form instance
            if (dataObj.activeFormId) {
                if (dataObj.activeFormId !== this.externalFormId) {
                    return;
                }
            }

            if (!formDataObj.fieldsDetails) {
                return;
            }

            const fieldsDetails = formDataObj.fieldsDetails;
            await Promise.resolve();
            this.populateFormFields(fieldsDetails);

        } catch (error) {
            console.error('Error processing form data message:', error);
        }
    }

    populateFormFields(fieldsDetails) {
        try {
            const inputFields = this.template.querySelectorAll('lightning-input-field');
            
            inputFields.forEach(field => {
                const fieldName = field.fieldName;
                
                if (Object.prototype.hasOwnProperty.call(fieldsDetails, fieldName)) {
                    let fieldValue = fieldsDetails[fieldName];
                    fieldValue = this.processFieldValue(fieldValue, field);
                    field.value = fieldValue;
                    
                    if (fieldValue != null && fieldValue !== undefined && fieldValue !== '') {
                        this.filledFields.add(fieldName);
                    }
                }
            });
            
            this.filledFields = new Set(this.filledFields);
            this.updateStepProgress();
            
            this.sectionSteps.forEach(section => {
                this.updateSectionProgress(section.fieldComponents?.[0]?.apiName);
            });
            
            Promise.resolve().then(() => {
            this.updateIndividualFieldStyling();
        });
            
            this.saveFormData();
            
        } catch (error) {
            console.error('Error populating form fields:', error);
        }
    }
    
    // Process and convert field values from external sources to proper Salesforce data types
    processFieldValue(value, field) {
        if (value == null || value === undefined) {
            return value;
        }
        
        let processedValue = value;
        
        if (typeof processedValue !== 'string') {
            processedValue = String(processedValue);
        }
        
        // Handle escaped Unicode quotes from JSON
        processedValue = processedValue.replace(/\\u0022/g, '"');
        
        if (processedValue.startsWith('"') && processedValue.endsWith('"')) {
            processedValue = processedValue.slice(1, -1);
        }
        
        const fieldType = field.type || this.getFieldTypeFromElement(field);
        const fieldName = field.fieldName;
        
        // Lookup fields require string IDs
        if (fieldType === 'lookup' || fieldName.endsWith('Id') || fieldName.endsWith('__c')) {
            return processedValue.trim();
        }
        
        // Convert numeric values to proper types
        if (fieldType === 'number' || fieldType === 'currency' || fieldType === 'percent') {
            const numberValue = parseFloat(processedValue);
            return isNaN(numberValue) ? processedValue : numberValue;
        } else if (fieldType === 'integer') {
            const intValue = parseInt(processedValue, 10);
            return isNaN(intValue) ? processedValue : intValue;
        } else if (fieldType === 'checkbox' || fieldType === 'boolean') {
            return processedValue === 'true' || processedValue === true;
        }
        
        return processedValue;
    }
    
    // Infer field type from field name patterns when type metadata is unavailable
    getFieldTypeFromElement(field) {
        if (field.type) {
            return field.type;
        }
        
        const fieldName = field.fieldName;
        
        if (!fieldName) {
            return 'text';
        }
        
        const lowerFieldName = fieldName.toLowerCase();
        
        // Detect lookup/reference fields
        if (fieldName.endsWith('Id') && !fieldName.includes('External')) {
            return 'lookup';
        }
        if (fieldName.endsWith('__c') && (lowerFieldName.includes('account') || lowerFieldName.includes('contact') || lowerFieldName.includes('user'))) {
            return 'lookup';
        }
        
        // Detect numeric field types by name patterns
        if (lowerFieldName.includes('amount')) {
            return 'currency';
        }
        if (lowerFieldName.includes('percent')) {
            return 'percent';
        }
        if (lowerFieldName.includes('number') || lowerFieldName.includes('count')) {
            return 'number';
        }
        
        return 'text';
    }
    
    updateSingleFieldStyling(lightningField) {
        try {
            const container = lightningField.closest('.slds-col');
            if (container) {
                const fieldValue = lightningField.value;
                const hasValue = this.fieldHasValue(fieldValue);
                
                if (hasValue) {
                    container.classList.add('field-with-value');
                } else {
                    container.classList.remove('field-with-value');
                }
            }
        } catch (error) {
            console.error('Error updating single field styling:', error);
        }
    }
    
    updateIndividualFieldStyling() {
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
            this.processedFields = new Set();
            const allLightningFields = this.template.querySelectorAll('lightning-input-field');
            
            allLightningFields.forEach(lightningField => {
                const container = lightningField.closest('.slds-col');
                if (container) {
                    this.processSingleFieldStyling(container, lightningField);
                }
            });
            
            this.processedFields.clear();
        } catch (error) {
            console.error('Error updating individual field styling:', error);
        }
    }
    
    processSingleFieldStyling(container, lightningField) {
        const fieldName = lightningField.fieldName;
        
        if (this.processedFields.has(fieldName)) {
            return;
        }
        this.processedFields.add(fieldName);
        
        const hasValue = this.filledFields.has(fieldName);
        
        if (hasValue) {
            container.classList.add('field-with-value');
            container.setAttribute('data-has-value', 'true');
        } else {
            container.classList.remove('field-with-value');
            container.setAttribute('data-has-value', 'false');
        }
    }
    
    updateFieldStyling() {
        try {
            const fieldContainers = this.template.querySelectorAll('.slds-col');
            
            fieldContainers.forEach(container => {
                const lightningField = container.querySelector('lightning-input-field');
                if (lightningField) {
                    const fieldValue = lightningField.value;
                    const hasValue = this.fieldHasValue(fieldValue);
                    
                    if (hasValue) {
                        container.classList.add('field-with-value');
                    } else {
                        container.classList.remove('field-with-value');
                    }
                }
            });
        } catch (error) {
            console.error('Error updating field styling:', error);
        }
    }
    
    // Check if field has a meaningful value (handles all data types including boolean false)
    fieldHasValue(value) {
        if (value === null || value === undefined) {
            return false;
        }
        
        if (typeof value === 'boolean') {
            return true; // Both true and false are valid values
        }
        
        if (typeof value === 'number') {
            return true; // Including 0
        }
        
        if (typeof value === 'string') {
            return value.trim() !== '';
        }
        
        if (Array.isArray(value)) {
            return value.length > 0;
        }
        
        if (typeof value === 'object') {
            return true;
        }
        
        return value !== '';
    }

    disconnectedCallback() {
        this._saveDataTimeout = false;
        this.saveFormData();
        
        if (this._boundFocusIn) {
            this.template.removeEventListener('focusin', this._boundFocusIn);
        }
        if (this._boundClick) {
            this.template.removeEventListener('click', this._boundClick);
        }
    }

    // Parse URL parameters to determine form mode (new/edit/update/draft) and auto-populate data
    @wire(CurrentPageReference)
    setCurrentPageReference(pageRef) {
        try {
            const state = pageRef?.state || {};
            const formId = state.c__formId || state.formId || '';
            const recordId = state.c__recordId || state.recordId || '';
            const externalFormId = state.c__externalFormId || '';
            const mode = state.c__mode || 'new';
            const draftRecordId = state.c__draftRecordId || '';
            const createdRecordId = state.c__createdRecordId || '';
            const recordIdToCheck = state.c__recordId || state.recordId || '';
            const contactId = recordIdToCheck.startsWith('003') ? recordIdToCheck : null; // Contact IDs start with 003
            
            
            // Priority 1: Load existing draft for editing
            if (draftRecordId) {
                this.draftRecordId = draftRecordId;
                this.isEditingDraft = true;
                this.isUpdateMode = (mode === 'update' && createdRecordId); // Update mode modifies existing records
                this.recordIdToUpdate = createdRecordId || null;
                this.formPreselected = true;
                this.resetFormState();
                this.loadFormFromDraft();
            } else if (formId) {
                // Priority 2: Load form configuration and auto-populate if Contact ID provided
                if (formId !== this.selectedForm || externalFormId !== this.externalFormId || contactId !== this.contactId) {
                    this.formPreselected = true;
                    this.selectedForm = formId;
                    this.sourceRecordId = recordId;
                    this.contactId = contactId;
                    this.externalFormId = externalFormId || 'default';
                    this.isEditMode = (mode === 'edit');
                    this.isEditingDraft = false;
                    this.isUpdateMode = false;
                    this.draftRecordId = null;
                    this.recordIdToUpdate = null;
                    this.resetFormState();
                    this.loadObjectFieldsData();
                }
            } else {
                // Priority 3: Allow manual form selection
                this.formPreselected = false;
                this.isEditingDraft = false;
                this.isUpdateMode = false;
                this.draftRecordId = null;
                this.recordIdToUpdate = null;
            }
        } catch (e) {
            console.error('Error reading URL params', e);
        }
    }

    @wire(getObjectInfo, { objectApiName: '$selectedObject' })
    wiredInfo({ data, error }) {
        if (data && !this.recordTypeId) {
            this.recordTypeId = data.defaultRecordTypeId;
        } else if (error) {
            console.error('Error loading object metadata', error);
        }
    }

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
        this.showCancelModal = false;
        this.showDeleteModal = false;
    }

    async loadObjectFieldsData() {
        this.isLoadingFields = true;
        
        try {
            const result = await getObjectFieldsData({ analysisId: this.selectedForm });
            this.objectFieldsData = result;
            this.selectedObject = result.objectName;
            this.selectedFormName = result.formName;
            this.recordTypeId = result.recordTypeId;
            this.recordTypeName = result.recordTypeName || '';
            
            // Build responsive 3-column grid with proper handling of remaining fields
            this.fieldsArray = result.fields.map((fieldName, index) => {
                const totalFields = result.fields.length;
                const remainingFields = totalFields % 3;
                const isInRemainingGroup = index >= totalFields - remainingFields && remainingFields > 0;
                
                let cssClass;
                
                if (totalFields === 1) {
                    cssClass = "slds-col slds-size_1-of-1 slds-var-m-bottom_x-small full-width-field";
                } else if (totalFields === 2) {
                    cssClass = "slds-col slds-size_1-of-1 slds-medium-size_6-of-12 slds-var-m-bottom_x-small remaining-field";
                } else if (isInRemainingGroup) {
                    if (remainingFields === 1) {
                        cssClass = "slds-col slds-size_1-of-1 slds-var-m-bottom_x-small remaining-field full-width-field";
                    } else {
                        cssClass = "slds-col slds-size_1-of-1 slds-medium-size_6-of-12 slds-var-m-bottom_x-small remaining-field";
                    }
                } else {
                    cssClass = "slds-col slds-size_1-of-1 slds-medium-size_4-of-12 slds-var-m-bottom_x-small grid-field";
                }
                
                return {
                    apiName: fieldName,
                    isFullWidth: totalFields === 1 || (isInRemainingGroup && remainingFields === 1),
                    cssClass: cssClass,
                    isRemainingField: isInRemainingGroup
                };
            });
            
            this.processSections();
            this.loadFormData();
            
            if (this.contactId) {
                this.autoPopulateContactFields();
            }
            
        } catch (error) {
            console.error('Error loading field data:', error);
            this.fieldsArray = [];
        } finally {
            this.isLoadingFields = false;
        }
    }

    processSections() {
        if (!this.objectFieldsData) {
            this.sectionSteps = [];
            return;
        }

        // Build section-based form with progress tracking
        if (this.objectFieldsData.instructions && this.objectFieldsData.instructions.length > 0) {
            this.sectionSteps = this.objectFieldsData.instructions.map((section, index) => ({
                ...section,
                sectionName: section.text,
                fieldComponents: section.fields.map((field, fieldIndex) => {
                    const totalFields = section.fields.length;
                    const remainingFields = totalFields % 3;
                    const isInRemainingGroup = fieldIndex >= totalFields - remainingFields && remainingFields > 0;
                    
                    let cssClass;
                    
                    if (totalFields === 1) {
                        cssClass = "slds-col slds-size_1-of-1 slds-var-m-bottom_xx-small full-width-field";
                    } else if (totalFields === 2) {
                        cssClass = "slds-col slds-size_1-of-1 slds-medium-size_6-of-12 slds-var-m-bottom_xx-small remaining-field";
                    } else if (isInRemainingGroup) {
                        if (remainingFields === 1) {
                            cssClass = "slds-col slds-size_1-of-1 slds-var-m-bottom_xx-small remaining-field full-width-field";
                        } else {
                            cssClass = "slds-col slds-size_1-of-1 slds-medium-size_6-of-12 slds-var-m-bottom_xx-small remaining-field";
                        }
                    } else {
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
                sectionId: `section-${section.id || index}`,
                hasFields: section.fields && section.fields.length > 0
            }));
            
            this.updateStepProgress();
        } else {
            this.sectionSteps = [];
        }
    }
    
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
    
    get sectionsWithProgress() {
        return this.sectionSteps.map(section => ({
            ...section,
            progress: this.getSectionProgress(section),
            isComplete: this.getSectionProgress(section).percentage === 100
        }));
    }




    handleFieldChange(event) {
        const fieldName = event.target.fieldName;
        const value = event.target.value;
        
        // Track filled fields (boolean false counts as filled)
        if (typeof value === 'boolean') {
            this.filledFields.add(fieldName);
        } else if (value != null && value !== undefined && value !== '') {
            this.filledFields.add(fieldName);
        } else {
            this.filledFields.delete(fieldName);
        }
        
        this.filledFields = new Set(this.filledFields);
        this.updateSingleFieldStyling(event.target);
        this.updateStepProgress();
        this.updateSectionProgress(fieldName);
        
        // Debounce save to session storage to avoid excessive writes
        if (this._saveDataTimeout) {
            clearTimeout(this._saveDataTimeout);
        }
        this._saveDataTimeout = true;
        
        Promise.resolve().then(() => {
            if (this._saveDataTimeout) {
                this._saveDataTimeout = false;
                this.saveFormData();
            }
        });
    }
    
    handleFieldFocus(event) {
        const inputField = event.target.closest('lightning-input-field');
        if (inputField) {
            const fieldName = inputField.fieldName || inputField.dataset.fieldName;
            
            if (fieldName) {
                this.setActiveSectionByField(fieldName);
            }
        }
    }
    
    handleTemplateClick(event) {
        const sectionItem = event.target.closest('.slds-progress__item');
        if (sectionItem) {
            return;
        }
        
        const inputField = event.target.closest('lightning-input-field');
        if (inputField) {
            return;
        }
        
        this.clearAllActiveHighlights();
    }
    
    clearAllActiveHighlights() {
        try {
            const allNavSections = this.template.querySelectorAll('.slds-progress__item');
            allNavSections.forEach(section => {
                section.classList.remove('progress-step-active');
            });
            
            this.sectionSteps = this.sectionSteps.map(section => ({
                ...section,
                isActive: false
            }));
            
        } catch (error) {
            console.error('Error clearing active highlights:', error);
        }
    }
    
    setActiveSectionByField(fieldName) {
        const sectionWithField = this.sectionSteps.find(section => 
            section.fieldComponents && section.fieldComponents.some(field => field.apiName === fieldName)
        );
        
        if (sectionWithField) {
            this.setActiveSection(sectionWithField.sectionId);
            this.highlightNavigationSection(sectionWithField.sectionId);
        }
    }
    
    highlightNavigationSection(sectionId) {
        try {
            const allNavSections = this.template.querySelectorAll('.slds-progress__item');
            allNavSections.forEach(section => {
                section.classList.remove('progress-step-active');
            });
            
            const targetNavSection = this.template.querySelector(`[data-section-id="${sectionId}"]`);
            if (targetNavSection) {
                
                targetNavSection.classList.add('progress-step-active');
            }
        } catch (error) {
            console.error('Error highlighting navigation section:', error);
        }
    }
    
    updateSectionProgress(changedFieldName) {
        this.sectionSteps = this.sectionSteps.map(section => {
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
    
    handleSectionClick(event) {
        const sectionId = event.currentTarget.dataset.sectionId;        
        this.focusOnSection(sectionId);
        this.setActiveSection(sectionId);
        this.highlightNavigationSection(sectionId);
    }
    
    handleSectionKeyDown(event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            const sectionId = event.currentTarget.dataset.sectionId;
            
            this.focusOnSection(sectionId);
            this.setActiveSection(sectionId);
            this.highlightNavigationSection(sectionId);
        }
    }
    
    focusOnSection(sectionId) {
        try {
            const targetSection = this.template.querySelector(`[data-section-id="${sectionId}"].section-container`);
            
            if (targetSection) {
                targetSection.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'start',
                    inline: 'nearest'
                });
                
                targetSection.classList.add('section-focused');
                const onAnimationEnd = () => {
                    targetSection.classList.remove('section-focused');
                    targetSection.removeEventListener('animationend', onAnimationEnd);
                };
                targetSection.addEventListener('animationend', onAnimationEnd);
            }
        } catch (error) {
            console.error('Error focusing on section:', error);
        }
    }
    
    setActiveSection(sectionId) {
        try {
            this.sectionSteps = this.sectionSteps.map(section => ({
                ...section,
                isActive: section.sectionId === sectionId
            }));
            
        } catch (error) {
            console.error('Error setting active section:', error);
        }
    }

    // Section is complete only when ALL fields are filled
    checkStepCompletion(instruction) {
        const stepFields = instruction.fields || [];
        return stepFields.length > 0 && stepFields.every(field => this.filledFields.has(field));
    }

    updateStepProgress() {
        if (!this.sectionSteps || this.sectionSteps.length === 0) {
            return;
        }
        
        this.updateCompletedSteps();
        
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

    updateCompletedSteps() {
        this.completedSteps.clear();
        if (this.sectionSteps && this.sectionSteps.length > 0) {
            this.sectionSteps.forEach(instruction => {
                if (this.checkStepCompletion(instruction)) {
                    this.completedSteps.add(instruction.id);
                }
            });
        }
        this.completedSteps = new Set(this.completedSteps);
    }

    async handleSuccess(event) {
        const recordId = event.detail.id;
        
        this.clearFormData();
        
        if (this.isUpdateMode) {
            await this.updateDraftWithCurrentFormData();
            this.showToast('Success', `${this.selectedObject} record updated successfully!`, 'success');
        } else {
            if (this.isEditingDraft && this.draftRecordId) {
                await this.updateDraftStatusToCreated(recordId);
            } else {
                await this.createDraftForReference(recordId);
            }
            
            this.showToast('Success', `${this.selectedObject} record created successfully!`, 'success');
        }
        
        this.handleCancelConfirmed();
    }

    async updateDraftStatusToCreated(createdRecordId) {
        try {
            if (this.draftRecordId) {
                await updateDraftStatus({ 
                    draftId: this.draftRecordId, 
                    createdRecordId: createdRecordId 
                });
            }
        } catch (error) {
            console.error('Error updating draft status:', error);
        }
    }

    // Create draft record to link completed form with created Salesforce record
    async createDraftForReference(createdRecordId) {
        try {
            const formData = {
                externalFormId: this.generateUniqueFormId(), // Generate unique ID for this reference draft
                formId: this.selectedForm,
                sourceRecordId: this.sourceRecordId,
                formName: this.selectedFormName,
                objectName: this.selectedObject,
                fieldValues: this.extractFieldValues(),
                filledFields: Array.from(this.filledFields),
                progress: this.progressValue, // Use actual calculated progress percentage
                totalFields: this.fieldsArray.length,
                recordTypeId: this.recordTypeId,
                isEditMode: this.isEditMode,
                contactId: this.contactId,
                timestamp: Date.now(),
                status: 'Created',
                createdRecordId: createdRecordId
            };

            const draftId = await saveDraftForm({ formDataJson: JSON.stringify(formData) });
            
            await updateDraftStatus({ 
                draftId: draftId, 
                createdRecordId: createdRecordId 
            });

        } catch (error) {
            console.error('Error creating reference draft:', error);
        }
    }

    async updateDraftWithCurrentFormData() {
        try {
            if (this.isEditingDraft && this.draftRecordId) {
                const formData = {
                    externalFormId: this.draftExternalFormId,
                    formId: this.selectedForm,
                    sourceRecordId: this.sourceRecordId,
                    formName: this.selectedFormName,
                    objectName: this.selectedObject,
                    fieldValues: this.extractFieldValues(),
                    filledFields: Array.from(this.filledFields),
                    progress: this.progressValue,
                    totalFields: this.fieldsArray.length,
                    recordTypeId: this.recordTypeId,
                    isEditMode: this.isEditMode,
                    contactId: this.contactId,
                    timestamp: Date.now()
                };

                await saveDraftForm({ formDataJson: JSON.stringify(formData) });
            }
        } catch (error) {
            console.error('Error updating draft with current form data:', error);
        }
    }

    handleError(event) {
        console.error('Create error', event.detail);
    }



    handleCancel() {
        this.modalContext = 'cancel';
        this.showCancelModal = true;
    }

    handleCancelConfirmed() {
        this.showCancelModal = false;
        this.clearFormData();
        this.navigateBack();
    }

    handleCancelDismissed() {
        this.showCancelModal = false;
    }

    async handleDraftForm() {
        try {
            if (!this.selectedForm || !this.selectedObject) {
                this.showToast('Error', 'Please select a form first', 'error');
                return;
            }

            const formData = {
                externalFormId: this.draftExternalFormId || this.generateDraftExternalFormId(),
                formId: this.selectedForm,
                sourceRecordId: this.sourceRecordId,
                formName: this.selectedFormName,
                objectName: this.selectedObject,
                fieldValues: this.extractFieldValues(),
                filledFields: Array.from(this.filledFields),
                progress: this.progressValue,
                totalFields: this.fieldsArray.length,
                recordTypeId: this.recordTypeId,
                isEditMode: this.isEditMode,
                contactId: this.contactId,
                timestamp: Date.now()
            };

            const draftId = await saveDraftForm({ formDataJson: JSON.stringify(formData) });
            
            const isNewDraft = !this.isEditingDraft;
            const message = isNewDraft ? 'Draft saved successfully!' : 'Draft updated successfully!';
            
            if (isNewDraft) {
                this.draftRecordId = draftId;
                this.isEditingDraft = true;
            }

            this.showToast('Success', message, 'success');

        } catch (error) {
            console.error('Error saving draft:', error);
            this.showToast('Error', 'Failed to save draft: ' + this.getErrorMessage(error), 'error');
        }
    }

    async loadFormFromDraft() {
        try {
            if (!this.draftRecordId) {
                console.error('No draft record ID provided');
                return;
            }

            const draftRecord = await getDraftById({ draftId: this.draftRecordId });
            if (!draftRecord || !draftRecord.Form_Data_JSON__c) {
                throw new Error('Draft data not found');
            }

            const formData = JSON.parse(draftRecord.Form_Data_JSON__c);
            
            this.selectedForm = draftRecord.Form_ID__c;
            this.sourceRecordId = draftRecord.Source_Record_ID__c;
            this.externalFormId = formData.externalFormId || 'default';
            this.draftExternalFormId = formData.externalFormId;
            this.contactId = formData.contactId;
            this.isEditMode = formData.isEditMode || false;

            await this.loadObjectFieldsData();
            
            if (formData.fieldValues) {
                this.filledFields = new Set(formData.filledFields || []);
                await Promise.resolve();
                this.populateFieldsFromDraftData(formData);
            }

        } catch (error) {
            console.error('Error loading draft:', error);
            this.showToast('Error', 'Failed to load draft: ' + this.getErrorMessage(error), 'error');
            this.navigateBack();
        }
    }

    populateFieldsFromDraftData(formData) {
        try {
            const inputFields = this.template.querySelectorAll('lightning-input-field');
            const fieldValues = formData.fieldValues || {};
            
            inputFields.forEach(field => {
                if (field.fieldName in fieldValues) {
                    const value = fieldValues[field.fieldName];
                    field.value = value;
                }
            });
            
            this.updateStepProgress();
            
            Promise.resolve().then(() => {
                this.updateIndividualFieldStyling();
            });
            
        } catch (error) {
            console.error('Error populating fields from draft:', error);
        }
    }

    generateUniqueFormId() {
        return 'form_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    generateDraftExternalFormId() {
        if (!this.draftExternalFormId) {
            this.draftExternalFormId = `draft_${this.selectedForm}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        return this.draftExternalFormId;
    }

    handleDeleteDraft() {
        if (!this.isEditingDraft || !this.draftRecordId) {
            this.showToast('Error', 'No draft to delete', 'error');
            return;
        }

        this.showDeleteModal = true;
    }

    async handleDeleteConfirmed() {
        try {
            this.showDeleteModal = false;

            await deleteDraftForm({ draftId: this.draftRecordId });
            
            this.isEditingDraft = false;
            this.draftRecordId = null;
            this.draftExternalFormId = null;
            
            this.clearFormData();
            this.showToast('Success', 'Draft deleted successfully', 'success');
            this.navigateBack();
        } catch (error) {
            console.error('Error deleting draft:', error);
            this.showToast('Error', 'Failed to delete draft: ' + this.getErrorMessage(error), 'error');
        }
    }

    handleDeleteDismissed() {
        this.showDeleteModal = false;
    }

    handleGoBack() {
        this.modalContext = 'back';
        this.showCancelModal = true;
    }

    navigateBack() {
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

        if (this.formPreselected) {
            const navigationState = {};
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
        
        this.selectedForm = '';
        this.resetFormState();
    }

    get cardTitle() {
        return 'Dynamic Record Creator';
    }

    get hasSections() {
        return this.sectionSteps && this.sectionSteps.length > 0;
    }

    get createButtonLabel() {
        if (this.isUpdateMode) {
            return this.selectedObject ? `Update ${this.selectedObject}` : 'Update Record';
        }
        return this.selectedObject ? `Create ${this.selectedObject}` : 'Create Record';
    }

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
    
    // Restore form data from session storage after page refresh
    loadFormData() {
        try {
            if (!this.selectedForm || !this.selectedObject) return;
            
            const sessionKey = this.generateSessionKey();
            const savedData = sessionStorage.getItem(sessionKey);
            
            if (savedData) {
                const sessionData = JSON.parse(savedData);
                
                // Validate saved data matches current form configuration
                if (sessionData.formId === this.selectedForm && 
                    sessionData.objectApiName === this.selectedObject) {
                    
                    Promise.resolve().then(() => {
                        this.populateFieldsFromStorage(sessionData);
                    });
                }
            }
        } catch (error) {
            console.error('Error loading form data:', error);
        }
    }
    
    // Populate form fields from restored session data (handles all data types including boolean false)
    populateFieldsFromStorage(sessionData) {
        const inputFields = this.template.querySelectorAll('lightning-input-field');
        const fieldValues = sessionData.fieldValues || {};
        const savedFilledFields = sessionData.filledFields || [];
        
        inputFields.forEach(field => {
            if (field.fieldName in fieldValues) {
                const value = fieldValues[field.fieldName];
                field.value = value;
            }
        });
        
        this.filledFields = new Set(savedFilledFields);
        this.updateStepProgress();
        
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

    async autoPopulateContactFields() {
        try {
            if (!this.contactId || !this.fieldsArray) {
                return;
            }
            
            const hasContactField = this.fieldsArray.some(field => 
                field.apiName === 'ContactId' || field.apiName === 'Contact__c'
            );
            const hasAccountField = this.fieldsArray.some(field => 
                field.apiName === 'AccountId' || field.apiName === 'Account__c'
            );
            
            if (!hasContactField && !hasAccountField) {
                return;
            }
            
            const contactData = await getContactAndAccountData({ contactId: this.contactId });
            await Promise.resolve();
            
            const fieldsToPopulate = {};
            
            if (hasContactField && contactData.contactId) {
                if (this.fieldsArray.some(field => field.apiName === 'ContactId')) {
                    fieldsToPopulate.ContactId = contactData.contactId;
                }
                if (this.fieldsArray.some(field => field.apiName === 'Contact__c')) {
                    fieldsToPopulate.Contact__c = contactData.contactId;
                }
            }
            
            if (hasAccountField && contactData.accountId) {
                if (this.fieldsArray.some(field => field.apiName === 'AccountId')) {
                    fieldsToPopulate.AccountId = contactData.accountId;
                }
                if (this.fieldsArray.some(field => field.apiName === 'Account__c')) {
                    fieldsToPopulate.Account__c = contactData.accountId;
                }
            }
            
            if (Object.keys(fieldsToPopulate).length > 0) {
                this.populateFormFields(fieldsToPopulate);
                Promise.resolve().then(() => {
                    this.updateIndividualFieldStyling();
                });
            }
            
        } catch (error) {
            console.error('Error auto-populating contact fields:', error);
        }
    }

    // Preserve original form creation time for draft continuity
    getFormCreationTime() {
        if (this.isEditMode) {
            try {
                const existingData = sessionStorage.getItem(this.generateSessionKey());
                if (existingData) {
                    const parsedData = JSON.parse(existingData);
                    return parsedData.creationTime || Date.now();
                }
            } catch (error) {
                console.error('Error getting existing creation time:', error);
            }
        }
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

    get selectedFormDisplayName() {
        if (this.selectedObject && this.selectedFormName) {
            return `${this.selectedObject} / ${this.selectedFormName}`;
        }
        return this.selectedFormName || '';
    }

    get effectiveRecordTypeId() {
        if (this.recordTypeName === 'Master' || this.recordTypeName === 'master') {
            return null;
        }
        return this.recordTypeId;
    }

    get showDeleteButton() {
        return this.isEditingDraft && !this.isUpdateMode;
    }

    get showDraftButton() {
        return this.selectedForm && !this.isUpdateMode;
    }

    get modalTitle() {
        return this.modalContext === 'back' ? 'Confirm Back' : 'Confirm Cancel';
    }

    get modalMessage() {
        const action = this.modalContext === 'back' ? 'go back' : 'cancel';
        return `Are you sure you want to ${action}? Any unsaved changes will be lost.`;
    }

    get modalKeepButtonLabel() {
        return this.modalContext === 'back' ? 'No, Stay Here' : 'No, Keep Editing';
    }

    get modalConfirmButtonLabel() {
        return this.modalContext === 'back' ? 'Yes, Go Back' : 'Yes, Cancel';
    }

}