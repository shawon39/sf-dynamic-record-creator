// dynamicCreatorWithDropdown.js
import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getAllCreateableObjects from '@salesforce/apex/DynamicObjectService.getAllCreateableObjects';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';

export default class DynamicCreatorWithDropdown extends LightningElement {
    @track objectOptions = [];
    @track selectedObject;
    @track recordTypeId;
    @track fieldsArray = [];
    @track filledFields = new Set();

    // Load dropdown options on init
    @wire(getAllCreateableObjects)
    wiredObjects({ data, error }) {
        if (data) {
            this.objectOptions = data.map(o => ({
                label: o.label,
                value: o.value
            }));
        } else if (error) {
            console.error('Error loading objects', error);
            this.showToast('Error', 'Failed to load objects: ' + error.body?.message, 'error');
        }
    }

    // When user picks an object, reset state and fetch its metadata
    handleObjectChange(event) {
        this.selectedObject = event.detail.value;
        this.filledFields.clear();
        // getObjectInfo wire (below) will fire because selectedObject changed
    }

    // Wire adapter to fetch object metadata automatically
    @wire(getObjectInfo, { objectApiName: '$selectedObject' })
    wiredInfo({ data, error }) {
        if (data) {
            // Default RecordTypeId
            this.recordTypeId = data.defaultRecordTypeId;
            // All createable & updateable fields
            this.fieldsArray = Object.values(data.fields)
                .filter(f => f.createable && f.updateable && !f.customRestricted)
                .map(f => ({ apiName: f.apiName }));
        } else if (error) {
            console.error('Error loading metadata', error);
            this.fieldsArray = [];
            this.showToast('Error', 'Failed to load object metadata: ' + error.body?.message, 'error');
        }
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

    handleFieldChange(evt) {
        const fieldName = evt.target.fieldName;
        const value = evt.target.value;
        
        if (value != null && value !== '') {
            this.filledFields.add(fieldName);
        } else {
            this.filledFields.delete(fieldName);
        }
        // Trigger reactivity
        this.filledFields = new Set(this.filledFields);
    }

    handleSuccess(evt) {
        const recordId = evt.detail.id;
        console.log(`${this.selectedObject} created: ${recordId}`);
        this.showToast('Success', `${this.selectedObject} record created successfully!`, 'success');
        
        // Reset form
        this.selectedObject = '';
        this.filledFields.clear();
        this.fieldsArray = [];
    }

    handleError(evt) {
        console.error('Create error', evt.detail);
        this.showToast('Error', 'Failed to create record: ' + evt.detail.message, 'error');
    }

    showToast(title, message, variant) {
        const evt = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant
        });
        this.dispatchEvent(evt);
    }
} 