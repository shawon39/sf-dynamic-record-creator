import { LightningElement, track, wire, api } from 'lwc';
import getAllSalesforceObjects from '@salesforce/apex/ObjectService.getAllSalesforceObjects';
import getObjectRecordTypes from '@salesforce/apex/ObjectService.getObjectRecordTypes';

export default class ObjectSelector extends LightningElement {
    @api initialSelectedObject;
    @api initialSelectedRecordType;
    @api initialSelectedRecordTypeName;
    @api initialFormName;
    
    @track objectOptions = [];
    @track selectedObject = '';
    @track recordTypeOptions = [];
    @track selectedRecordType = '';
    @track selectedRecordTypeName = '';
    @track selectedRecordTypeDescription = '';
    @track showRecordTypeSelector = false;
    @track formName = '';
    
    @track isLoadingObjects = false;
    @track isLoadingRecordTypes = false;
    @track isInitialized = false;
    
    // Load all Salesforce objects for selection
    @wire(getAllSalesforceObjects)
    wiredObjects({ data, error }) {
        if (data) {
            this.objectOptions = data.map(obj => ({
                label: obj.label,
                value: obj.value
            }));
            
            this.initializeFromParentData();
        } else if (error) {
            console.error('Error loading objects:', error);
            this.dispatchErrorEvent('Failed to load Salesforce objects: ' + this.getErrorMessage(error));
        }
    }
    
    // Initialize with existing values when editing (only once)
    async initializeFromParentData() {
        if (!this.isInitialized && this.initialSelectedObject && this.objectOptions.length > 0) {
            this.selectedObject = this.initialSelectedObject;
            this.selectedRecordType = this.initialSelectedRecordType || '';
            this.selectedRecordTypeName = this.initialSelectedRecordTypeName || '';
            this.formName = this.initialFormName || '';
            
            if (this.selectedObject) {
                await this.loadRecordTypes();
                
                if (this.initialSelectedRecordType) {
                    this.selectedRecordType = this.initialSelectedRecordType;
                    this.selectedRecordTypeName = this.initialSelectedRecordTypeName;
                }
            }
            
            this.isInitialized = true;
        }
    }
    
    async handleObjectChange(event) {
        this.selectedObject = event.detail.value;
        this.resetRecordTypeData();
        
        if (this.selectedObject) {
            await this.loadRecordTypes();
        }
    }
    
    handleRecordTypeChange(event) {
        this.selectedRecordType = event.detail.value;
        
        const selectedOption = this.recordTypeOptions.find(option => option.value === this.selectedRecordType);
        if (selectedOption) {
            this.selectedRecordTypeName = selectedOption.label;
            this.selectedRecordTypeDescription = selectedOption.description;
        }
    }
    
    // Load record types for selected object and auto-select default
    async loadRecordTypes() {
        this.isLoadingRecordTypes = true;
        
        try {
            const recordTypes = await getObjectRecordTypes({ objectName: this.selectedObject });
            
            if (recordTypes && recordTypes.length > 0) {
                this.recordTypeOptions = recordTypes.map(rt => ({
                    label: rt.label,
                    value: rt.value,
                    description: rt.description,
                    isDefault: rt.isDefault
                }));
                
                // Auto-select default record type
                const defaultRecordType = this.recordTypeOptions.find(rt => rt.isDefault);
                if (defaultRecordType) {
                    this.selectedRecordType = defaultRecordType.value;
                    this.selectedRecordTypeName = defaultRecordType.label;
                    this.selectedRecordTypeDescription = defaultRecordType.description;
                }
                
                this.showRecordTypeSelector = true;
            } else {
                // Object has no record types, use Master
                this.showRecordTypeSelector = false;
                this.selectedRecordType = '';
                this.selectedRecordTypeName = 'Master';
            }
            
        } catch (error) {
            console.error('Error loading record types:', error);
            this.dispatchErrorEvent('Failed to load record types: ' + this.getErrorMessage(error));
        } finally {
            this.isLoadingRecordTypes = false;
        }
    }
    
    handleFormNameChange(event) {
        this.formName = event.target.value;
    }
    
    // Validate selections and notify parent component
    handleContinue() {
        if (!this.selectedObject) {
            this.dispatchErrorEvent('Please select an object to continue');
            return;
        }
        
        if (this.showRecordTypeSelector && !this.selectedRecordType) {
            this.dispatchErrorEvent('Please select a record type to continue');
            return;
        }
        
        if (!this.formName || this.formName.trim() === '') {
            this.dispatchErrorEvent('Please enter a form name to continue');
            return;
        }
        
        const selectedEvent = new CustomEvent('objectselected', {
            detail: {
                objectName: this.selectedObject,
                recordTypeId: this.selectedRecordType,
                recordTypeName: this.selectedRecordTypeName || 'Master',
                formName: this.formName.trim()
            }
        });
        this.dispatchEvent(selectedEvent);
    }
    
    resetRecordTypeData() {
        this.recordTypeOptions = [];
        this.selectedRecordType = '';
        this.selectedRecordTypeName = '';
        this.selectedRecordTypeDescription = '';
        this.showRecordTypeSelector = false;
    }
    
    get canContinue() {
        if (!this.selectedObject) return false;
        if (this.showRecordTypeSelector && !this.selectedRecordType) return false;
        if (!this.formName || this.formName.trim() === '') return false;
        return true;
    }
    
    get isDisabled() {
        return !this.canContinue;
    }
    
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