import { LightningElement, track, wire, api } from 'lwc';
import getAllSalesforceObjects from '@salesforce/apex/ObjectService.getAllSalesforceObjects';
import getObjectRecordTypes from '@salesforce/apex/ObjectService.getObjectRecordTypes';

export default class ObjectSelector extends LightningElement {
    // API properties for receiving data from parent
    @api initialSelectedObject;
    @api initialSelectedRecordType;
    @api initialSelectedRecordTypeName;
    
    @track objectOptions = [];
    @track selectedObject = '';
    @track recordTypeOptions = [];
    @track selectedRecordType = '';
    @track selectedRecordTypeName = '';
    @track selectedRecordTypeDescription = '';
    @track showRecordTypeSelector = false;
    
    // Loading states
    @track isLoadingObjects = false;
    @track isLoadingRecordTypes = false;
    
    // Track if component has been initialized
    @track isInitialized = false;
    
    // Wire Salesforce Objects
    @wire(getAllSalesforceObjects)
    wiredObjects({ data, error }) {
        if (data) {
            this.objectOptions = data.map(obj => ({
                label: obj.label,
                value: obj.value
            }));
            
            // Initialize with existing data if available
            this.initializeFromParentData();
        } else if (error) {
            console.error('Error loading objects:', error);
            this.dispatchErrorEvent('Failed to load Salesforce objects: ' + this.getErrorMessage(error));
        }
    }
    
    // Initialize component with data from parent
    async initializeFromParentData() {
        if (!this.isInitialized && this.initialSelectedObject && this.objectOptions.length > 0) {
            this.selectedObject = this.initialSelectedObject;
            this.selectedRecordType = this.initialSelectedRecordType || '';
            this.selectedRecordTypeName = this.initialSelectedRecordTypeName || '';
            
            if (this.selectedObject) {
                await this.loadRecordTypes();
                
                // Set record type after loading options
                if (this.initialSelectedRecordType) {
                    this.selectedRecordType = this.initialSelectedRecordType;
                    this.selectedRecordTypeName = this.initialSelectedRecordTypeName;
                }
            }
            
            this.isInitialized = true;
        }
    }
    
    // Object selection handler
    async handleObjectChange(event) {
        this.selectedObject = event.detail.value;
        this.resetRecordTypeData();
        
        if (this.selectedObject) {
            await this.loadRecordTypes();
        }
    }
    
    // Record type selection handler
    handleRecordTypeChange(event) {
        this.selectedRecordType = event.detail.value;
        
        const selectedOption = this.recordTypeOptions.find(option => option.value === this.selectedRecordType);
        if (selectedOption) {
            this.selectedRecordTypeName = selectedOption.label;
            this.selectedRecordTypeDescription = selectedOption.description;
        }
    }
    
    // Load record types for selected object
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
                
                // Auto-select default record type if available
                const defaultRecordType = this.recordTypeOptions.find(rt => rt.isDefault);
                if (defaultRecordType) {
                    this.selectedRecordType = defaultRecordType.value;
                    this.selectedRecordTypeName = defaultRecordType.label;
                    this.selectedRecordTypeDescription = defaultRecordType.description;
                }
                
                this.showRecordTypeSelector = true;
            } else {
                // No record types available
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
    
    // Continue to next step
    handleContinue() {
        if (!this.selectedObject) {
            this.dispatchErrorEvent('Please select an object to continue');
            return;
        }
        
        if (this.showRecordTypeSelector && !this.selectedRecordType) {
            this.dispatchErrorEvent('Please select a record type to continue');
            return;
        }
        
        // Dispatch event with selected data
        const selectedEvent = new CustomEvent('objectselected', {
            detail: {
                objectName: this.selectedObject,
                recordTypeId: this.selectedRecordType,
                recordTypeName: this.selectedRecordTypeName || 'Master'
            }
        });
        this.dispatchEvent(selectedEvent);
    }
    
    // Reset record type data
    resetRecordTypeData() {
        this.recordTypeOptions = [];
        this.selectedRecordType = '';
        this.selectedRecordTypeName = '';
        this.selectedRecordTypeDescription = '';
        this.showRecordTypeSelector = false;
    }
    
    // Validation
    get canContinue() {
        if (!this.selectedObject) return false;
        if (this.showRecordTypeSelector && !this.selectedRecordType) return false;
        return true;
    }
    
    get isDisabled() {
        return !this.canContinue;
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