import { LightningElement, api, track } from 'lwc';

export default class InstructionBuilder extends LightningElement {
    @api selectedObject;
    @api selectedFields;
    
    // API property for receiving existing instructions from parent
    @api initialInstructions;
    
    @track instructions = [];
    @track fieldOptionsForInstructions = [];
    nextStepNumber = 1;
    nextTempId = 1;
    
    // Track if component has been initialized
    @track isInitialized = false;
    
    connectedCallback() {
        this.initializeFieldOptions();
        this.initializeFromParentData();
    }
    
    initializeFieldOptions() {
        if (this.selectedFields && this.selectedFields.length > 0) {
            this.fieldOptionsForInstructions = this.selectedFields.map(field => ({
                label: field,
                value: field
            }));
        }
    }
    
    // Initialize component with existing instructions from parent
    initializeFromParentData() {
        if (!this.isInitialized && this.initialInstructions && this.initialInstructions.length > 0) {
            this.instructions = this.initialInstructions.map(instruction => ({
                id: 'temp_' + this.nextTempId++,
                stepNumber: instruction.stepNumber,
                text: instruction.text,
                fields: instruction.fields || [],
                isEditing: false
            }));
            
            // Update next step number based on existing instructions
            this.nextStepNumber = Math.max(...this.instructions.map(inst => inst.stepNumber)) + 1;
            
            this.isInitialized = true;
        }
    }
    
    handleAddInstruction() {
        const newInstruction = {
            id: 'temp_' + this.nextTempId++,
            stepNumber: this.nextStepNumber++,
            text: '',
            fields: [],
            isEditing: true
        };
        
        this.instructions = [...this.instructions, newInstruction];
    }
    
    handleSaveInstruction(event) {
        const instructionId = event.target.dataset.id;
        const instructionText = this.template.querySelector(`[data-instruction-id="${instructionId}"]`).value;
        const relatedFields = this.template.querySelector(`[data-fields-id="${instructionId}"]`).value;
        
        if (!instructionText.trim()) {
            this.dispatchErrorEvent('Instruction text cannot be empty');
            return;
        }
        
        this.instructions = this.instructions.map(instruction => {
            if (instruction.id === instructionId) {
                return {
                    ...instruction,
                    text: instructionText.trim(),
                    fields: relatedFields || [],
                    isEditing: false
                };
            }
            return instruction;
        });
    }
    
    handleEditInstruction(event) {
        const instructionId = event.target.dataset.id;
        
        this.instructions = this.instructions.map(instruction => {
            if (instruction.id === instructionId) {
                return {
                    ...instruction,
                    isEditing: true
                };
            }
            return instruction;
        });
    }
    
    handleDeleteInstruction(event) {
        const instructionId = event.target.dataset.id;
        
        this.instructions = this.instructions.filter(instruction => instruction.id !== instructionId);
        
        // Renumber steps
        this.instructions = this.instructions.map((instruction, index) => {
            return {
                ...instruction,
                stepNumber: index + 1
            };
        });
        
        this.nextStepNumber = this.instructions.length + 1;
    }
    
    handleMoveUp(event) {
        const instructionId = event.target.dataset.id;
        const currentIndex = this.instructions.findIndex(inst => inst.id === instructionId);
        
        if (currentIndex > 0) {
            const instructions = [...this.instructions];
            [instructions[currentIndex - 1], instructions[currentIndex]] = [instructions[currentIndex], instructions[currentIndex - 1]];
            
            // Renumber steps
            this.instructions = instructions.map((instruction, index) => {
                return {
                    ...instruction,
                    stepNumber: index + 1
                };
            });
        }
    }
    
    handleMoveDown(event) {
        const instructionId = event.target.dataset.id;
        const currentIndex = this.instructions.findIndex(inst => inst.id === instructionId);
        
        if (currentIndex < this.instructions.length - 1) {
            const instructions = [...this.instructions];
            [instructions[currentIndex], instructions[currentIndex + 1]] = [instructions[currentIndex + 1], instructions[currentIndex]];
            
            // Renumber steps
            this.instructions = instructions.map((instruction, index) => {
                return {
                    ...instruction,
                    stepNumber: index + 1
                };
            });
        }
    }
    
    handleContinue() {
        // Validate that all instructions are saved (not in editing mode)
        const unsavedInstructions = this.instructions.filter(inst => inst.isEditing);
        if (unsavedInstructions.length > 0) {
            this.dispatchErrorEvent('Please save all instructions before continuing');
            return;
        }
        
        // Prepare clean instruction data (remove UI-specific properties)
        const cleanInstructions = this.instructions.map(instruction => ({
            stepNumber: instruction.stepNumber,
            text: instruction.text,
            fields: instruction.fields
        }));
        
        // Dispatch event with instructions
        const instructionsEvent = new CustomEvent('instructionscreated', {
            detail: {
                instructions: cleanInstructions
            }
        });
        this.dispatchEvent(instructionsEvent);
    }
    
    handleGoBack() {
        const backEvent = new CustomEvent('goback');
        this.dispatchEvent(backEvent);
    }
    
    handleSkip() {
        // Continue without instructions
        const instructionsEvent = new CustomEvent('instructionscreated', {
            detail: {
                instructions: []
            }
        });
        this.dispatchEvent(instructionsEvent);
    }
    
    // Computed properties
    get hasInstructions() {
        return this.instructions && this.instructions.length > 0;
    }
    
    get instructionCount() {
        return this.instructions ? this.instructions.length : 0;
    }
    
    get canContinue() {
        // Can continue if no instructions or all instructions are saved
        return this.instructions.every(inst => !inst.isEditing);
    }
    
    get isContinueDisabled() {
        return !this.canContinue;
    }
    
    // Utility methods
    dispatchErrorEvent(message) {
        const errorEvent = new CustomEvent('error', {
            detail: { message }
        });
        this.dispatchEvent(errorEvent);
    }
}