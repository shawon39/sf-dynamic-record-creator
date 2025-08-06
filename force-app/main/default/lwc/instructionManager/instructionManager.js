import { LightningElement, api, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';
import getInstructionsForAnalysis from '@salesforce/apex/InstructionManagerService.getInstructionsForAnalysis';
import saveInstructions from '@salesforce/apex/InstructionManagerService.saveInstructions';
import deleteInstruction from '@salesforce/apex/InstructionManagerService.deleteInstruction';

export default class InstructionManager extends LightningElement {
    @api recordId; // Dynamic_Field_Analysis__c record ID
    
    @track instructions = [];
    @track availableFields = [];
    @track objectName = '';
    @track fieldOptions = [];
    @track isLoading = true;
    @track hasUnsavedChanges = false;
    
    nextStepNumber = 1;
    nextTempId = 1;
    wiredInstructionsResult;

    @wire(getInstructionsForAnalysis, { analysisId: '$recordId' })
    wiredInstructions(result) {
        this.wiredInstructionsResult = result;
        if (result.data) {
            console.log('Wired instructions data:', result.data);
            this.processInstructionsData(result.data);
            this.isLoading = false;
        } else if (result.error) {
            console.error('Error loading instructions:', result.error);
            this.showToast('Error', 'Failed to load instructions: ' + result.error.body?.message, 'error');
            this.isLoading = false;
        }
    }

    processInstructionsData(data) {
        this.objectName = data.objectName || '';
        this.availableFields = data.availableFields || [];
        
        // Create field options for dual listbox
        this.fieldOptions = this.availableFields.map(field => ({
            label: field,
            value: field
        }));

        // Process instructions
        this.instructions = (data.instructions || []).map((inst, index) => ({
            ...inst,
            isEditing: false,
            isFirst: index === 0,
            isLast: index === data.instructions.length - 1,
            originalData: { ...inst } // Store original for cancel functionality
        }));

        this.nextStepNumber = this.instructions.length > 0 
            ? Math.max(...this.instructions.map(i => i.stepNumber)) + 1 
            : 1;
    }

    handleAddStep() {
        const newInstruction = {
            id: 'temp_' + this.nextTempId++,
            stepNumber: this.nextStepNumber++,
            text: '',
            fields: [],
            isEditing: true,
            isNew: true,
            isFirst: this.instructions.length === 0,
            isLast: true
        };

        // Update isLast for existing instructions
        this.instructions = this.instructions.map(inst => ({
            ...inst,
            isLast: false
        }));

        this.instructions = [...this.instructions, newInstruction];
        this.hasUnsavedChanges = true;
    }

    handleEditStep(event) {
        const stepId = event.target.dataset.id;
        this.instructions = this.instructions.map(inst => ({
            ...inst,
            isEditing: inst.id === stepId,
            originalData: inst.id === stepId ? { ...inst } : inst.originalData
        }));
    }

    handleInstructionTextChange(event) {
        const stepId = event.target.dataset.id;
        const newText = event.target.value;
        
        this.instructions = this.instructions.map(inst => 
            inst.id === stepId ? { ...inst, text: newText } : inst
        );
        this.hasUnsavedChanges = true;
    }

    handleFieldSelectionChange(event) {
        const stepId = event.target.dataset.id;
        const selectedFields = event.detail.value;
        
        this.instructions = this.instructions.map(inst => 
            inst.id === stepId ? { ...inst, fields: selectedFields } : inst
        );
        this.hasUnsavedChanges = true;
    }

    handleSaveStep(event) {
        const stepId = event.target.dataset.id;
        const instruction = this.instructions.find(inst => inst.id === stepId);
        
        if (!instruction.text.trim()) {
            this.showToast('Error', 'Instruction text is required', 'error');
            return;
        }

        this.instructions = this.instructions.map(inst => ({
            ...inst,
            isEditing: inst.id === stepId ? false : inst.isEditing,
            originalData: inst.id === stepId ? { ...inst } : inst.originalData
        }));
    }

    handleCancelEdit(event) {
        const stepId = event.target.dataset.id;
        const instruction = this.instructions.find(inst => inst.id === stepId);
        
        if (instruction.isNew) {
            // Remove new instruction
            this.instructions = this.instructions.filter(inst => inst.id !== stepId);
            this.nextStepNumber--;
        } else {
            // Restore original data
            this.instructions = this.instructions.map(inst => 
                inst.id === stepId ? { ...inst.originalData, isEditing: false } : inst
            );
        }
        
        this.updatePositionFlags();
    }

    handleMoveStep(event) {
        const stepId = event.target.dataset.id;
        const direction = event.detail.value;
        const currentIndex = this.instructions.findIndex(inst => inst.id === stepId);
        
        if (direction === 'moveup' && currentIndex > 0) {
            this.swapInstructions(currentIndex, currentIndex - 1);
        } else if (direction === 'movedown' && currentIndex < this.instructions.length - 1) {
            this.swapInstructions(currentIndex, currentIndex + 1);
        }
        
        this.hasUnsavedChanges = true;
    }

    swapInstructions(index1, index2) {
        const newInstructions = [...this.instructions];
        [newInstructions[index1], newInstructions[index2]] = [newInstructions[index2], newInstructions[index1]];
        
        // Update step numbers
        newInstructions[index1].stepNumber = index1 + 1;
        newInstructions[index2].stepNumber = index2 + 1;
        
        this.instructions = newInstructions;
        this.updatePositionFlags();
    }

    handleDeleteStep(event) {
        const stepId = event.target.dataset.id;
        const instruction = this.instructions.find(inst => inst.id === stepId);
        
        if (instruction.isNew) {
            // Just remove from list
            this.instructions = this.instructions.filter(inst => inst.id !== stepId);
        } else {
            // Mark for deletion and remove from UI
            this.deleteInstructionFromDB(stepId);
        }
        
        this.reorderStepNumbers();
        this.updatePositionFlags();
        this.hasUnsavedChanges = true;
    }

    async deleteInstructionFromDB(instructionId) {
        try {
            await deleteInstruction({ instructionId: instructionId });
            this.instructions = this.instructions.filter(inst => inst.id !== instructionId);
            this.showToast('Success', 'Instruction deleted successfully', 'success');
        } catch (error) {
            console.error('Error deleting instruction:', error);
            this.showToast('Error', 'Failed to delete instruction: ' + error.body?.message, 'error');
        }
    }

    reorderStepNumbers() {
        this.instructions = this.instructions.map((inst, index) => ({
            ...inst,
            stepNumber: index + 1
        }));
        this.nextStepNumber = this.instructions.length + 1;
    }

    updatePositionFlags() {
        this.instructions = this.instructions.map((inst, index) => ({
            ...inst,
            isFirst: index === 0,
            isLast: index === this.instructions.length - 1
        }));
    }

    async handleSaveAll() {
        try {
            this.isLoading = true;
            
            const instructionsToSave = this.instructions.map(inst => ({
                id: inst.isNew ? null : inst.id,
                analysisId: this.recordId,
                stepNumber: inst.stepNumber,
                text: inst.text,
                fields: inst.fields
            }));
            
            await saveInstructions({ 
                analysisId: this.recordId,
                instructions: instructionsToSave 
            });
            
            this.hasUnsavedChanges = false;
            this.showToast('Success', 'Instructions saved successfully', 'success');
            
            // Refresh the wired data
            await refreshApex(this.wiredInstructionsResult);
            
        } catch (error) {
            console.error('Error saving instructions:', error);
            this.showToast('Error', 'Failed to save instructions: ' + error.body?.message, 'error');
        } finally {
            this.isLoading = false;
        }
    }

    handleCancelAll() {
        // Refresh the wired data to revert changes
        refreshApex(this.wiredInstructionsResult);
        this.hasUnsavedChanges = false;
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